import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { sendFcmNotification } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 선생님이 미제출 학생에게 수동으로 숙제 알림을 보내는 callable 함수
 * 호출: sendHomeworkReminderPush({ hwId, studentUid })
 */
export const sendHomeworkReminderPush = onCall(async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const { hwId, studentUid } = request.data as { hwId: string; studentUid: string };
  if (!hwId || !studentUid) {
    throw new HttpsError('invalid-argument', 'hwId와 studentUid가 필요합니다.');
  }

  const db = admin.firestore();

  // 호출자 역할 검증 — 선생님 또는 admin만 허용
  const callerUid = request.auth.uid;
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError('not-found', '호출자 정보를 찾을 수 없습니다.');
  }
  const caller = callerDoc.data()!;
  if (caller.role !== 'teacher' && caller.role !== 'admin') {
    throw new HttpsError('permission-denied', '선생님만 알림을 보낼 수 있습니다.');
  }

  // 숙제 정보 조회
  const hwDoc = await db.collection('homeworks').doc(hwId).get();
  if (!hwDoc.exists) {
    throw new HttpsError('not-found', '숙제를 찾을 수 없습니다.');
  }
  const hw = hwDoc.data()!;

  // 선생님인 경우 담당 반 소속인지 확인 (admin은 학원 전체 접근 가능)
  if (caller.role === 'teacher') {
    const assignedClassIds: string[] = caller.assigned_class_ids ?? [];
    if (!assignedClassIds.includes(hw.class_id)) {
      throw new HttpsError('permission-denied', '담당 반의 알림만 보낼 수 있습니다.');
    }
  }

  // 반 → 학원 ID 조회
  const classDoc = await db.collection('classes').doc(hw.class_id).get();
  if (!classDoc.exists) {
    throw new HttpsError('not-found', '반 정보를 찾을 수 없습니다.');
  }
  const academyId = classDoc.data()!.academy_id as string;

  // 학생 정보 조회
  const studentDoc = await db.collection('users').doc(studentUid).get();
  if (!studentDoc.exists) return { success: true };
  const student = studentDoc.data()!;

  const deepLink = `/(app)/(student)/homework-submit?hwId=${hwId}`;

  // 숙제 알림 OFF 설정 시 건너뜀
  if (student.notif_prefs?.homework === false) return { success: true };

  // 학생에게 알림 발송
  await sendFcmNotification({
    academyId,
    targetUid: studentUid,
    fcmToken: student.fcm_token ?? '',
    title: NOTIFICATION_MESSAGES.homeworkReminderManual.title(hw.title),
    body: NOTIFICATION_MESSAGES.homeworkReminderManual.body,
    type: 'homework_due',
    deepLink,
  });

  // 학생의 학부모에게도 알림 발송
  const parentsSnap = await db
    .collection('users')
    .where('role', '==', 'parent')
    .where('children', 'array-contains', studentUid)
    .get();

  for (const parentDoc of parentsSnap.docs) {
    const parent = parentDoc.data();
    // 숙제 알림 OFF 설정 시 건너뜀
    if (parent.notif_prefs?.homework === false) continue;
    await sendFcmNotification({
      academyId,
      targetUid: parentDoc.id,
      fcmToken: parent.fcm_token ?? '',
      title: NOTIFICATION_MESSAGES.homeworkReminderParent.title(hw.title),
      body: NOTIFICATION_MESSAGES.homeworkReminderParent.body(student.name),
      type: 'homework_due',
      deepLink: `/(app)/(parent)/index`,
    });
  }

  console.log(`[homeworkReminderPush] hwId=${hwId}, studentUid=${studentUid}`);
  return { success: true };
});
