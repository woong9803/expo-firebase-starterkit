/**
 * 스트릭(연속 제출) 유틸 함수
 * - Firestore에서 최근 30일 숙제 제출 데이터를 조회
 * - 날짜별 제출 상태를 반환 (스트릭 차트용)
 */

import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

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

/**
 * 학생의 최근 N일 스트릭 데이터를 조회한다.
 *
 * @param studentUid  학생 uid
 * @param classId     학생 소속 반 ID
 * @param days        조회할 일수 (기본 30일)
 * @returns 날짜별 스트릭 상태 배열 (오래된 날짜 → 최신 날짜 순)
 */
export async function fetchStreakData(
  studentUid: string,
  classId: string,
  days: number = 30,
): Promise<DayStreak[]> {
  // 조회 기간 시작일 계산
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  // 기간 내 해당 반의 숙제 목록 조회
  const hwQuery = query(
    collection(db, 'homeworks'),
    where('class_id', '==', classId),
    where('due_date', '>=', Timestamp.fromDate(startDate)),
  );

  const hwSnap = await getDocs(hwQuery);

  // 날짜별 결과 맵 초기화 (최근 days일 전부 'none'으로 채움)
  const resultMap: Record<string, DayStreakStatus> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    resultMap[toDateString(d)] = 'none';
  }

  // 숙제별 제출 여부 확인
  await Promise.all(
    hwSnap.docs.map(async (hwDoc) => {
      const hw = hwDoc.data();
      const dueDate: Timestamp = hw.due_date;
      const dueDateStr = toDateString(dueDate.toDate());

      // 조회 기간 밖이면 스킵
      if (!(dueDateStr in resultMap)) return;

      // 해당 숙제의 이 학생 제출물 조회 — 문서 경로를 직접 지정해 getDoc 사용
      // (where('__name__', ...) 는 전체 경로 필요 → UID만으론 동작 안 함)
      const subDocRef = doc(db, 'homeworks', hwDoc.id, 'submissions', studentUid);
      const subSnap = await getDoc(subDocRef);

      if (!subSnap.exists()) {
        // 미제출 — 마감일이 오늘 이전이면 missed
        const isPast = dueDate.toDate() < now;
        if (isPast) {
          resultMap[dueDateStr] = 'missed';
        }
      } else {
        const sub = subSnap.data();
        // is_late 여부에 따라 구분
        resultMap[dueDateStr] = sub.is_late ? 'late' : 'submitted';
      }
    }),
  );

  // 날짜 오름차순 배열로 변환
  return Object.entries(resultMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, status]) => ({ date, status }));
}

/** Date → 'YYYY-MM-DD' 문자열 변환 헬퍼 */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
