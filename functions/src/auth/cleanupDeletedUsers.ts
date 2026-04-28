import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

/**
 * 탈퇴 유저 완전 삭제 스케줄러 (매일 03:00 KST 실행)
 *
 * deleted_at 기준 30일 초과된 유저를 완전히 삭제한다:
 * 1. Firebase Auth 계정 삭제
 * 2. Firestore users/{uid} 문서 삭제
 * 3. 학생인 경우 — homeworks/submissions/{uid} 서브컬렉션 삭제
 * 4. Firebase Storage — 유저 관련 파일 삭제 (homeworks/{uid}/ 경로)
 *
 * 멱등성 보장: deleted_at 필드가 있는 문서만 처리
 *             이미 Auth에서 삭제된 계정은 오류 무시하고 Firestore만 정리
 */
export const cleanupDeletedUsers = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'UTC' }, // 매일 18:00 UTC = 03:00 KST
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // deleted_at 기준 30일 초과된 유저 조회
    const thirtyDaysAgo = new Date(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoTs = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

    const deletedUsersSnap = await db
      .collection('users')
      .where('deleted_at', '<=', thirtyDaysAgoTs)
      .get();

    if (deletedUsersSnap.empty) {
      console.log('[cleanupDeletedUsers] 삭제 대상 유저 없음');
      return;
    }

    console.log(`[cleanupDeletedUsers] ${deletedUsersSnap.size}명 완전 삭제 시작`);

    for (const userDoc of deletedUsersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();

      try {
        // 1. Firebase Auth 계정 삭제
        // 이미 삭제된 경우 auth/user-not-found 오류가 발생하므로 무시
        try {
          await admin.auth().deleteUser(uid);
        } catch (authErr: unknown) {
          if ((authErr as { code?: string }).code !== 'auth/user-not-found') {
            throw authErr; // 예상치 못한 오류는 다시 throw
          }
          // user-not-found는 이미 삭제된 경우 — 정상 처리로 간주
        }

        // 2. 학생인 경우 — 제출 이력(submissions) 서브컬렉션 삭제
        if (userData.role === 'student') {
          await deleteStudentSubmissions(db, uid);
        }

        // 3. Firebase Storage — 유저 업로드 파일 삭제 (개인정보 파기)
        // 숙제 사진 경로: homeworks/{studentUid}/...
        await deleteUserStorageFiles(uid);

        // 4. Firestore users/{uid} 문서 삭제
        await db.collection('users').doc(uid).delete();

        console.log(`[cleanupDeletedUsers] 유저 ${uid} (role: ${userData.role}) 완전 삭제 완료`);
      } catch (e) {
        // 개별 유저 삭제 실패 시 다음 유저로 계속 진행 (전체 실패 방지)
        console.error(`[cleanupDeletedUsers] 유저 ${uid} 삭제 실패:`, e);
      }
    }
  }
);

/**
 * Firebase Storage에서 유저 관련 파일을 삭제한다
 * 숙제 사진 경로: homeworks/{uid}/ 하위 전체
 * 파일이 없거나 접근 실패 시 오류를 무시하고 계속 진행 (멱등성)
 */
async function deleteUserStorageFiles(uid: string): Promise<void> {
  try {
    const bucket = admin.storage().bucket();
    // homeworks/{uid}/ 경로의 모든 파일 삭제
    const [files] = await bucket.getFiles({ prefix: `homeworks/${uid}/` });
    if (files.length === 0) return;

    await Promise.all(files.map((file) => file.delete().catch(() => {})));
    console.log(`[cleanupDeletedUsers] Storage 파일 ${files.length}개 삭제 완료 (uid: ${uid})`);
  } catch (e) {
    // Storage 삭제 실패는 치명적이지 않음 — 로깅 후 계속 진행
    console.warn(`[cleanupDeletedUsers] Storage 파일 삭제 실패 (uid: ${uid}):`, e);
  }
}

/**
 * 학생 탈퇴 시 본인이 제출한 모든 숙제 제출물 서브컬렉션을 삭제한다
 * homeworks/{hwId}/submissions/{studentUid} 구조
 */
async function deleteStudentSubmissions(
  db: admin.firestore.Firestore,
  studentUid: string
): Promise<void> {
  // 모든 숙제 문서를 조회한 뒤 해당 학생의 submission 서브컬렉션 삭제
  const hwSnap = await db.collection('homeworks').get();
  if (hwSnap.empty) return;

  const batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;

  for (const hwDoc of hwSnap.docs) {
    const submissionRef = db
      .collection('homeworks')
      .doc(hwDoc.id)
      .collection('submissions')
      .doc(studentUid);

    const submissionSnap = await submissionRef.get();
    if (!submissionSnap.exists) continue;

    batch.delete(submissionRef);
    batchCount++;

    // batch 500개 제한 초과 시 중간 커밋
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }
}
