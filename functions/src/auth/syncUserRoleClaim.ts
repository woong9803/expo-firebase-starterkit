import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Firestore users/{uid} 문서가 생성·변경될 때
 * role 필드를 Firebase Auth Custom Claim으로 자동 동기화.
 *
 * Custom Claim이 있어야 Cloud Function에서 권한 체크 가능.
 */
export const syncUserRoleClaim = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;

  // 문서가 삭제된 경우 클레임 제거
  if (!after?.exists) {
    await admin.auth().setCustomUserClaims(uid, {});
    return;
  }

  const data = after.data() as { role?: string; academy_id?: string } | undefined;
  if (!data?.role) return;

  // role + academy_id를 Custom Claim으로 설정
  await admin.auth().setCustomUserClaims(uid, {
    role: data.role,
    academy_id: data.academy_id ?? null,
  });
});

/**
 * 현재 로그인한 사용자가 Firestore의 최신 role을 Custom Claim에 반영 요청.
 * 기존에 가입한 유저(Custom Claim 미설정 상태)가 호출하면 즉시 동기화됨.
 * 클라이언트는 응답 후 getIdToken(true)로 토큰 갱신 필요.
 */
export const refreshMyClaim = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다');
  }

  const uid = request.auth.uid;
  const snap = await admin.firestore().collection('users').doc(uid).get();

  if (!snap.exists) {
    throw new HttpsError('not-found', '사용자 정보를 찾을 수 없습니다');
  }

  const data = snap.data() as { role?: string; academy_id?: string };
  if (!data.role) {
    throw new HttpsError('failed-precondition', 'role이 설정되지 않은 계정입니다');
  }

  await admin.auth().setCustomUserClaims(uid, {
    role: data.role,
    academy_id: data.academy_id ?? null,
  });

  return { role: data.role };
});
