import * as admin from 'firebase-admin';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export interface SendFcmParams {
  academyId: string;                    // Pro 플랜 여부 확인용
  targetUid: string;                    // 알림 수신자 uid
  fcmToken: string;                     // Expo Push 토큰 (필드명은 호환 유지)
  title: string;
  body: string;
  type: 'homework_created' | 'homework_feedback' | 'homework_due' | 'attendance' | 'notice';
  deepLink?: string;                    // 알림 클릭 시 이동할 화면 경로
}

// Expo Push API 응답 타입 — 토큰 무효 등 에러 케이스 식별용
interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data: ExpoPushTicket | ExpoPushTicket[];
  errors?: { code: string; message: string }[];
}

// ─────────────────────────────────────────────
// 유료 플랜 체크 (free 플랜이면 푸시 발송 건너뜀 — starter/standard/pro/trial 모두 허용)
// ─────────────────────────────────────────────

async function checkProPlan(academyId: string): Promise<boolean> {
  const snap = await admin.firestore().collection('academies').doc(academyId).get();
  if (!snap.exists) return false;
  const plan = snap.data()?.plan as string | undefined;
  // free 플랜이 아니면(pro, trial 등) 푸시 발송 허용
  return plan !== 'free';
}

// ─────────────────────────────────────────────
// Expo Push API 호출 헬퍼
// ─────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// 단일 메시지 형태 (Expo가 받는 페이로드)
interface ExpoPushMessage {
  to: string;                                       // ExponentPushToken[xxx]
  title: string;
  body: string;
  data?: Record<string, string>;                    // 클라이언트에서 받을 페이로드 (deep_link 등)
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;                               // Android 채널
}

/**
 * Expo Push Service로 메시지 전송
 * - 한 번에 최대 100개까지 배치 발송 가능
 * - ExponentPushToken[xxx] 형태가 아니면 무시 (잘못된 토큰)
 */
async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // 잘못된 토큰 형식 필터링 — Expo는 ExponentPushToken[...] 형태만 받음
  const valid = messages.filter((m) => m.to.startsWith('ExponentPushToken['));
  if (valid.length === 0) {
    console.warn('[sendExpoPush] 유효한 Expo Push 토큰이 없음');
    return;
  }

  // Expo Push API는 100건 단위 배치 권장
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error(`[sendExpoPush] HTTP ${res.status}:`, await res.text());
        continue;
      }

      const json = (await res.json()) as ExpoPushResponse;

      // 티켓별 에러 로깅 — DeviceNotRegistered 등 토큰 무효 케이스 식별
      const tickets = Array.isArray(json.data) ? json.data : [json.data];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          const errCode = ticket.details?.error ?? 'unknown';
          console.error(
            `[sendExpoPush] 티켓 에러 (token: ${chunk[idx]?.to}): ${errCode} - ${ticket.message}`,
          );
        }
      });
    } catch (err) {
      console.error(`[sendExpoPush] fetch 실패 (chunk ${i}~${i + chunk.length})`, err);
    }
  }
}

// ─────────────────────────────────────────────
// 단건 푸시 발송 + Firestore 히스토리 저장
// ─────────────────────────────────────────────

export async function sendFcmNotification(params: SendFcmParams): Promise<void> {
  const { academyId, targetUid, fcmToken, title, body, type, deepLink } = params;

  const isPro = await checkProPlan(academyId);

  // Pro 플랜이고 토큰이 있을 때만 푸시 발송
  if (isPro && fcmToken) {
    await sendExpoPush([
      {
        to: fcmToken,
        title,
        body,
        sound: 'default',
        data: deepLink ? { deep_link: deepLink } : undefined,
      },
    ]);
  }

  // 플랜 관계없이 Firestore 알림 히스토리는 항상 저장 (인박스 기능)
  await admin.firestore().collection('notifications').add({
    target_uid: targetUid,
    type,
    title,
    body,
    is_read: false,
    deep_link: deepLink ?? null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
// 다건 배치 발송 (트리거 함수에서 여러 명에게 한 번에 발송 시 사용)
// ─────────────────────────────────────────────

export async function sendFcmBatch(items: SendFcmParams[]): Promise<void> {
  if (items.length === 0) return;

  // Pro 플랜 여부를 academyId별로 캐싱하여 중복 조회 방지
  const planCache = new Map<string, boolean>();
  const getProStatus = async (academyId: string): Promise<boolean> => {
    if (planCache.has(academyId)) return planCache.get(academyId)!;
    const isPro = await checkProPlan(academyId);
    planCache.set(academyId, isPro);
    return isPro;
  };

  // Pro 플랜이고 토큰이 있는 항목만 모아서 Expo Push로 발송
  const pushTargets: ExpoPushMessage[] = [];
  for (const item of items) {
    const isPro = await getProStatus(item.academyId);
    if (isPro && item.fcmToken) {
      pushTargets.push({
        to: item.fcmToken,
        title: item.title,
        body: item.body,
        sound: 'default',
        data: item.deepLink ? { deep_link: item.deepLink } : undefined,
      });
    }
  }

  await sendExpoPush(pushTargets);

  // Firestore 알림 히스토리 배치 저장 — 500건 단위로 나눠 commit
  const db = admin.firestore();
  const CHUNK_SIZE = 500;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const item of chunk) {
      const ref = db.collection('notifications').doc(); // 자동 ID
      batch.set(ref, {
        target_uid: item.targetUid,
        type: item.type,
        title: item.title,
        body: item.body,
        is_read: false,
        deep_link: item.deepLink ?? null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}
