import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { sendFcmNotification } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

interface AttendanceRecord {
  uid: string;       // 학생 uid
  status: string;    // 'present' | 'late' | 'absent'
  name: string;      // 학생 이름
}

/**
 * 선생님이 출결 저장 시 학부모에게 알림을 보내는 callable 함수
 * 결석/지각 학생의 학부모에게만 발송
 * 호출: sendAttendanceAlertPush({ academyId, records: [{ uid, status, name }] })
 */
export const sendAttendanceAlertPush = onCall(async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const { academyId, records } = request.data as {
    academyId: string;
    records: AttendanceRecord[];
  };

  if (!academyId || !records?.length) return { success: true };

  const db = admin.firestore();

  // 호출자 역할 및 학원 소속 검증 — 선생님/admin이고 같은 학원 소속인지 확인
  const callerUid = request.auth.uid;
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError('not-found', '호출자 정보를 찾을 수 없습니다.');
  }
  const caller = callerDoc.data()!;
  if (caller.role !== 'teacher' && caller.role !== 'admin') {
    throw new HttpsError('permission-denied', '선생님만 출결 알림을 보낼 수 있습니다.');
  }
  if (caller.academy_id !== academyId) {
    throw new HttpsError('permission-denied', '다른 학원의 출결 알림은 보낼 수 없습니다.');
  }

  // 결석 또는 지각 학생만 필터링
  const targets = records.filter(
    (r) => r.status === 'absent' || r.status === 'late'
  );
  if (targets.length === 0) return { success: true };

  for (const target of targets) {
    const { uid: studentUid, status, name: studentName } = target;

    // 해당 학생의 학부모 조회
    const parentsSnap = await db
      .collection('users')
      .where('role', '==', 'parent')
      .where('children', 'array-contains', studentUid)
      .get();

    for (const parentDoc of parentsSnap.docs) {
      const parent = parentDoc.data();
      // 출결 알림 OFF 설정 시 건너뜀
      if (parent.notif_prefs?.attendance === false) continue;
      await sendFcmNotification({
        academyId,
        targetUid: parentDoc.id,
        fcmToken: parent.fcm_token ?? '',
        title: NOTIFICATION_MESSAGES.attendanceAlert.title(studentName),
        body: status === 'absent'
          ? NOTIFICATION_MESSAGES.attendanceAlert.bodyAbsent
          : NOTIFICATION_MESSAGES.attendanceAlert.bodyLate,
        type: 'attendance',
        deepLink: `/(app)/(parent)/index`,
      });
    }
  }

  logger.info('[attendanceAlertPush] 알림 발송 완료', {
    academyId,
    targetCount: targets.length,
  });
  return { success: true };
});
