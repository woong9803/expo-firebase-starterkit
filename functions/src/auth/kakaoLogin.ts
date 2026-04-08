import { onCall, HttpsError } from 'firebase-functions/v2/https';

// 카카오 액세스 토큰을 Firebase Custom Token으로 교환
// 클라이언트에서 signInWithCustomToken()으로 Firebase 로그인에 사용
export const kakaoLogin = onCall(async (request) => {
  // 구현은 TASK 107에서 완성
  throw new HttpsError('unimplemented', 'TASK 107에서 구현 예정');
});

export default kakaoLogin;
