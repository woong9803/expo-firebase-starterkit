/**
 * 스트릭(연속 제출) 유틸 함수
 * - Firestore에서 최근 30일 숙제 제출 데이터를 조회
 * - 날짜별 제출 상태를 반환 (스트릭 차트용)
 */

import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// 기존 코드와의 호환을 위한 별칭
type Timestamp = FirebaseFirestoreTypes.Timestamp;
const tsFromDate = (d: Date): Timestamp => firestore.Timestamp.fromDate(d);

/** 날짜별 스트릭 상태 */
export type DayStreakStatus =
  | 'submitted'    // 마감 전 제출 (스트릭 유지)
  | 'late'         // 마감 후 제출 (스트릭 초기화 대상)
  | 'missed'       // 숙제가 있었으나 미제출
  | 'none';        // 숙제 없음 (빈 날)

export interface DayStreak {
  date: string;           // YYYY-MM-DD
  status: DayStreakStatus;
}

/** fetchStreakData 반환값 — 차트용 날짜 데이터 + 숙제별 제출 횟수 */
export interface StreakResult {
  days: DayStreak[];       // 날짜별 상태 (차트용)
  submittedCount: number;  // 마감 전 제출 숙제 수 (날짜 아닌 숙제 기준)
  lateCount: number;       // 지각 제출 숙제 수
  missedCount: number;     // 미제출 숙제 수
}

/**
 * 학생의 최근 N일 스트릭 데이터를 조회한다.
 *
 * @param studentUid  학생 uid
 * @param classId     학생 소속 반 ID
 * @param days        조회할 일수 (기본 30일)
 * @returns 날짜별 차트 데이터 + 숙제별 제출 횟수
 */
export async function fetchStreakData(
  studentUid: string,
  classId: string,
  days: number = 30,
  futureDays: number = 7,
): Promise<StreakResult> {
  const now = new Date();
  // 과거 시작일
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);
  // 미래 종료일
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + futureDays);
  endDate.setHours(23, 59, 59, 999);

  // 과거~미래 범위의 숙제 목록 조회
  const hwSnap = await firestore()
    .collection('homeworks')
    .where('class_id', '==', classId)
    .where('due_date', '>=', tsFromDate(startDate))
    .get();

  // 날짜별 결과 맵 초기화 — 과거 days일 + 미래 futureDays일
  const totalDays = days + futureDays;
  const resultMap: Record<string, DayStreakStatus> = {};
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    resultMap[toDateString(d)] = 'none';
  }

  // 숙제별 제출 횟수 카운터 (날짜 기준 아닌 숙제 기준 — 스탬프와 일치)
  let submittedCount = 0;
  let lateCount = 0;
  let missedCount = 0;

  // 숙제별 제출 여부 확인
  await Promise.all(
    hwSnap.docs.map(async (hwDoc) => {
      const hw = hwDoc.data();
      const dueDate: Timestamp = hw.due_date;
      const dueDateStr = toDateString(dueDate.toDate());

      const subDocRef = firestore()
        .collection('homeworks')
        .doc(hwDoc.id)
        .collection('submissions')
        .doc(studentUid);
      const subSnap = await subDocRef.get();

      if (!subSnap.exists()) {
        // 마감이 지난 숙제만 missed 처리
        if (dueDate.toDate() < now) {
          missedCount++;
          if (dueDateStr in resultMap) resultMap[dueDateStr] = 'missed';
        }
      } else {
        const sub = subSnap.data();
        if (!sub) return;
        const isLate: boolean = sub.is_late ?? false;
        const status: DayStreakStatus = isLate ? 'late' : 'submitted';
        // 숙제별 카운터 증가
        if (isLate) lateCount++; else submittedCount++;
        // submitted_at 기준으로 차트 위치 결정
        // serverTimestamp() 미확정 시 toDate() 실패 → 오늘로 fallback
        let submittedDate: Date | null = null;
        try { submittedDate = sub.submitted_at?.toDate?.() ?? null; } catch { submittedDate = null; }
        const targetStr = submittedDate ? toDateString(submittedDate) : toDateString(now);
        if (targetStr in resultMap) resultMap[targetStr] = status;
      }
    }),
  );

  const days_result = Object.entries(resultMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, status]) => ({ date, status }));

  return { days: days_result, submittedCount, lateCount, missedCount };
}

/**
 * 학생의 최근 N일 스트릭 데이터를 실시간으로 구독한다.
 * - homeworks가 추가·수정될 때마다 자동으로 재계산
 *
 * @returns 구독 해제 함수 (useEffect cleanup에서 호출)
 */
export function subscribeStreakData(
  studentUid: string,
  classId: string,
  onData: (data: DayStreak[]) => void,
  onError: (e: Error) => void,
  days: number = 30,
  futureDays: number = 7,
): () => void {
  const now = new Date();
  // 과거 시작일
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  const hwQuery = firestore()
    .collection('homeworks')
    .where('class_id', '==', classId)
    .where('due_date', '>=', tsFromDate(startDate));

  // homeworks 변경 시마다 submissions 재조회 → streakData 재계산
  const unsub = hwQuery.onSnapshot(
    async (hwSnap) => {
      try {
        // 날짜별 결과 맵 초기화 — 과거 days일 + 미래 futureDays일
        const totalDays = days + futureDays;
        const resultMap: Record<string, DayStreakStatus> = {};
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i);
          resultMap[toDateString(d)] = 'none';
        }

        // 각 숙제의 제출 여부 병렬 확인
        await Promise.all(
          hwSnap.docs.map(async (hwDoc) => {
            const hw = hwDoc.data();
            const dueDate: Timestamp = hw.due_date;
            const dueDateStr = toDateString(dueDate.toDate());

            const subDocRef = firestore()
              .collection('homeworks')
              .doc(hwDoc.id)
              .collection('submissions')
              .doc(studentUid);
            const subSnap = await subDocRef.get();

            if (!subSnap.exists()) {
              // 마감이 지난 숙제이고, due_date가 resultMap 범위 안일 때만 missed 처리
              if (dueDate.toDate() < now && dueDateStr in resultMap) {
                resultMap[dueDateStr] = 'missed';
              }
            } else {
              const sub = subSnap.data();
              if (!sub) return;
              const status: DayStreakStatus = sub.is_late ? 'late' : 'submitted';
              // submitted_at 기준으로 차트 위치 결정
              // serverTimestamp() 미확정 시 toDate() 실패 → 오늘로 fallback
              let submittedDate: Date | null = null;
              try { submittedDate = sub.submitted_at?.toDate?.() ?? null; } catch { submittedDate = null; }
              const targetStr = submittedDate ? toDateString(submittedDate) : toDateString(now);
              if (targetStr in resultMap) {
                resultMap[targetStr] = status;
              }
            }
          }),
        );

        const result = Object.entries(resultMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, status]) => ({ date, status }));

        onData(result);
      } catch (e) {
        onError(e as Error);
      }
    },
    (e) => onError(e),
  );

  return unsub;
}

/** Date → 'YYYY-MM-DD' 문자열 변환 헬퍼 */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
