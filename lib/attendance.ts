import {
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { db } from './firebase';
import { Collections } from './firestore';
import type { AttendanceStatus, AttendanceRecord } from '../types/index';

// ─────────────────────────────────────────────────────────────
// lib/attendance.ts
// 출결 관련 Firestore 헬퍼 함수 모음
// 앱 전체에서 이 파일만 직접 Firestore 출결 연산을 수행한다.
// ─────────────────────────────────────────────────────────────

/**
 * 선생님이 특정 학생의 출결 상태를 저장한다.
 *
 * @param classId    반 ID
 * @param date       날짜 문자열 (YYYY-MM-DD)
 * @param studentUid 학생 UID
 * @param status     출결 상태 (present / late / absent / onLeave)
 * @param academyId  학원 ID — 부모 문서에 academy_id 필드 보장용
 */
export async function setAttendanceRecord(
  classId: string,
  date: string,
  studentUid: string,
  status: AttendanceStatus,
  academyId: string
): Promise<void> {
  // 1) 부모 출결 문서에 academy_id 필드 보장 (인덱스·Rules 조회에 필요)
  const attendanceDocRef = Collections.attendance(classId, date);
  await setDoc(attendanceDocRef, { academy_id: academyId }, { merge: true });

  // 2) records 서브컬렉션의 studentUid 문서에 상태 저장
  //    reason 필드는 건드리지 않음 — merge:true + status만 지정해야 기존 사유 보존
  const recordRef = doc(Collections.attendanceRecords(classId, date), studentUid);
  await setDoc(recordRef, { status }, { merge: true });
}

/**
 * 특정 반·날짜의 출결 records를 실시간 구독한다.
 *
 * @param classId  반 ID
 * @param date     날짜 문자열 (YYYY-MM-DD)
 * @param onData   데이터 콜백: { [studentUid]: AttendanceRecord } 맵 반환
 * @param onError  에러 콜백
 * @returns        구독 해제 함수 (컴포넌트 unmount 시 호출)
 */
export function subscribeAttendanceRecords(
  classId: string,
  date: string,
  onData: (records: Record<string, AttendanceRecord>) => void,
  onError: (error: Error) => void
): () => void {
  const recordsRef = Collections.attendanceRecords(classId, date);

  const unsubscribe = onSnapshot(
    recordsRef,
    (snapshot) => {
      // snapshot → { studentUid: AttendanceRecord } 맵으로 변환
      const records: Record<string, AttendanceRecord> = {};
      snapshot.forEach((docSnap) => {
        records[docSnap.id] = docSnap.data() as AttendanceRecord;
      });
      onData(records);
    },
    (error) => onError(error)
  );

  // 구독 해제 함수 반환
  return unsubscribe;
}

/**
 * 특정 학생의 월간 출결 이력을 가져온다.
 *
 * @param studentUid  학생 UID
 * @param classId     반 ID
 * @param year        연도 (예: 2026)
 * @param month       월 (1~12)
 * @returns           날짜별 출결 상태 맵 { 'YYYY-MM-DD': AttendanceStatus }
 */
export async function getMonthlyAttendance(
  studentUid: string,
  classId: string,
  year: number,
  month: number
): Promise<Record<string, AttendanceRecord>> {
  // YYYY-MM 형식으로 변환 (월은 2자리 패딩)
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  // 해당 월의 마지막 날짜 계산 (28~31일)
  const lastDay = new Date(year, month, 0).getDate();

  // attendances 컬렉션 쿼리 대신 날짜를 직접 계산하여
  // records/{studentUid} 문서만 개별 읽기 — 컬렉션 쿼리 권한 불필요
  // status + reason 전체를 반환하여 상세 모달에서 사유 표시 가능
  const result: Record<string, AttendanceRecord> = {};

  await Promise.all(
    Array.from({ length: lastDay }, (_, i) => i + 1).map(async (day) => {
      const dd = String(day).padStart(2, '0');
      const date = `${yearMonth}-${dd}`;
      const docId = `${classId}_${date}`;

      // 학생은 자신의 records 문서 직접 읽기 권한 있음
      const recordRef = doc(db, 'attendances', docId, 'records', studentUid);
      const recordSnap = await getDoc(recordRef);

      if (recordSnap.exists()) {
        result[date] = recordSnap.data() as AttendanceRecord;
      }
    })
  );

  return result;
}

/**
 * 선생님이 출결 상태와 함께 사유를 저장한다.
 * setAttendanceRecord와 달리 reason 필드를 명시적으로 덮어쓴다.
 */
export async function updateAttendanceReason(
  classId: string,
  date: string,
  studentUid: string,
  reason: string | null
): Promise<void> {
  const recordRef = doc(Collections.attendanceRecords(classId, date), studentUid);
  await updateDoc(recordRef, { reason });
}

/**
 * 학부모가 자녀의 결석 사유를 전송한다.
 * - 선생님이 이미 출결을 입력한 경우: reason 필드만 업데이트 (status 유지)
 * - 아직 출결이 입력되지 않은 경우: status: 'absent' + reason 으로 신규 생성 (학부모 사전 등록)
 *
 * @param classId    반 ID
 * @param date       날짜 문자열 (YYYY-MM-DD)
 * @param studentUid 학생 UID
 * @param reason     결석 사유 텍스트
 */
export async function sendAbsenceReason(
  classId: string,
  date: string,
  studentUid: string,
  reason: string
): Promise<void> {
  const recordRef = doc(Collections.attendanceRecords(classId, date), studentUid);
  const snap = await getDoc(recordRef);

  if (snap.exists()) {
    // 기존 문서가 있으면 reason만 업데이트 — 선생님이 입력한 status는 건드리지 않음
    await updateDoc(recordRef, { reason });
  } else {
    // 기존 문서 없으면 결석 상태로 신규 생성 — 학부모 사전 등록
    await setDoc(recordRef, { status: 'absent', reason });
  }
}

/**
 * 학부모가 자녀의 결석/지각을 사전 등록한다.
 * 선생님이 아직 출결을 입력하지 않은 날에도 미리 신청 가능.
 * setDoc + merge:true 로 문서가 없으면 생성, 있으면 덮어씀.
 *
 * @param classId    반 ID
 * @param date       날짜 문자열 (YYYY-MM-DD)
 * @param studentUid 학생 UID
 * @param status     absent | late
 * @param reason     결석/지각 사유
 */
export async function registerParentRecord(
  classId: string,
  date: string,
  studentUid: string,
  status: 'absent' | 'late',
  reason: string
): Promise<void> {
  const recordRef = doc(Collections.attendanceRecords(classId, date), studentUid);
  // merge: true — 기존 문서가 있으면 status·reason 두 필드만 덮어씀
  await setDoc(recordRef, { status, reason }, { merge: true });
}

/**
 * 오늘 결석 인원 수를 반 ID 목록에서 합산한다.
 * 선생님 홈의 "오늘 결석" 통계에서 사용.
 *
 * @param classIds  조회할 반 ID 목록 (최대 5개 처리)
 * @param todayStr  오늘 날짜 문자열 (YYYY-MM-DD)
 * @returns         결석 학생 총 수
 */
export async function getAbsentCountToday(
  classIds: string[],
  todayStr: string
): Promise<number> {
  // Firestore 비용 절감을 위해 최대 5개 반만 조회
  const targetClassIds = classIds.slice(0, 5);

  let absentCount = 0;

  await Promise.all(
    targetClassIds.map(async (classId) => {
      const recordsRef = Collections.attendanceRecords(classId, todayStr);
      const snapshot = await getDocs(recordsRef);

      snapshot.forEach((docSnap) => {
        const record = docSnap.data() as AttendanceRecord;
        if (record.status === 'absent') {
          absentCount += 1;
        }
      });
    })
  );

  return absentCount;
}

/**
 * 엑셀 내보내기용 — 반 전체 학생의 월간 출결 데이터를 한 번에 조회한다.
 *
 * 기존 getMonthlyAttendance()는 단일 학생 전용이며,
 * 이 함수는 날짜별 getDocs 방식으로 반 전체 데이터를 효율적으로 수집한다.
 * 읽기 횟수: 최대 31회 (월 일수 기준) — 학생 수 × 날짜 수 방식보다 훨씬 적음
 *
 * @param classId  반 ID
 * @param year     연도 (예: 2026)
 * @param month    월 (1~12)
 * @returns        { 'YYYY-MM-DD': { [studentUid]: AttendanceRecord } } 형태의 이중 맵
 */
export async function getClassMonthlyDataForExport(
  classId: string,
  year: number,
  month: number
): Promise<Record<string, Record<string, AttendanceRecord>>> {
  // YYYY-MM 형식 생성 (월은 2자리 패딩)
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  // 해당 월의 마지막 날 계산 (28~31일)
  const lastDay = new Date(year, month, 0).getDate();

  // 결과 맵: date → { studentUid → AttendanceRecord }
  const result: Record<string, Record<string, AttendanceRecord>> = {};

  // 날짜별로 records 서브컬렉션을 병렬 조회
  // 날짜 1개당 getDocs 1회 → 최대 31회 읽기로 반 전체 데이터 수집
  await Promise.all(
    Array.from({ length: lastDay }, (_, i) => i + 1).map(async (day) => {
      const dd = String(day).padStart(2, '0');
      const date = `${yearMonth}-${dd}`;

      // attendances/{classId}_{date}/records 서브컬렉션 전체 조회
      const recordsRef = Collections.attendanceRecords(classId, date);
      const snapshot = await getDocs(recordsRef);

      if (!snapshot.empty) {
        // 해당 날짜에 출결 데이터가 있는 경우에만 결과에 포함
        const dateRecords: Record<string, AttendanceRecord> = {};
        snapshot.forEach((docSnap) => {
          // 문서 ID = studentUid
          dateRecords[docSnap.id] = docSnap.data() as AttendanceRecord;
        });
        result[date] = dateRecords;
      }
    })
  );

  return result;
}
