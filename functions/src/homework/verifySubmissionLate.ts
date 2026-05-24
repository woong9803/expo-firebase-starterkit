import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * 숙제 제출·재제출 시 서버 시간 기준으로 is_late 재검증 + 스트릭 갱신
 *
 * 방어 시나리오:
 * 1. 학생이 앱을 리버싱해 is_late: false로 강제 저장
 * 2. 학생이 재제출로 is_late를 false로 덮어쓰기 시도 (onCreate만으로는 방어 불가)
 * 3. 클라이언트 기기 시간 조작 — submitted_at은 serverTimestamp지만 is_late는 클라이언트 계산
 * 4. 학생이 직접 users/{uid}.streak 필드를 임의 값으로 갱신 시도
 *
 * 동작:
 * - 서버 시간(submitted_at)과 homework.due_date를 비교해 is_late 재계산
 * - 저장된 값이 다르면 교정
 * - 신규 제출(create) 시 streak 갱신:
 *     · 마감 전(is_late false) → users/{studentUid}.streak += 1
 *     · 지각(is_late true)     → users/{studentUid}.streak  = 0
 * - 재제출(update)은 streak 변경 없음 — 첫 제출에만 영향
 *
 * onDocumentWritten은 create·update 모두 트리거 — 재제출 조작까지 방어
 * 무한 루프 방지: is_late 값이 이미 같으면 update 생략, streak 갱신은 create 한정
 */
export const onSubmissionCreated = onDocumentWritten(
  'homeworks/{hwId}/submissions/{studentUid}',
  async (event) => {
    const { hwId, studentUid } = event.params;

    // 삭제 이벤트는 무시 (after가 없음)
    const after = event.data?.after.data();
    if (!after) return;

    // create 이벤트 판별: before가 없으면 신규 제출
    const isCreate = !event.data?.before.exists;

    const db = admin.firestore();

    // 숙제 문서에서 마감 시간 조회
    const hwSnap = await db.collection('homeworks').doc(hwId).get();
    if (!hwSnap.exists) {
      logger.warn('[verifySubmissionLate] 숙제 문서 없음', { hwId, studentUid });
      return;
    }

    const dueDate = hwSnap.data()!.due_date as
      | admin.firestore.Timestamp
      | undefined;
    if (!dueDate) {
      logger.warn('[verifySubmissionLate] due_date 누락', { hwId });
      return;
    }

    // 서버 시간 기준 is_late 계산
    // submitted_at이 있으면 그것을, 없으면 현재 서버 시간을 기준으로
    // (submitted_at은 클라이언트가 serverTimestamp()로 기록하므로 서버 시간)
    const submittedAt = after.submitted_at as
      | admin.firestore.Timestamp
      | undefined;
    const referenceTime = submittedAt ?? admin.firestore.Timestamp.now();
    const isLateServer = referenceTime.toMillis() > dueDate.toMillis();

    // is_late 교정 (값이 다를 때만)
    if (after.is_late !== isLateServer) {
      logger.info('[verifySubmissionLate] is_late 교정', {
        hwId,
        studentUid,
        before: after.is_late,
        after: isLateServer,
      });
      await event.data!.after.ref.update({ is_late: isLateServer });
    }

    // 스트릭 갱신: 신규 제출(create) 시에만 — 재제출은 영향 없음
    // 클라이언트에서 streak 를 직접 쓰지 않으므로 서버에서 단일 진실 공급원
    if (isCreate) {
      // ── 멱등성 가드 ──
      // Eventarc at-least-once 정책으로 같은 create 이벤트가 두 번 트리거될 수 있다.
      // streak +1 이 두 번 적용되지 않도록 streak_processed 플래그를 트랜잭션으로 선점.
      const subRef = event.data!.after.ref;
      const userRef = db.collection('users').doc(studentUid);

      const processed = await db.runTransaction(async (tx) => {
        const subSnap = await tx.get(subRef);
        if (!subSnap.exists) return false;
        if (subSnap.data()?.streak_processed === true) return false; // 이미 처리됨

        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
          if (isLateServer) {
            tx.update(userRef, { streak: 0 });
          } else {
            const current = (userSnap.data()?.streak as number | undefined) ?? 0;
            tx.update(userRef, { streak: current + 1 });
          }
        }
        tx.update(subRef, { streak_processed: true });
        return true;
      });

      if (processed) {
        logger.info(
          isLateServer
            ? '[verifySubmissionLate] 스트릭 초기화 (지각)'
            : '[verifySubmissionLate] 스트릭 +1',
          { studentUid }
        );
      } else {
        logger.info('[verifySubmissionLate] 중복 호출 — 스트릭 갱신 건너뜀', {
          hwId,
          studentUid,
        });
      }
    } else if (isLateServer && after.is_late !== isLateServer) {
      // 재제출인데 클라이언트가 false로 위조했다 서버가 true로 교정한 경우 →
      // 직전 create 시 +1 됐을 가능성 있는 streak 를 0 으로 되돌림 (회귀 방어)
      await db.collection('users').doc(studentUid).update({ streak: 0 });
      logger.info('[verifySubmissionLate] 재제출 위조 감지 — 스트릭 초기화', {
        studentUid,
      });
    }
  }
);
