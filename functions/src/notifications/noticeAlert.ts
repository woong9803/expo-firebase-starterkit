import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 공지 등록 알림 트리거
 * 새 공지가 생성되면 target_roles, target_class_ids 기준으로 대상 사용자에게 알림 발송
 */
export const onNoticeCreated = onDocumentCreated(
  'notices/{noticeId}',
  async (event) => {
    const notice = event.data?.data();
    if (!notice) return;

    const noticeId = event.params.noticeId;
    const academyId: string = notice.academy_id;
    const targetRoles: string[] = notice.target_roles ?? []; // 빈 배열 = 모두
    const targetClassIds: string[] = notice.target_class_ids ?? []; // 빈 배열 = 전체 반

    const db = admin.firestore();

    // 해당 학원의 사용자 조회
    let query = db
      .collection('users')
      .where('academy_id', '==', academyId)
      .where('is_active', '==', true);

    // 역할 필터 (빈 배열이면 전체 역할 대상)
    if (targetRoles.length > 0) {
      query = query.where('role', 'in', targetRoles);
    }

    const usersSnap = await query.get();
    if (usersSnap.empty) return;

    const batch: SendFcmParams[] = [];
    const deepLink = `/(app)/common/notice-detail?id=${noticeId}`;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      // fcm_token 없어도 인박스 저장은 항상 진행 (continue 제거)

      // 반 필터: target_class_ids가 있으면 해당 반 소속만 포함
      // 학생: class_id가 target_class_ids에 포함되는지 확인
      // 선생님/학부모: assigned_class_ids 또는 자녀 class_id 기준
      if (targetClassIds.length > 0) {
        const userClassId: string | null = user.class_id ?? null;
        const assignedClassIds: string[] = user.assigned_class_ids ?? [];

        const isInTargetClass =
          (userClassId && targetClassIds.includes(userClassId)) ||
          assignedClassIds.some((id) => targetClassIds.includes(id));

        if (!isInTargetClass) continue;
      }

      batch.push({
        academyId,
        targetUid: userDoc.id,
        fcmToken: user.fcm_token ?? '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
        title: NOTIFICATION_MESSAGES.noticeAlert.title(notice.title),
        body: NOTIFICATION_MESSAGES.noticeAlert.body,
        type: 'notice',
        deepLink,
      });
    }

    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    console.log(`[noticeAlert] noticeId=${noticeId}, ${batch.length}건 알림 처리 완료`);
  }
);
