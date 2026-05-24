import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 공지 미확인자에게 재알림 발송 (admin 전용 onCall)
 *
 * 흐름:
 *   1) 호출자 인증 + admin 역할 검증
 *   2) notice 문서 조회 → 호출자 학원과 일치 확인
 *   3) target_roles + target_class_ids 필터로 audience 산출
 *   4) read_by에 없는 사용자만 추출 (학부모는 자녀 class_id 매칭)
 *   5) 24시간 내 재발송 차단(last_resent_at 쿨다운)
 *   6) sendFcmBatch로 FCM + 인박스 저장
 *   7) notice 문서에 last_resent_at, last_resent_count 기록
 *
 * 응답: { sent: number, skipped: number }
 */
// region: 전역 옵션(asia-northeast3) 상속
export const resendNoticeToUnread = onCall(
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요해요.');
    }

    const noticeId = (request.data as { noticeId?: string })?.noticeId;
    if (!noticeId || typeof noticeId !== 'string') {
      throw new HttpsError('invalid-argument', 'noticeId가 필요해요.');
    }

    const db = admin.firestore();

    // 1) 호출자 검증 — admin만 허용
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', '계정 정보를 찾을 수 없어요.');
    }
    const caller = callerSnap.data()!;
    if (caller.role !== 'admin') {
      throw new HttpsError('permission-denied', '관리자만 사용할 수 있어요.');
    }
    const callerAcademyId: string | undefined = caller.academy_id;
    if (!callerAcademyId) {
      throw new HttpsError('failed-precondition', '학원 정보가 없어요.');
    }

    // 2) 공지 문서 조회
    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeSnap = await noticeRef.get();
    if (!noticeSnap.exists) {
      throw new HttpsError('not-found', '공지를 찾을 수 없어요.');
    }
    const notice = noticeSnap.data()!;
    if (notice.academy_id !== callerAcademyId) {
      throw new HttpsError('permission-denied', '다른 학원의 공지에는 접근할 수 없어요.');
    }

    // 3) 24시간 쿨다운 — 무분별한 반복 발송 방지
    const lastResentAt = notice.last_resent_at as admin.firestore.Timestamp | undefined;
    if (lastResentAt) {
      const diffMs = Date.now() - lastResentAt.toMillis();
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;
      if (diffMs < COOLDOWN_MS) {
        const hoursLeft = Math.ceil((COOLDOWN_MS - diffMs) / (60 * 60 * 1000));
        throw new HttpsError(
          'resource-exhausted',
          `재알림은 24시간에 한 번만 가능해요. (약 ${hoursLeft}시간 후 다시 시도)`
        );
      }
    }

    // 4) audience 산출 — target_roles + target_class_ids 적용
    const targetRoles: string[] = notice.target_roles ?? [];
    const targetClassIds: string[] = notice.target_class_ids ?? [];
    const readBy: string[] = notice.read_by ?? [];
    const readSet = new Set(readBy);

    let usersQuery = db.collection('users')
      .where('academy_id', '==', callerAcademyId)
      .where('is_active', '==', true);
    if (targetRoles.length > 0) {
      usersQuery = usersQuery.where('role', 'in', targetRoles);
    } else {
      // 빈 배열이면 학생+학부모만 — 선생님/admin은 공지 수신 대상이 아님
      usersQuery = usersQuery.where('role', 'in', ['student', 'parent']);
    }

    const usersSnap = await usersQuery.get();
    if (usersSnap.empty) {
      return { sent: 0, skipped: 0 };
    }

    // 학부모 audience를 위해 자녀 class_id 맵 미리 조회 (반 필터가 있을 때만)
    let studentClassByUid = new Map<string, string | null>();
    if (targetClassIds.length > 0) {
      const studentsSnap = await db.collection('users')
        .where('academy_id', '==', callerAcademyId)
        .where('role', '==', 'student')
        .where('is_active', '==', true)
        .get();
      studentsSnap.docs.forEach((d) => {
        studentClassByUid.set(d.id, (d.data().class_id ?? null) as string | null);
      });
    }

    // 5) 미확인자만 추출
    const noticeTitle: string = notice.title ?? '공지';
    // notice-detail 화면은 useLocalSearchParams 로 noticeId 키를 읽음
    // (id 로 보내면 화면이 noticeId 가드에 걸려 무한 로딩 발생)
    const deepLink = `/(app)/common/notice-detail?noticeId=${noticeId}`;

    const batch: SendFcmParams[] = [];
    let skipped = 0;

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      const uid = userDoc.id;

      // 이미 읽음 → 건너뜀
      if (readSet.has(uid)) continue;

      // 삭제된 계정 → 건너뜀
      if (u.deleted_at) continue;

      // 반 필터
      if (targetClassIds.length > 0) {
        const role = u.role as string;
        let userClassId: string | null = null;
        if (role === 'student') {
          userClassId = (u.class_id ?? null) as string | null;
        } else if (role === 'parent') {
          // 첫 자녀 반 기준 (다자녀는 첫 자녀)
          const firstChild = ((u.children ?? []) as string[])[0];
          userClassId = firstChild ? (studentClassByUid.get(firstChild) ?? null) : null;
        }
        if (!userClassId || !targetClassIds.includes(userClassId)) {
          skipped++;
          continue;
        }
      }

      // 공지 알림 OFF — 건너뜀
      if (u.notif_prefs?.notice === false) {
        skipped++;
        continue;
      }

      batch.push({
        academyId: callerAcademyId,
        targetUid: uid,
        fcmToken: (u.fcm_token ?? '') as string,
        title: NOTIFICATION_MESSAGES.noticeReminder.title(noticeTitle),
        body: NOTIFICATION_MESSAGES.noticeReminder.body,
        type: 'notice',
        deepLink,
      });
    }

    // 6) 발송
    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    // 7) 쿨다운 기록
    await noticeRef.update({
      last_resent_at: admin.firestore.FieldValue.serverTimestamp(),
      last_resent_count: batch.length,
    });

    logger.info('[resendNoticeToUnread] 재알림 발송 완료', {
      noticeId,
      academyId: callerAcademyId,
      sent: batch.length,
      skipped,
    });

    return { sent: batch.length, skipped };
  }
);
