import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { anonymizeTeacherData } from './anonymizeTeacherData';
import { hashForLog } from '../lib/hash';

/**
 * 사용자 탈퇴 처리 — 소프트 삭제 (onCall)
 *
 * 처리 순서:
 * 1. 호출자 uid 검증
 * 2. users/{uid}.deleted_at = 현재 시각 기록 (소프트 삭제)
 * 3. 역할이 teacher인 경우 작성 숙제·공지를 익명 처리
 *
 * 실제 계정 완전 삭제는 cleanupDeletedUsers 스케줄러가 30일 후 처리
 */
export const deleteUser = onCall({ region: 'asia-northeast3' }, async (request) => {
  // 인증되지 않은 호출 차단
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다');
  }

  const uid = request.auth.uid;
  const db = admin.firestore();

  // 사용자 문서 조회 — 역할 확인용
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', '사용자 정보를 찾을 수 없어요');
  }

  const userData = userSnap.data()!;

  // 이미 탈퇴 처리된 경우 중복 처리 방지 (멱등성)
  if (userData.deleted_at) {
    throw new HttpsError('already-exists', '이미 탈퇴 처리된 계정이에요');
  }

  // 소프트 삭제 — deleted_at 기록
  await db.collection('users').doc(uid).update({
    deleted_at: admin.firestore.Timestamp.now(),
  });

  // 선생님인 경우 작성 숙제·공지 익명 처리
  if (userData.role === 'teacher') {
    try {
      await anonymizeTeacherData(db, uid);
    } catch (e) {
      // 익명화 실패는 탈퇴 자체를 막지 않음 — 오류 로깅 후 계속 진행
      logger.error('[deleteUser] 선생님 데이터 익명화 실패', {
        uidHash: hashForLog(uid),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logger.info('[deleteUser] 사용자 소프트 삭제 완료', {
    uidHash: hashForLog(uid),
    role: userData.role,
  });
  return { success: true };
});
