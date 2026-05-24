import * as admin from 'firebase-admin';
import { randomInt } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { checkRateLimit } from '../lib/rateLimit';
import { hashForLog } from '../lib/hash';

/**
 * 선생님·원장이 학생 계정을 직접 생성 (가상 이메일 자동 발급)
 *
 * 호출 가능 역할: teacher, admin
 *
 * 요청 데이터:
 * - name: string — 학생 이름
 * - classId: string — 소속 반 ID
 * - academyId: string — 소속 학원 ID
 * - birthDate?: string — 생년월일 (YYYY-MM-DD, 선택)
 *
 * 반환 데이터 (인쇄용/캡처용 카드):
 * - name, email, tempPassword, linkCode
 *
 * 보안 검증 순서:
 * 1. 인증 여부
 * 2. 입력 타입·형식 검증
 * 3. 호출자 Firestore 문서 조회 (탈퇴 유저·역할 재검증)
 * 4. 호출자 학원 = 요청 학원 (타 학원 무단 생성 차단)
 * 5. 반 존재 + 해당 학원 소속 확인
 * 6. 학원 상태 (pending/active만 허용, rejected·deleted 차단)
 * 7. pending 학원의 경우 학생 3명 제한 (파일럿 정책)
 */
export const createStudentAccount = onCall(async (request) => {
  // ── 1단계: 인증 확인 ───────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다');
  }
  const callerUid = request.auth.uid;

  // ── Rate Limit (uid 기반) ──────────────────────────
  // P2-7 (2026-04-23): 선생님이 학생 계정 대량 생성 → Auth 쿼터 소진 방어
  //   1시간 윈도우에 30명 — 신학기 일괄 등록(정상) 커버 + 스팸 차단
  //   이후 검증(3~7단계)도 DB read 가 많아 호출 빈도 자체 제한이 효과적
  await checkRateLimit({
    key: `createStudentAccount_uid_${callerUid}`,
    windowMs: 60 * 60 * 1000,
    maxAttempts: 30,
    label: 'createStudentAccount.uid',
    message: '학생 등록을 너무 많이 시도했습니다. 잠시 후 다시 시도해주세요.',
  });

  // ── 2단계: 입력 검증 ───────────────────────────────
  const { name, classId, academyId, birthDate, guardianConsent } = request.data as {
    name?: unknown;
    classId?: unknown;
    academyId?: unknown;
    birthDate?: unknown;
    guardianConsent?: unknown;
  };

  if (
    typeof name !== 'string' ||
    typeof classId !== 'string' ||
    typeof academyId !== 'string'
  ) {
    throw new HttpsError('invalid-argument', '이름, 반 ID, 학원 ID는 필수 문자열입니다');
  }

  // 이름 trim 후 길이 검증 (공백만 입력 차단)
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 30) {
    throw new HttpsError('invalid-argument', '이름은 1~30자여야 합니다');
  }

  // birthDate 형식 검증 (YYYY-MM-DD, 선택 필드)
  if (birthDate !== undefined && birthDate !== null) {
    if (
      typeof birthDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    ) {
      throw new HttpsError(
        'invalid-argument',
        '생년월일 형식이 잘못되었습니다 (YYYY-MM-DD)'
      );
    }
  }

  // ── 2-1단계: PIPA 제22조 — 만 14세 미만 보호자 동의 검증 ───────
  // birthDate 가 주어졌고 만 14세 미만이면 guardianConsent === true 필수
  // (클라이언트 UI 가드 우회 차단 — 서버 측 최종 확인)
  let isUnder14Confirmed = false;
  if (typeof birthDate === 'string') {
    const ageYears = computeAgeYears(birthDate);
    if (ageYears !== null && ageYears < 14) {
      isUnder14Confirmed = true;
      if (guardianConsent !== true) {
        throw new HttpsError(
          'failed-precondition',
          '만 14세 미만 학생은 보호자(법정대리인) 동의가 필요합니다'
        );
      }
    }
  }

  const db = admin.firestore();

  // ── 3단계: 호출자 Firestore 문서 조회 ─────────────
  // custom claim 대신 Firestore를 soT(source of truth)로 사용
  // → 역할 변경 직후 claim sync 지연, 탈퇴 처리 반영 즉시 반영
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists) {
    logger.warn('[createStudentAccount] 호출자 users 문서 없음', { callerUidHash: hashForLog(callerUid) });
    throw new HttpsError('permission-denied', '사용자 정보를 찾을 수 없습니다');
  }
  const caller = callerSnap.data() as {
    role?: string;
    academy_id?: string;
    deleted_at?: admin.firestore.Timestamp | null;
  };

  // 탈퇴 처리된 유저 차단
  if (caller.deleted_at) {
    logger.warn('[createStudentAccount] 탈퇴 유저 호출', { callerUidHash: hashForLog(callerUid) });
    throw new HttpsError('permission-denied', '탈퇴한 계정입니다');
  }

  // 역할 재검증 — teacher 또는 admin만 허용
  if (caller.role !== 'teacher' && caller.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      '선생님·원장만 학생 계정을 생성할 수 있습니다'
    );
  }

  // ── 4단계: 학원 소속 교차 검증 (핵심 방어선) ────────
  // 호출자의 academy_id와 요청 academyId가 다르면 차단 → 타 학원 학생 생성 공격 차단
  if (caller.academy_id !== academyId) {
    logger.warn('[createStudentAccount] 학원 불일치', {
      callerUidHash: hashForLog(callerUid),
      callerAcademyHash: hashForLog(caller.academy_id ?? ''),
      requestedAcademyHash: hashForLog(academyId),
    });
    throw new HttpsError(
      'permission-denied',
      '다른 학원에 학생을 생성할 수 없습니다'
    );
  }

  // ── 5단계: 반 존재·소속 확인 ──────────────────────
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) {
    throw new HttpsError('not-found', '존재하지 않는 반입니다');
  }
  const classData = classSnap.data() as { academy_id?: string };
  if (classData.academy_id !== academyId) {
    logger.warn('[createStudentAccount] 반이 타 학원 소속', {
      classIdHash: hashForLog(classId),
      classAcademyHash: hashForLog(classData.academy_id ?? ''),
      requestedAcademyHash: hashForLog(academyId),
    });
    throw new HttpsError(
      'permission-denied',
      '해당 학원의 반이 아닙니다'
    );
  }

  // ── 6단계: 학원 상태 확인 ──────────────────────────
  const academySnap = await db.collection('academies').doc(academyId).get();
  if (!academySnap.exists) {
    throw new HttpsError('not-found', '존재하지 않는 학원입니다');
  }
  const academy = academySnap.data() as { status?: string; plan?: string };
  if (academy.status !== 'active' && academy.status !== 'pending') {
    throw new HttpsError(
      'permission-denied',
      '비활성 학원에서는 학생을 생성할 수 없습니다'
    );
  }

  // ── 7단계: 학생 수 제한 (pending 정책 + 플랜별 제한) ──
  // 기준 (domain-terms.md / security.md):
  //   pending: 3명 — 파일럿 검증 단계
  //   free:    30명 — 미결제 기본 (starter 기준 보수 설정)
  //   trial:   무제한 — 14일 체험 (Pro 동등)
  //   starter: 30명
  //   standard: 100명
  //   pro:     무제한
  // active 상태에서 plan 필드가 없으면 free 로 간주
  const STUDENT_LIMIT: Record<string, number> = {
    free: 30,
    trial: Number.MAX_SAFE_INTEGER,
    starter: 30,
    standard: 100,
    pro: Number.MAX_SAFE_INTEGER,
  };

  let limit: number;
  let limitLabel: string;
  if (academy.status === 'pending') {
    limit = 3;
    limitLabel = '승인 전';
  } else {
    const plan = academy.plan ?? 'free';
    limit = STUDENT_LIMIT[plan] ?? STUDENT_LIMIT.free;
    limitLabel = plan;
  }

  if (Number.isFinite(limit) && limit < Number.MAX_SAFE_INTEGER) {
    const studentCount = await db
      .collection('users')
      .where('academy_id', '==', academyId)
      .where('role', '==', 'student')
      .count()
      .get();
    if (studentCount.data().count >= limit) {
      throw new HttpsError(
        'failed-precondition',
        academy.status === 'pending'
          ? `승인 전 학원은 학생 최대 ${limit}명까지만 생성할 수 있습니다`
          : `${limitLabel} 플랜은 학생 최대 ${limit}명까지만 등록할 수 있습니다. 상위 플랜으로 업그레이드해주세요.`
      );
    }
  }

  // ── 8단계: 학생 계정 생성 ──────────────────────────
  // 가상 이메일 생성: s_{6자리랜덤코드}@woongking.app
  const randomCode = generateRandomCode(6);
  const email = `s_${randomCode}@woongking.app`;
  // 임시 비밀번호 생성 (영숫자+특수문자 8자리)
  const tempPassword = generateTempPassword(8);
  // 학부모 연동코드 생성 (6자리 영숫자)
  const linkCode = generateRandomCode(6);

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: trimmedName,
    });

    const uid = userRecord.uid;

    await db.collection('users').doc(uid).set({
      uid,
      name: trimmedName,
      email,
      role: 'student',
      academy_id: academyId,
      class_id: classId,
      link_code: linkCode,
      children: [],
      is_active: true,
      birth_date: birthDate ?? null,
      guardian_phone: null,
      // PIPA 제22조 — 만 14세 미만 학생일 때 보호자(법정대리인) 동의 기록
      // 14세 이상이거나 birthDate 미입력이면 null
      guardian_consent_at: isUnder14Confirmed
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      guardian_consent_by: isUnder14Confirmed ? callerUid : null,
      enrollment_date: admin.firestore.FieldValue.serverTimestamp(),
      phone_number: '',
      phone_verified: false,
      deleted_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: callerUid, // 감사 추적용
    });

    logger.info('[createStudentAccount] 학생 생성 성공', {
      callerUidHash: hashForLog(callerUid),
      studentUidHash: hashForLog(uid),
      academyIdHash: hashForLog(academyId),
      classIdHash: hashForLog(classId),
    });

    return {
      name: trimmedName,
      email,
      tempPassword,
      linkCode,
      uid,
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };

    logger.error('[createStudentAccount] 계정 생성 실패', {
      callerUidHash: hashForLog(callerUid),
      code: err.code,
      message: err.message,
    });

    if (err.code === 'auth/email-already-exists') {
      // 재시도 시 새 랜덤 코드로 이메일 충돌 회피 가능 — 클라이언트에 재시도 유도
      throw new HttpsError('already-exists', '이메일 충돌이 발생했습니다. 다시 시도해주세요');
    }

    throw new HttpsError(
      'internal',
      '학생 계정 생성 중 오류가 발생했습니다'
    );
  }
});

// ─── 내부 유틸리티 ────────────────────────────────────────────────

/** 영숫자 랜덤 코드 생성 (대문자) — crypto.randomInt 사용으로 암호학적 안전성 확보 */
const generateRandomCode = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
};

/** 임시 비밀번호 생성 (영소문자+숫자+특수문자 혼합) — crypto.randomInt 사용 */
const generateTempPassword = (length: number): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
};

/**
 * 만 나이 계산 (서버용)
 * - YYYY-MM-DD 형식 검증 + 실제 Date 객체 검증
 * - 생일이 안 지났으면 -1 (한국 만 나이 기준)
 * - 형식 오류 시 null
 *
 * 클라이언트 lib/age.ts 와 동일 로직 — 의존성 분리 위해 서버 측 자체 구현
 */
const computeAgeYears = (birthDate: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [yStr, mStr, dStr] = birthDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  const now = new Date();
  if (y < 1900 || y > now.getFullYear()) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  // 실제 유효성 (예: 2025-02-30 차단)
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }

  let age = now.getFullYear() - y;
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  if (todayM < m || (todayM === m && todayD < d)) {
    age -= 1;
  }
  return age;
};
