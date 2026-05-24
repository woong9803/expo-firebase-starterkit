import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { sendFcmNotification } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';
import { hashForLog } from '../lib/hash';

/**
 * 숙제 피드백 알림 트리거
 * 선생님이 제출물에 피드백(👍/💧)을 남기면 학생과 학부모에게 알림 발송
 */
export const onHomeworkFeedback = onDocumentUpdated(
  'homeworks/{hwId}/submissions/{studentUid}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // 피드백 필드가 변경되지 않았으면 무시
    if (!before || !after) return;
    if (before.feedback === after.feedback) return;
    if (!after.feedback) return; // null로 초기화된 경우 무시

    const hwId = event.params.hwId;
    const studentUid = event.params.studentUid;

    const db = admin.firestore();

    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 피드백 값으로의 중복 발송을 막기 위해 feedback_notified_for 필드로 추적.
    // 피드백이 실제로 변경된 경우(예: 👍 → 💧)에만 새 알림이 발송된다.
    const subRef = event.data!.after.ref;
    const shouldProcess = await db.runTransaction(async (tx) => {
      const snap = await tx.get(subRef);
      if (!snap.exists) return false;
      const cur = snap.data()!;
      if (cur.feedback_notified_for === cur.feedback) return false; // 같은 값 재발송 차단
      tx.update(subRef, { feedback_notified_for: cur.feedback });
      return true;
    });
    if (!shouldProcess) {
      logger.info('[homeworkFeedback] 중복 호출 — 알림 발송 건너뜀', { hwId, studentUid });
      return;
    }

    // 숙제 정보 조회
    const hwDoc = await db.collection('homeworks').doc(hwId).get();
    if (!hwDoc.exists) return;
    const hw = hwDoc.data()!;
    const academyId = await getAcademyIdByClass(db, hw.class_id);
    if (!academyId) return;

    const deepLink = `/(app)/(student)/homework-submit?hwId=${hwId}`;

    // 학생에게 알림 발송
    const studentDoc = await db.collection('users').doc(studentUid).get();
    if (studentDoc.exists) {
      const student = studentDoc.data()!;
      // 피드백 알림 OFF이면 학생에게만 건너뜀 — return이 아닌 조건부로 처리
      // (return하면 아래 학부모 알림까지 모두 차단됨)
      if (student.notif_prefs?.feedback !== false) {
        await sendFcmNotification({
          academyId,
          targetUid: studentUid,
          fcmToken: student.fcm_token ?? '',
          title: NOTIFICATION_MESSAGES.feedbackStudent.title(hw.title),
          body: NOTIFICATION_MESSAGES.feedbackStudent.body(after.feedback),
          type: 'homework_feedback',
          deepLink,
        });
      }
    }

    // 학생의 학부모에게도 알림 발송 (children 배열에 studentUid가 있는 학부모 조회)
    const parentsSnap = await db
      .collection('users')
      .where('role', '==', 'parent')
      .where('children', 'array-contains', studentUid)
      .get();

    for (const parentDoc of parentsSnap.docs) {
      const parent = parentDoc.data();
      // 피드백 알림 OFF 설정 시 건너뜀
      if (parent.notif_prefs?.feedback === false) continue;
      await sendFcmNotification({
        academyId,
        targetUid: parentDoc.id,
        fcmToken: parent.fcm_token ?? '',
        title: NOTIFICATION_MESSAGES.feedbackParent.title(hw.title),
        body: NOTIFICATION_MESSAGES.feedbackParent.body(after.feedback),
        type: 'homework_feedback',
        deepLink: `/(app)/(parent)/index`,
      });
    }

    logger.info('[homeworkFeedback] 피드백 알림 발송 완료', {
      hwId,
      studentUidHash: hashForLog(studentUid),
      feedback: after.feedback,
    });
  }
);

// 반 ID로 학원 ID 조회 헬퍼
async function getAcademyIdByClass(
  db: admin.firestore.Firestore,
  classId: string
): Promise<string | null> {
  const classDoc = await db.collection('classes').doc(classId).get();
  return classDoc.exists ? (classDoc.data()?.academy_id as string) : null;
}
