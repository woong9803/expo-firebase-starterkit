import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 마감 전날 알림 스케줄러 (매일 09:00 KST)
 * 내일 마감인 숙제의 미제출 학생들에게 알림 발송
 *
 * 멱등성 보장: homework 문서의 due_reminder_sent_date 필드로 중복 발송 방지
 */
export const sendHomeworkDueReminder = onSchedule(
  { schedule: 'every day 00:00', timeZone: 'Asia/Seoul' },
  async () => {
    const db = admin.firestore();

    // 내일 날짜 범위 계산 (KST 기준)
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(now.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const todayStr = now.toISOString().split('T')[0]; // 멱등성 체크용 날짜 키

    // 내일 마감인 숙제 조회
    const hwSnap = await db
      .collection('homeworks')
      .where('due_date', '>=', admin.firestore.Timestamp.fromDate(tomorrowStart))
      .where('due_date', '<=', admin.firestore.Timestamp.fromDate(tomorrowEnd))
      .get();

    if (hwSnap.empty) return;

    const batch: SendFcmParams[] = [];

    for (const hwDoc of hwSnap.docs) {
      const hw = hwDoc.data();

      // 멱등성: 이미 오늘 발송한 숙제는 건너뜀
      if (hw.due_reminder_sent_date === todayStr) continue;

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

      // 제출한 학생 uid 목록
      const submissionsSnap = await db
        .collection('homeworks')
        .doc(hwDoc.id)
        .collection('submissions')
        .get();
      const submittedUids = new Set(submissionsSnap.docs.map((d) => d.id));

      // 미제출 학생 필터링 — fcm_token 없어도 인박스 저장은 항상 진행
      for (const studentDoc of studentsSnap.docs) {
        if (submittedUids.has(studentDoc.id)) continue;
        const student = studentDoc.data();

        batch.push({
          academyId,
          targetUid: studentDoc.id,
          fcmToken: student.fcm_token ?? '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
          title: NOTIFICATION_MESSAGES.homeworkDueReminder.title(hw.title),
          body: NOTIFICATION_MESSAGES.homeworkDueReminder.body,
          type: 'homework_due',
          deepLink: `/(app)/(student)/homework`,
        });
      }

      // 멱등성 필드 업데이트 — 오늘 날짜 저장
      await hwDoc.ref.update({ due_reminder_sent_date: todayStr });
    }

    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    logger.info('[homeworkDueReminder] 알림 처리 완료', { notificationCount: batch.length });
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
