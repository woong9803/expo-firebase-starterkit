import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 미제출 학부모 알림 스케줄러 (매시간 정각 실행)
 * 마감시간이 지난 숙제 중 아직 알림을 보내지 않은 숙제의 미제출 학생 학부모에게 알림 발송
 *
 * 멱등성 보장: homework 문서의 unsubmitted_alert_sent_date 필드로 중복 발송 방지
 */
export const sendUnsubmittedAlert = onSchedule(
  { schedule: '0 * * * *', timeZone: 'Asia/Seoul' },  // 매시간 정각 실행
  async () => {
    const db = admin.firestore();

    // 현재 시각 기준으로 마감시간이 지난 숙제 범위 계산
    const now = new Date();

    // 조회 범위: 오늘 00:00 ~ 현재 시각 (마감시간이 지난 숙제만)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now); // 현재 시각까지만 → 마감 지난 숙제만 조회

    const todayStr = now.toISOString().split('T')[0]; // 멱등성 체크용 날짜 키

    // 마감시간이 현재 이전인 숙제 조회 (오늘 내에서 이미 마감된 것만)
    const hwSnap = await db
      .collection('homeworks')
      .where('due_date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('due_date', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
      .get();

    if (hwSnap.empty) return;

    const batch: SendFcmParams[] = [];
    // 발송 완료 후 멱등성 필드를 업데이트할 숙제 문서 목록
    const docsToMark: admin.firestore.DocumentReference[] = [];

    for (const hwDoc of hwSnap.docs) {
      const hw = hwDoc.data();

      // 멱등성: 이미 오늘 발송한 숙제는 건너뜀
      if (hw.unsubmitted_alert_sent_date === todayStr) continue;

      const classId: string = hw.class_id;
      const academyId = await getAcademyIdByClass(db, classId);
      if (!academyId) continue;

      // 해당 반 학생 목록 조회
      const studentsSnap = await db
        .collection('users')
        .where('class_id', '==', classId)
        .where('role', '==', 'student')
        .where('is_active', '==', true)
        .get();

      // 이미 제출한 학생 uid 목록
      const submissionsSnap = await db
        .collection('homeworks')
        .doc(hwDoc.id)
        .collection('submissions')
        .get();
      const submittedUids = new Set(submissionsSnap.docs.map((d) => d.id));

      // 미제출 학생 필터링 → 각 학생의 학부모에게 알림
      for (const studentDoc of studentsSnap.docs) {
        if (submittedUids.has(studentDoc.id)) continue;
        const student = studentDoc.data();

        // 해당 학생의 학부모 조회
        const parentsSnap = await db
          .collection('users')
          .where('role', '==', 'parent')
          .where('children', 'array-contains', studentDoc.id)
          .get();

        // fcm_token 없어도 인박스 저장은 항상 진행
        for (const parentDoc of parentsSnap.docs) {
          const parent = parentDoc.data();
          // 숙제 알림 OFF 설정 시 건너뜀
          if (parent.notif_prefs?.homework === false) continue;

          batch.push({
            academyId,
            targetUid: parentDoc.id,
            fcmToken: parent.fcm_token ?? '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
            title: NOTIFICATION_MESSAGES.unsubmittedAlert.title(hw.title),
            body: NOTIFICATION_MESSAGES.unsubmittedAlert.body(student.name ?? '자녀'),
            type: 'homework_due',
            deepLink: `/(app)/(parent)/index`,
          });
        }
      }

      // 발송 대상에 포함된 숙제 → 나중에 멱등성 필드 업데이트
      docsToMark.push(hwDoc.ref);
    }

    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    // sendFcmBatch 성공 후 멱등성 필드 업데이트 — 실패 시 재시도 가능
    for (const ref of docsToMark) {
      await ref.update({ unsubmitted_alert_sent_date: todayStr });
    }

    logger.info('[unsubmittedAlert] 알림 처리 완료', { notificationCount: batch.length });
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
