import firestore from '@react-native-firebase/firestore';
import { Collections } from './firestore';
import type { AttendanceStatus, AttendanceRecord, User } from '../types/index';

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
 * @param status     출결 상태 (present / late / absent)
 * @param academyId  학원 ID — 부모 문서에 academy_id 필드 보장용
 */
export async function setAttendanceRecord(
  classId: string,
  date: string,
  studentUid: string,
  status: AttendanceStatus,
  academyId: string,
  // reason 미지정(undefined) → 기존 reason 보존
  // reason: null → 사유 제거 / reason: string → 사유 저장
  reason?: string | null
): Promise<void> {
  // 1) 부모 출결 문서에 academy_id 필드 보장 (인덱스·Rules 조회에 필요)
  const attendanceDocRef = Collections.attendance(classId, date);
  await attendanceDocRef.set({ academy_id: academyId }, { merge: true });

  // 2) records 서브컬렉션의 studentUid 문서에 상태 저장
  //    reason은 명시적으로 넘어왔을 때만 payload에 포함 — undefined면 기존 reason 보존
  //    reason을 새로 쓴 경우엔 reason_source 필드를 제거 — 선생님 입력은 알림 트리거 X
  const recordRef = Collections.attendanceRecords(classId, date).doc(studentUid);
  const payload: Record<string, unknown> = { status };
  if (reason !== undefined) {
    payload.reason = reason;
    payload.reason_source = firestore.FieldValue.delete();
  }
  await recordRef.set(payload, { merge: true });
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

  const unsubscribe = recordsRef.onSnapshot(
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
      const recordRef = firestore()
        .collection('attendances')
        .doc(docId)
        .collection('records')
        .doc(studentUid);
      const recordSnap = await recordRef.get();

      if (recordSnap.exists()) {
        result[date] = recordSnap.data() as AttendanceRecord;
      }
    })
  );

  return result;
}

/**
 * 선생님이 사유만 단독으로 저장한다 (status는 건드리지 않음).
 * setDoc + merge로 record 문서가 없을 때도 안전하게 생성·갱신.
 * - academyId가 주어지면 부모 문서에 academy_id 보장 (인덱스·Rules 조회 필수).
 *   admin/teacher 화면에서 academyId를 함께 넘기길 권장.
 */
export async function updateAttendanceReason(
  classId: string,
  date: string,
  studentUid: string,
  reason: string | null,
  academyId?: string
): Promise<void> {
  if (academyId) {
    const attendanceDocRef = Collections.attendance(classId, date);
    await attendanceDocRef.set({ academy_id: academyId }, { merge: true });
  }
  // 선생님/어드민 단독 사유 저장 — reason_source 필드 제거해서 알림 트리거 회피
  const recordRef = Collections.attendanceRecords(classId, date).doc(studentUid);
  await recordRef.set(
    { reason, reason_source: firestore.FieldValue.delete() },
    { merge: true }
  );
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
  reason: string,
  // academyId가 주어지면 부모 문서 academy_id 보장 (admin 통계 쿼리 누락 방지)
  academyId?: string
): Promise<void> {
  if (academyId) {
    await Collections.attendance(classId, date).set(
      { academy_id: academyId },
      { merge: true }
    );
  }

  const recordRef = Collections.attendanceRecords(classId, date).doc(studentUid);
  const snap = await recordRef.get();

  // reason_source: 'parent' 표식 — 트리거가 학부모 입력만 알림 발송하도록 식별
  if (snap.exists()) {
    // 기존 문서가 있으면 reason만 업데이트 — 선생님이 입력한 status는 건드리지 않음
    await recordRef.set({ reason, reason_source: 'parent' }, { merge: true });
  } else {
    // 기존 문서 없으면 결석 상태로 신규 생성 — 학부모 사전 등록
    await recordRef.set({ status: 'absent', reason, reason_source: 'parent' }, { merge: true });
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
  reason: string,
  // academyId가 주어지면 부모 문서 academy_id 보장 (admin 통계 쿼리 누락 방지)
  academyId?: string
): Promise<void> {
  if (academyId) {
    await Collections.attendance(classId, date).set(
      { academy_id: academyId },
      { merge: true }
    );
  }
  const recordRef = Collections.attendanceRecords(classId, date).doc(studentUid);
  // merge: true — 기존 문서가 있으면 status·reason·source 세 필드만 덮어씀
  // reason_source: 'parent' 표식 — 트리거가 학부모 입력만 알림 발송하도록 식별
  await recordRef.set({ status, reason, reason_source: 'parent' }, { merge: true });
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
      const snapshot = await recordsRef.get();

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
      const snapshot = await recordsRef.get();

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

// ─────────────────────────────────────────────────────────────
// 엑셀 출결 — 월간 학생 목록 조회 (재원자 + 해당 월에 걸친 퇴원자 포함)
// ─────────────────────────────────────────────────────────────

/**
 * 엑셀 내보내기 대상 학생 목록을 조회한다 (앱 전용 — RN Firebase).
 *
 * 포함 기준:
 * - 재원자(is_active: true): 항상 포함
 * - 퇴원자(is_active: false + withdrawal_date 있음):
 *   해당 월(year, month)이 enrollment_date ~ withdrawal_date 범위에 걸친 경우만 포함
 *
 * 제외 기준:
 * - 탈퇴 처리된 계정(deleted_at != null)
 *
 * @param academyId    학원 ID
 * @param classId      반 ID — 퇴원 시 class_id가 유지되므로 같은 쿼리로 잡힘
 * @param year         기준 연도 (예: 2026)
 * @param month        기준 월 (1~12)
 */
export async function fetchStudentsForExport(
  academyId: string,
  classId: string,
  year: number,
  month: number,
): Promise<User[]> {
  // is_active 필터를 빼고 같은 반 전체를 가져온 뒤 클라이언트에서 월 범위로 거른다
  const snap = await Collections.users()
    .where('academy_id', '==', academyId)
    .where('role', '==', 'student')
    .where('class_id', '==', classId)
    .get();

  // 기준 월의 첫 날·마지막 날(00:00 기준)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as User))
    .filter((s) => !s.deleted_at)
    .filter((s) => {
      if (s.is_active) return true;
      // 퇴원자: withdrawal_date 없으면 제외 (데이터 이상)
      if (!s.withdrawal_date) return false;
      const withdrawal = s.withdrawal_date.toDate();
      // 월 시작 이전에 이미 퇴원했으면 제외
      if (withdrawal < monthStart) return false;
      // enrollment_date가 월 끝 이후면 제외 (해당 월에 아직 입원 안 함)
      if (s.enrollment_date && s.enrollment_date.toDate() > monthEnd) return false;
      return true;
    });
}
