import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
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

    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 noticeId 이벤트가 2회 이상 트리거돼도 알림은 1회만 발송되도록
    // notification_sent 플래그를 트랜잭션으로 선점한다.
    // 알림 발송 중 실패하더라도 중복 발송보다 누락이 덜 치명적이라는 판단.
    const noticeRef = db.collection('notices').doc(noticeId);
    const shouldProcess = await db.runTransaction(async (tx) => {
      const snap = await tx.get(noticeRef);
      if (!snap.exists) return false;
      if (snap.data()?.notification_sent === true) return false;
      tx.update(noticeRef, { notification_sent: true });
      return true;
    });
    if (!shouldProcess) {
      logger.info('[noticeAlert] 중복 호출 — 알림 발송 건너뜀', { noticeId });
      return;
    }

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
    // notice-detail 화면은 useLocalSearchParams 로 noticeId 키를 읽음
    // (id 로 보내면 화면이 noticeId 가드에 걸려 무한 로딩 발생)
    const deepLink = `/(app)/common/notice-detail?noticeId=${noticeId}`;

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

      // 공지 알림 OFF 설정 시 건너뜀
      if (user.notif_prefs?.notice === false) continue;

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

    logger.info('[noticeAlert] 알림 처리 완료', {
      noticeId,
      notificationCount: batch.length,
    });
  }
);
