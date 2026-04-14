import * as admin from 'firebase-admin';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export interface SendFcmParams {
  academyId: string;                    // Pro 플랜 여부 확인용
  targetUid: string;                    // 알림 수신자 uid
  fcmToken: string;                     // 수신자 FCM 토큰 (없으면 빈 문자열 전달 시 FCM만 건너뜀)
  title: string;
  body: string;
  type: 'homework_feedback' | 'homework_due' | 'attendance' | 'notice';
  deepLink?: string;                    // 알림 클릭 시 이동할 화면 경로
}

// ─────────────────────────────────────────────
// Pro 플랜 체크 (free 플랜이면 FCM 발송 건너뜀)
// ─────────────────────────────────────────────

async function checkProPlan(academyId: string): Promise<boolean> {
  const snap = await admin.firestore().collection('academies').doc(academyId).get();
  if (!snap.exists) return false;
  const plan = snap.data()?.plan as string | undefined;
  // free 플랜이 아니면(pro, trial) FCM 발송 허용
  return plan !== 'free';
}

// ─────────────────────────────────────────────
// 단건 FCM 발송 + Firestore 히스토리 저장
// ─────────────────────────────────────────────

export async function sendFcmNotification(params: SendFcmParams): Promise<void> {
  const { academyId, targetUid, fcmToken, title, body, type, deepLink } = params;

  const isPro = await checkProPlan(academyId);

  // Pro 플랜이고 FCM 토큰이 있을 때만 푸시 발송
  if (isPro && fcmToken) {
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        // 딥링크를 data 페이로드로 전달 (클라이언트에서 라우팅 처리)
        data: deepLink ? { deep_link: deepLink } : {},
      });
    } catch (err) {
      // FCM 발송 실패 시 로그만 남기고 Firestore 저장은 항상 진행
      console.error(`[sendFcm] FCM 발송 실패 (uid: ${targetUid})`, err);
    }
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

  // FCM 다건 발송 — Pro 플랜이고 토큰이 있는 항목만 모아서 multicast
  const fcmTargets: { token: string; title: string; body: string; deepLink?: string }[] = [];
  for (const item of items) {
    const isPro = await getProStatus(item.academyId);
    if (isPro && item.fcmToken) {
      fcmTargets.push({
        token: item.fcmToken,
        title: item.title,
        body: item.body,
        deepLink: item.deepLink,
      });
    }
  }

  // sendEachForMulticast는 최대 500건 처리 — 500개씩 chunk로 나눠 발송
  const CHUNK_SIZE = 500;
  for (let i = 0; i < fcmTargets.length; i += CHUNK_SIZE) {
    const chunk = fcmTargets.slice(i, i + CHUNK_SIZE);
    try {
      await admin.messaging().sendEachForMulticast({
        tokens: chunk.map((t) => t.token),
        notification: {
          // 배치는 첫 번째 항목의 title/body 사용 (동일 알림 유형 전제)
          title: chunk[0].title,
          body: chunk[0].body,
        },
      });
    } catch (err) {
      console.error(`[sendFcmBatch] multicast 발송 실패 (chunk ${i}~${i + chunk.length})`, err);
    }
  }

  // Firestore 알림 히스토리 배치 저장 — 500건 단위로 나눠 commit
  const db = admin.firestore();
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
