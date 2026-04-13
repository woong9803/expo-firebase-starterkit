import {
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
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
  //    reason 필드는 null로 초기화 (이미 존재하면 유지 — merge:true)
  const recordRef = doc(Collections.attendanceRecords(classId, date), studentUid);
  await setDoc(recordRef, { status, reason: null }, { merge: true });
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
): Promise<Record<string, AttendanceStatus>> {
  // YYYY-MM 형식으로 변환 (월은 2자리 패딩)
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  // attendances 컬렉션에서 해당 월 전체 문서 조회
  // 문서 ID 패턴: {classId}_{YYYY-MM-DD}
  const attendancesQuery = query(
    Collections.attendances(),
    where(documentId(), '>=', `${classId}_${yearMonth}-01`),
    where(documentId(), '<=', `${classId}_${yearMonth}-31`)
  );

  const attendanceSnaps = await getDocs(attendancesQuery);

  const result: Record<string, AttendanceStatus> = {};

  // 각 날짜 문서에서 해당 학생의 records 서브컬렉션 문서를 개별 조회
  await Promise.all(
    attendanceSnaps.docs.map(async (attendanceDoc) => {
      // 문서 ID에서 날짜 추출: "{classId}_{YYYY-MM-DD}" → "YYYY-MM-DD"
      const docId = attendanceDoc.id; // 예: "classAbc_2026-04-13"
      const date = docId.replace(`${classId}_`, '');

      const recordRef = doc(
        db,
        'attendances',
        docId,
        'records',
        studentUid
      );
      const recordSnap = await getDoc(recordRef);

      if (recordSnap.exists()) {
        const record = recordSnap.data() as AttendanceRecord;
        result[date] = record.status;
      }
    })
  );

  return result;
}

/**
 * 학부모가 자녀의 결석 사유를 전송(업데이트)한다.
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
  await updateDoc(recordRef, { reason });
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
