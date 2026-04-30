import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { hashForLog } from '../lib/hash';

/**
 * 탈퇴한 선생님의 작성 데이터를 익명 처리한다
 *
 * 대상:
 * - homeworks.created_by === uid → 'deleted_user'로 교체
 * - notices.created_by   === uid → 'deleted_user'로 교체
 *
 * batch를 사용하여 다중 쓰기를 원자적으로 처리
 * 500개 제한 초과 시 청크로 나눠 처리
 */
export async function anonymizeTeacherData(
  db: admin.firestore.Firestore,
  uid: string
): Promise<void> {
  await anonymizeCollection(db, 'homeworks', uid);
  await anonymizeCollection(db, 'notices', uid);
  logger.info('[anonymizeTeacherData] 선생님 데이터 익명화 완료', {
    uidHash: hashForLog(uid),
  });
}

/**
 * 특정 컬렉션에서 created_by === uid 인 문서를 'deleted_user'로 일괄 업데이트
 */
async function anonymizeCollection(
  db: admin.firestore.Firestore,
  collectionName: string,
  uid: string
): Promise<void> {
  const snap = await db
    .collection(collectionName)
    .where('created_by', '==', uid)
    .get();

  if (snap.empty) return;

  // batch 500개 제한 대응 — 청크로 나눠 처리
  const BATCH_SIZE = 500;
  const chunks: admin.firestore.QueryDocumentSnapshot[][] = [];

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    chunks.push(snap.docs.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.update(doc.ref, { created_by: 'deleted_user' });
    });
    await batch.commit();
  }
}
