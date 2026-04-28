import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sendFcmBatch, SendFcmParams } from './sendFcm';
import { NOTIFICATION_MESSAGES } from '../strings';

/**
 * 숙제 신규 등록 알림 트리거
 * 선생님(또는 admin)이 새 숙제를 등록하면 해당 반의 학생 + 그 학생들의 학부모 모두에게 알림 발송
 *
 * 알림 본문 예시 (양식 B):
 *   제목: "새 숙제가 등록됐어요"
 *   본문: "수학반 · 기출문제 1단원 · 8/30(금)까지"
 */
export const onHomeworkCreated = onDocumentCreated(
  'homeworks/{homeworkId}',
  async (event) => {
    const homework = event.data?.data();
    if (!homework) return;

    const homeworkId = event.params.homeworkId;
    const classId: string | undefined = homework.class_id;
    const homeworkTitle: string = homework.title ?? '';
    const dueDate: admin.firestore.Timestamp | undefined = homework.due_date;

    if (!classId || !dueDate) {
      console.warn(`[homeworkCreated] class_id 또는 due_date 누락 (homeworkId=${homeworkId})`);
      return;
    }

    const db = admin.firestore();

    // ─── 1) 반(class) 문서 조회 — academy_id + 반 이름 획득 ───────────────
    const classSnap = await db.collection('classes').doc(classId).get();
    if (!classSnap.exists) {
      console.warn(`[homeworkCreated] class 문서 없음 (classId=${classId})`);
      return;
    }
    const classData = classSnap.data()!;
    const academyId: string = classData.academy_id;
    const className: string = classData.name ?? '';

    // ─── 2) 알림 본문 마감일 라벨 생성 — "M/D(요일)" ──────────────────────
    const dueLabel = formatDueLabel(dueDate.toDate());

    // ─── 3) 해당 반 학생들 조회 (활성 사용자만) ──────────────────────────
    const studentsSnap = await db
      .collection('users')
      .where('academy_id', '==', academyId)
      .where('class_id', '==', classId)
      .where('role', '==', 'student')
      .where('is_active', '==', true)
      .get();

    const studentUids = studentsSnap.docs.map((d) => d.id);

    // ─── 4) 학부모 조회 — children 배열에 위 학생 uid 가 포함된 학부모 ────
    // Firestore array-contains-any 는 최대 30개 제한 — 30명 단위로 청크 분할
    const parentsByStudent = new Map<string, FirebaseFirestore.DocumentData[]>();
    if (studentUids.length > 0) {
      const CHUNK = 30;
      for (let i = 0; i < studentUids.length; i += CHUNK) {
        const chunk = studentUids.slice(i, i + CHUNK);
        const parentSnap = await db
          .collection('users')
          .where('academy_id', '==', academyId)
          .where('role', '==', 'parent')
          .where('is_active', '==', true)
          .where('children', 'array-contains-any', chunk)
          .get();
        for (const pDoc of parentSnap.docs) {
          const pData = pDoc.data();
          const pChildren: string[] = pData.children ?? [];
          for (const sUid of pChildren) {
            if (!chunk.includes(sUid)) continue;
            const arr = parentsByStudent.get(sUid) ?? [];
            arr.push({ uid: pDoc.id, ...pData });
            parentsByStudent.set(sUid, arr);
          }
        }
      }
    }

    // ─── 5) 알림 batch 구성 — 학생 + 학부모 ───────────────────────────────
    const batch: SendFcmParams[] = [];
    const title = NOTIFICATION_MESSAGES.homeworkCreated.title;
    const body = NOTIFICATION_MESSAGES.homeworkCreated.body(className, homeworkTitle, dueLabel);

    // 학생용 딥링크 — 학생 숙제 탭
    const studentDeepLink = '/(app)/(student)/(tabs)/homework';
    // 학부모용 딥링크 — 학부모 숙제 탭
    const parentDeepLink = '/(app)/(parent)/(tabs)/homework';

    for (const sDoc of studentsSnap.docs) {
      const student = sDoc.data();
      // 학생 알림 OFF 설정 시 건너뜀 (homework 카테고리 또는 전체 OFF)
      if (student.notif_prefs?.homework === false) continue;

      batch.push({
        academyId,
        targetUid: sDoc.id,
        fcmToken: student.fcm_token ?? '',
        title,
        body,
        type: 'homework_created',
        deepLink: studentDeepLink,
      });

      // 그 학생의 학부모들도 알림
      const parents = parentsByStudent.get(sDoc.id) ?? [];
      for (const parent of parents) {
        if (parent.notif_prefs?.homework === false) continue;
        batch.push({
          academyId,
          targetUid: parent.uid,
          fcmToken: parent.fcm_token ?? '',
          title,
          body,
          type: 'homework_created',
          deepLink: parentDeepLink,
        });
      }
    }

    if (batch.length > 0) {
      await sendFcmBatch(batch);
    }

    console.log(
      `[homeworkCreated] homeworkId=${homeworkId}, classId=${classId}, ` +
      `학생 ${studentsSnap.size}명 · 알림 ${batch.length}건 처리 완료`
    );
  }
);

// ─── 유틸리티 ──────────────────────────────────────────────────────────

/**
 * 마감일을 "M/D(요일)" 형식으로 포맷
 * 예: 2026-08-30 → "8/30(금)"
 * 한국 시간대 기준 요일 계산
 */
function formatDueLabel(date: Date): string {
  // Asia/Seoul 시간대로 보정 — UTC + 9시간
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[kst.getUTCDay()];
  return `${m}/${d}(${dayName})`;
}
