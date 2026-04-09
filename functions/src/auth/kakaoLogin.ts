import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';

/**
 * 카카오 로그인 — 액세스 토큰을 Firebase Custom Token으로 교환
 *
 * 클라이언트 흐름:
 * 1. react-native-kakao-login으로 카카오 accessToken 획득
 * 2. 이 함수에 accessToken 전달
 * 3. 반환된 customToken으로 Firebase signInWithCustomToken() 호출
 *
 * ⚠️ KAKAO_ADMIN_KEY는 절대 클라이언트 코드에 포함하지 말 것
 */
export const kakaoLogin = onCall(async (request) => {
  const { accessToken } = request.data as { accessToken: string };

  if (!accessToken) {
    throw new HttpsError('invalid-argument', 'accessToken이 필요합니다');
  }

  try {
    // 카카오 API로 사용자 정보 조회
    const kakaoRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    const kakaoUser = kakaoRes.data as {
      id: number;
      kakao_account?: {
        email?: string;
        profile?: { nickname?: string };
      };
    };

    // 카카오 uid를 Firebase uid로 사용 (카카오 uid는 숫자 → 문자열 변환)
    const uid = `kakao:${kakaoUser.id}`;

    // Firebase Custom Token 발급
    const customToken = await admin.auth().createCustomToken(uid, {
      provider: 'kakao',
      kakaoId: kakaoUser.id,
    });

    return { customToken };
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string };

    // 카카오 API 오류
    if (err.response?.status === 401) {
      throw new HttpsError('unauthenticated', '유효하지 않은 카카오 토큰입니다');
    }

    throw new HttpsError(
      'internal',
      err.message ?? '카카오 로그인 처리 중 오류가 발생했습니다'
    );
  }
});
