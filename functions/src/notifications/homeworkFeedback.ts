import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { sendFcmNotification } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

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

    // 학생의 학부모에게도 알림 발송 (children 배열에 studentUid가 있는 학부모 조회)
    const parentsSnap = await db
      .collection('users')
      .where('role', '==', 'parent')
      .where('children', 'array-contains', studentUid)
      .get();

    for (const parentDoc of parentsSnap.docs) {
      const parent = parentDoc.data();
      await sendFcmNotification({
        academyId,
        targetUid: parentDoc.id,
        fcmToken: parent.fcm_token ?? '',
        title: NOTIFICATION_MESSAGES.feedbackParent.title(hw.title),
        body: NOTIFICATION_MESSAGES.feedbackParent.body(after.feedback),
        type: 'homework_feedback',
        deepLink: `/(app)/(parent)/index`, // 학부모는 홈으로 이동
      });
    }

    console.log(`[homeworkFeedback] hwId=${hwId}, studentUid=${studentUid}, feedback=${after.feedback}`);
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
