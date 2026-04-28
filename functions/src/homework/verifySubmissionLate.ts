import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * 숙제 제출·재제출 시 서버 시간 기준으로 is_late 재검증
 *
 * 방어 시나리오:
 * 1. 학생이 앱을 리버싱해 is_late: false로 강제 저장
 * 2. 학생이 재제출로 is_late를 false로 덮어쓰기 시도 (onCreate만으로는 방어 불가)
 * 3. 클라이언트 기기 시간 조작 — submitted_at은 serverTimestamp지만 is_late는 클라이언트 계산
 *
 * 동작:
 * - 서버 시간(request time)과 homework.due_date를 비교해 is_late 재계산
 * - 저장된 값이 다르면 교정
 * - is_late가 false → true 로 교정된 경우: users/{studentUid}.streak = 0
 *
 * onDocumentWritten은 create·update 모두 트리거 — 재제출 조작까지 방어
 * 무한 루프 방지: 이미 교정값과 같으면 조기 return
 */
export const onSubmissionCreated = onDocumentWritten(
  'homeworks/{hwId}/submissions/{studentUid}',
  async (event) => {
    const { hwId, studentUid } = event.params;

    // 삭제 이벤트는 무시 (after가 없음)
    const after = event.data?.after.data();
    if (!after) return;

    const db = admin.firestore();

    // 숙제 문서에서 마감 시간 조회
    const hwSnap = await db.collection('homeworks').doc(hwId).get();
    if (!hwSnap.exists) {
      logger.warn('[verifySubmissionLate] 숙제 문서 없음', { hwId, studentUid });
      return;
    }

    const dueDate = hwSnap.data()!.due_date as
      | admin.firestore.Timestamp
      | undefined;
    if (!dueDate) {
      logger.warn('[verifySubmissionLate] due_date 누락', { hwId });
      return;
    }

    // 서버 시간 기준 is_late 계산
    // submitted_at이 있으면 그것을, 없으면 현재 서버 시간을 기준으로
    // (submitted_at은 클라이언트가 serverTimestamp()로 기록하므로 서버 시간)
    const submittedAt = after.submitted_at as
      | admin.firestore.Timestamp
      | undefined;
    const referenceTime = submittedAt ?? admin.firestore.Timestamp.now();
    const isLateServer = referenceTime.toMillis() > dueDate.toMillis();

    // 이미 교정값과 같으면 추가 쓰기 없이 종료 (무한 루프 방지)
    if (after.is_late === isLateServer) return;

    logger.info('[verifySubmissionLate] is_late 교정', {
      hwId,
      studentUid,
      before: after.is_late,
      after: isLateServer,
    });

    // 서버 시간 기준으로 교정
    await event.data!.after.ref.update({ is_late: isLateServer });

    // is_late가 true로 교정된 경우: 클라이언트에서 올린 스트릭을 0으로 초기화
    // (마감 전 제출로 속여 스트릭을 올린 것을 되돌림)
    if (isLateServer) {
      await db.collection('users').doc(studentUid).update({ streak: 0 });
      logger.info('[verifySubmissionLate] 스트릭 초기화', { studentUid });
    }
  }
);
