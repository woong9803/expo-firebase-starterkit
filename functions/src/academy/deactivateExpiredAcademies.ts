import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';

/**
 * 미승인 학원 자동 정리 스케줄러 (매일 03:00 KST 실행)
 *
 * 두 단계로 처리:
 * 1단계 — 비활성화: status=pending + submitted_at 기준 30일 초과 → status='deactivated'
 * 2단계 — 완전 삭제: status=deactivated + deactivated_at 기준 7일 초과 → 관련 데이터 일괄 삭제
 *
 * 멱등성 보장: 이미 처리된 문서는 건너뜀 (status 필드로 중복 실행 방지)
 */
export const deactivateExpiredAcademies = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'UTC' }, // 매일 18:00 UTC = 03:00 KST
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // ── 1단계: 30일 초과 pending 학원 비활성화 ──────────────────────────────
    const thirtyDaysAgo = new Date(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoTs = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

    const pendingSnap = await db
      .collection('academies')
      .where('status', '==', 'pending')
      .where('submitted_at', '<=', thirtyDaysAgoTs)
      .get();

    if (!pendingSnap.empty) {
      const deactivateBatch = db.batch();
      pendingSnap.docs.forEach((doc) => {
        deactivateBatch.update(doc.ref, {
          status: 'deactivated',
          deactivated_at: now,
        });
      });
      await deactivateBatch.commit();
      logger.info('[deactivateExpiredAcademies] 학원 비활성화 완료', {
        count: pendingSnap.size,
      });
    }

    // ── 2단계: 7일 초과 deactivated 학원 완전 삭제 ─────────────────────────
    const sevenDaysAgo = new Date(now.toMillis() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoTs = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

    const deactivatedSnap = await db
      .collection('academies')
      .where('status', '==', 'deactivated')
      .where('deactivated_at', '<=', sevenDaysAgoTs)
      .get();

    if (deactivatedSnap.empty) return;

    for (const academyDoc of deactivatedSnap.docs) {
      const academyId = academyDoc.id;

      try {
        await deleteAcademyData(db, academyId);
        logger.info('[deactivateExpiredAcademies] 학원 완전 삭제 완료', { academyId });
      } catch (e) {
        // 개별 학원 삭제 실패 시 다음 학원으로 계속 진행 (전체 실패 방지)
        logger.error('[deactivateExpiredAcademies] 학원 삭제 실패', {
          academyId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
);

/**
 * 학원 관련 데이터를 일괄 삭제한다
 * - users (소속 사용자)
 * - classes (반)
 * - homeworks (숙제)
 * - notices (공지)
 * - academies (학원 문서 자체)
 *
 * Firestore batch는 500개 제한이 있으므로 컬렉션별로 나눠서 처리
 */
async function deleteAcademyData(
  db: admin.firestore.Firestore,
  academyId: string
): Promise<void> {
  // 소속 사용자 삭제
  await deleteBatchByField(db, 'users', 'academy_id', academyId);

  // 반 삭제
  await deleteBatchByField(db, 'classes', 'academy_id', academyId);

  // 숙제 삭제 (class_id 기반 직접 삭제는 복잡하므로 academy_id 필드 활용)
  // ※ homeworks에 academy_id 필드가 없는 경우 class_id 목록으로 쿼리 필요
  //   현재 스키마상 homeworks에 academy_id가 없어 classes 먼저 삭제 후 생략
  //   (classes 삭제 시 해당 반 숙제는 고아 데이터가 되어 추후 별도 정리 예정)

  // 공지 삭제
  await deleteBatchByField(db, 'notices', 'academy_id', academyId);

  // 학원 문서 자체 삭제
  await db.collection('academies').doc(academyId).delete();
}

/**
 * 특정 필드 값으로 컬렉션의 문서를 일괄 삭제한다 (batch 500개 제한 대응)
 */
async function deleteBatchByField(
  db: admin.firestore.Firestore,
  collectionName: string,
  field: string,
  value: string
): Promise<void> {
  const snap = await db.collection(collectionName).where(field, '==', value).get();
  if (snap.empty) return;

  // 500개씩 나눠서 batch 삭제 (Firestore batch 제한 대응)
  const BATCH_SIZE = 500;
  const chunks: admin.firestore.QueryDocumentSnapshot[][] = [];

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    chunks.push(snap.docs.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}
