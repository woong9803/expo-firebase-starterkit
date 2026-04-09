import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * 선생님이 학생 계정을 직접 생성 (가상 이메일 자동 발급)
 *
 * 호출 가능 역할: teacher만
 *
 * 요청 데이터:
 * - name: string — 학생 이름
 * - classId: string — 소속 반 ID
 * - academyId: string — 소속 학원 ID
 * - birthDate?: string — 생년월일 (YYYY-MM-DD, 선택)
 *
 * 반환 데이터 (인쇄용/캡처용 카드):
 * - name, email, tempPassword, linkCode
 */
export const createStudentAccount = onCall(async (request) => {
  // teacher 역할만 호출 가능 — 권한 체크
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다');
  }

  const callerRole = request.auth.token['role'] as string | undefined;
  if (callerRole !== 'teacher' && callerRole !== 'admin') {
    throw new HttpsError('permission-denied', '선생님만 학생 계정을 생성할 수 있습니다');
  }

  const { name, classId, academyId, birthDate } = request.data as {
    name: string;
    classId: string;
    academyId: string;
    birthDate?: string;
  };

  if (!name || !classId || !academyId) {
    throw new HttpsError('invalid-argument', '이름, 반 ID, 학원 ID는 필수입니다');
  }

  // 가상 이메일 생성: s_{6자리랜덤코드}@eduonepass.app
  const randomCode = generateRandomCode(6);
  const email = `s_${randomCode}@eduonepass.app`;

  // 임시 비밀번호 생성 (영숫자+특수문자 8자리)
  const tempPassword = generateTempPassword(8);

  // 학부모 연동코드 생성 (6자리 영숫자)
  const linkCode = generateRandomCode(6);

  try {
    // Firebase Auth 계정 생성
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
    });

    const uid = userRecord.uid;

    // Firestore users 문서 생성
    await admin.firestore().collection('users').doc(uid).set({
      uid,
      name,
      email,
      role: 'student',
      academy_id: academyId,
      class_id: classId,
      link_code: linkCode,
      children: [],
      is_active: true,
      birth_date: birthDate ?? null,
      guardian_phone: null,
      enrollment_date: admin.firestore.FieldValue.serverTimestamp(),
      phone_number: '',
      phone_verified: false,
      deleted_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 인쇄용/캡처용 카드 데이터 반환
    return {
      name,
      email,
      tempPassword,
      linkCode,
      uid,
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };

    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', '이미 존재하는 계정입니다');
    }

    throw new HttpsError(
      'internal',
      err.message ?? '학생 계정 생성 중 오류가 발생했습니다'
    );
  }
});

// ─── 내부 유틸리티 ────────────────────────────────────────────────

/** 영숫자 랜덤 코드 생성 (대문자) */
const generateRandomCode = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/** 임시 비밀번호 생성 (영소문자+숫자+특수문자 혼합) */
const generateTempPassword = (length: number): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};
