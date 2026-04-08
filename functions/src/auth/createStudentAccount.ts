import { onCall, HttpsError } from 'firebase-functions/v2/https';

// 선생님이 학생 계정을 직접 생성 (가상 이메일 자동 발급)
// 반환: { email, tempPassword, linkCode, name } (인쇄용 카드 데이터)
export const createStudentAccount = onCall(async (request) => {
  // 구현은 TASK 107에서 완성
  throw new HttpsError('unimplemented', 'TASK 107에서 구현 예정');
});

export default createStudentAccount;
