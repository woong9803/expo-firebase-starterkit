import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * pending 학원의 반 개수 1개 제한 강제 적용 (서버 측 enforcement)
 *
 * security.md 정책:
 *   - 학원 status: pending  → 학생 최대 3명, 반 1개, 선생님 초대 불가, Pro 전환 불가
 *   - 학원 status: active   → 모든 제한 해제
 *
 * Firestore Rules 만으로는 같은 academy_id 의 classes 개수를 세는 것이 불가능
 * (Rules 는 list 쿼리 결과 size 를 알 수 없음). 따라서 클라이언트 UI 가 카운트
 * 체크를 하더라도 DevTools/Firestore SDK 직접 호출로 우회될 수 있다.
 *
 * 이 트리거가 서버 측 최후 방어선:
 *  1. classes 문서 onCreate 발생
 *  2. 해당 academy 상태 확인
 *  3. pending 이면 같은 academy_id 의 classes 개수 카운트
 *  4. 2개 이상이면 **방금 생성된 문서를 즉시 삭제** (= 우회 시도 차단)
 *
 * active 학원은 제한 없음 — 카운트도 하지 않고 조기 종료.
 *
 * 멱등성: 동일 문서에 대해 트리거가 재실행돼도 결과 동일
 *   (이미 삭제된 문서면 ref.delete() 가 no-op)
 */
export const enforceClassLimitForPending = onDocumentCreated(
  'classes/{classId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const classData = snap.data();
    const academyId = classData.academy_id as string | undefined;
    if (!academyId) {
      logger.warn('[enforceClassLimit] academy_id 누락 — 문서 삭제', {
        classId: event.params.classId,
      });
      await snap.ref.delete();
      return;
    }

    const db = admin.firestore();

    // 학원 상태 조회
    const academySnap = await db.collection('academies').doc(academyId).get();
    if (!academySnap.exists) {
      logger.warn('[enforceClassLimit] 학원 문서 없음 — 반 문서 삭제', {
        academyId,
        classId: event.params.classId,
      });
      await snap.ref.delete();
      return;
    }

    const status = academySnap.data()?.status as string | undefined;

    // active 학원은 반 개수 제한 없음 — 조기 종료
    if (status === 'active') return;

    // pending/rejected/그 외 상태에서는 1개 제한 적용
    // 같은 학원의 classes 개수 카운트 (count aggregation)
    const classesCountSnap = await db
      .collection('classes')
      .where('academy_id', '==', academyId)
      .count()
      .get();
    const classCount = classesCountSnap.data().count;

    // 1개 이하면 정상 — 통과
    if (classCount <= 1) return;

    // 2개 이상 → pending 학원 정책 위반 → 방금 생성된 문서 삭제
    logger.warn(
      '[enforceClassLimit] pending 학원 반 1개 제한 위반 — 신규 문서 삭제',
      {
        academyId,
        academyStatus: status,
        classId: event.params.classId,
        classCount,
      }
    );
    await snap.ref.delete();
  }
);
