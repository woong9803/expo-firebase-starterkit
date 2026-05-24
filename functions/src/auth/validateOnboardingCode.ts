import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { checkRateLimit, getClientIp } from '../lib/rateLimit';
import { hashForLog } from '../lib/hash';

/**
 * 온보딩 코드(학원코드·반코드·연동코드) 검증 + 재시도 제한
 *
 * 방어 시나리오:
 * - 6자리 영숫자(36^6 ≈ 2.18억)는 brute force 가능한 범위
 * - Firestore 쿼리를 직접 열어두면 자동화 스캔으로 유효 코드 탐색 가능
 * - 이 함수로 래핑해 uid·IP 기반 rate limit 적용
 *
 * 호출 조건: 인증된 사용자만 (온보딩 중에도 익명 이전에 이메일/소셜 로그인 완료 상태)
 *
 * 요청:
 * - code: string (6자리 영숫자, 대문자)
 * - type: 'academy' | 'invite' | 'link'
 *
 * 반환: 타입별 정보
 * - academy: { academy_id, name, status }
 * - invite:  { class_id, academy_id, name }
 * - link:    { student_uid, name, academy_id }
 *
 * Rate Limit:
 * - uid + type 기준: 10분 윈도우, 최대 5회
 * - IP + type 기준: 10분 윈도우, 최대 20회 (uid 로테이션 공격 대응)
 */

type CodeType = 'academy' | 'invite' | 'link';

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분
const MAX_PER_UID = 5;
const MAX_PER_IP = 20;

export const validateOnboardingCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다');
  }
  const uid = request.auth.uid;

  // ── 입력 검증 ─────────────────────────────────
  const { code, type } = request.data as {
    code?: unknown;
    type?: unknown;
  };

  if (typeof code !== 'string' || typeof type !== 'string') {
    throw new HttpsError('invalid-argument', 'code와 type이 필요합니다');
  }

  // 6자리 대문자 영숫자만 허용 — 형식 다르면 조회 자체 불필요
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', '코드 형식이 올바르지 않습니다');
  }

  if (type !== 'academy' && type !== 'invite' && type !== 'link') {
    throw new HttpsError('invalid-argument', '유효하지 않은 코드 타입입니다');
  }

  const codeType = type as CodeType;
  const clientIp = getClientIp(request.rawRequest);

  // ── Rate Limit (uid + IP 이중) ────────────────
  // uid 기반 — 정상 사용자 실수 보호 (10분/5회)
  await checkRateLimit({
    key: `uid_${uid}_${codeType}`,
    windowMs: RATE_WINDOW_MS,
    maxAttempts: MAX_PER_UID,
    label: 'validateOnboardingCode.uid',
  });
  // IP 기반 — uid 로테이션 공격 대응 (10분/20회)
  if (clientIp !== 'unknown') {
    await checkRateLimit({
      key: `ip_${clientIp}_${codeType}`,
      windowMs: RATE_WINDOW_MS,
      maxAttempts: MAX_PER_IP,
      label: 'validateOnboardingCode.ip',
    });
  }

  // ── 코드별 조회 ────────────────────────────────
  const db = admin.firestore();

  if (codeType === 'academy') {
    const snap = await db
      .collection('academies')
      .where('academy_code', '==', code)
      .limit(1)
      .get();
    if (snap.empty) {
      // code 는 평문 기록 금지 — 해시만 남겨 운영 디버깅은 되되 원본 노출 차단
      logger.info('[validateOnboardingCode] 학원코드 없음', {
        uidHash: hashForLog(uid),
        codeHash: hashForLog(code),
      });
      throw new HttpsError('not-found', '존재하지 않는 학원코드입니다');
    }
    const doc = snap.docs[0];
    const academy = doc.data();

    // 선생님 가입 차단 — security.md 정책:
    //  - pending: "선생님 초대 불가" (승인 완료 후에만 합류 허용)
    //  - rejected/그 외: 비활성 학원 → 가입 자체 차단
    if (academy.status === 'pending') {
      logger.info('[validateOnboardingCode] pending 학원 선생님 가입 차단', {
        uidHash: hashForLog(uid),
        academyIdHash: hashForLog(doc.id),
      });
      throw new HttpsError(
        'failed-precondition',
        '아직 승인되지 않은 학원이에요. 원장님의 학원 승인 완료 후 가입할 수 있어요.'
      );
    }
    if (academy.status !== 'active') {
      logger.info('[validateOnboardingCode] 비활성 학원 가입 차단', {
        uidHash: hashForLog(uid),
        academyIdHash: hashForLog(doc.id),
        status: academy.status,
      });
      throw new HttpsError(
        'failed-precondition',
        '운영이 중단된 학원이에요. 원장님께 문의해주세요.'
      );
    }

    return {
      academy_id: doc.id,
      name: academy.name,
      status: academy.status,
    };
  }

  if (codeType === 'invite') {
    const snap = await db
      .collection('classes')
      .where('invite_code', '==', code)
      .limit(1)
      .get();
    if (snap.empty) {
      logger.info('[validateOnboardingCode] 반코드 없음', {
        uidHash: hashForLog(uid),
        codeHash: hashForLog(code),
      });
      throw new HttpsError('not-found', '존재하지 않는 반 코드입니다');
    }
    const doc = snap.docs[0];
    const cls = doc.data();

    // 학원 상태 체크 — rejected/비활성 학원의 반 코드는 학생 자가 가입 차단
    // pending 은 허용 (승인 전 학생 등록은 createStudentAccount 의 3명 한도로 별도 통제)
    if (cls.academy_id) {
      const academySnap = await db.collection('academies').doc(cls.academy_id).get();
      const academyStatus = academySnap.data()?.status;
      if (academyStatus !== 'active' && academyStatus !== 'pending') {
        logger.info('[validateOnboardingCode] 비활성 학원 반코드 차단', {
          uidHash: hashForLog(uid),
          academyIdHash: hashForLog(cls.academy_id),
          status: academyStatus,
        });
        throw new HttpsError(
          'failed-precondition',
          '운영이 중단된 학원의 반이에요. 선생님께 문의해주세요.'
        );
      }
    }

    return {
      class_id: doc.id,
      academy_id: cls.academy_id,
      name: cls.name,
    };
  }

  // link — 자녀 연동코드
  const snap = await db
    .collection('users')
    .where('link_code', '==', code)
    .where('role', '==', 'student')
    .limit(1)
    .get();
  if (snap.empty) {
    logger.info('[validateOnboardingCode] 연동코드 없음', {
      uidHash: hashForLog(uid),
      codeHash: hashForLog(code),
    });
    throw new HttpsError('not-found', '존재하지 않는 연동코드입니다');
  }
  const doc = snap.docs[0];
  const student = doc.data();
  // 탈퇴 처리된 학생은 연동 차단
  if (student.deleted_at) {
    throw new HttpsError('not-found', '탈퇴한 계정입니다');
  }

  // 학원 상태 체크 — rejected/비활성 학원 학생의 연동 차단
  if (student.academy_id) {
    const academySnap = await db.collection('academies').doc(student.academy_id).get();
    const academyStatus = academySnap.data()?.status;
    if (academyStatus !== 'active' && academyStatus !== 'pending') {
      logger.info('[validateOnboardingCode] 비활성 학원 연동코드 차단', {
        uidHash: hashForLog(uid),
        academyIdHash: hashForLog(student.academy_id),
        status: academyStatus,
      });
      throw new HttpsError(
        'failed-precondition',
        '운영이 중단된 학원이에요. 자녀의 학원으로 문의해주세요.'
      );
    }
  }

  return {
    student_uid: doc.id,
    name: student.name,
    academy_id: student.academy_id,
  };
});

