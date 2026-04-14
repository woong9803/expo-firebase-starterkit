import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 당일 미제출 학부모 알림 스케줄러 (매일 18:00 KST)
 * 오늘 마감인 숙제의 미제출 학생 학부모에게 알림 발송
 *
 * 멱등성 보장: homework 문서의 unsubmitted_alert_sent_date 필드로 중복 발송 방지
 */
export const sendUnsubmittedAlert = onSchedule(
  { schedule: 'every day 09:00', timeZone: 'Asia/Seoul' },
  async () => {
    const db = admin.firestore();

    // 오늘 날짜 범위 계산 (KST 기준)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStr = now.toISOString().split('T')[0]; // 멱등성 체크용 날짜 키

    // 오늘 마감인 숙제 조회
    const hwSnap = await db
      .collection('homeworks')
      .where('due_date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('due_date', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
      .get();

    if (hwSnap.empty) return;

    const batch: SendFcmParams[] = [];

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

      // 멱등성 필드 업데이트
      await hwDoc.ref.update({ unsubmitted_alert_sent_date: todayStr });
    }

    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    console.log(`[unsubmittedAlert] ${batch.length}건 알림 처리 완료`);
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
