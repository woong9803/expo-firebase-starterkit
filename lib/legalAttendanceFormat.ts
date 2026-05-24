/**
 * lib/legalAttendanceFormat.ts
 *
 * 법정 출석부 양식 관련 상수·타입·변환 유틸 모음.
 * excelExporter.ts에서 import하여 사용한다.
 *
 * 규칙: 이 파일은 순수 상수·유틸만 포함 — Firebase/Firestore import 금지.
 */

import { strings } from '../constants/strings';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

/**
 * Firestore Timestamp와 덕 타이핑 호환 인터페이스.
 * Firebase import 없이 Timestamp를 다룰 수 있도록 로컬 정의.
 */
export interface TimestampLike {
  toDate(): Date;
}

// ─────────────────────────────────────────────────────────────
// 출결 상태 → 엑셀 기호 매핑
// ─────────────────────────────────────────────────────────────

/** 법정 출석부에서 사용하는 출결 기호 */
export const ATTENDANCE_SYMBOLS: Record<string, string> = {
  present: '○',  // 출석
  late: '△',     // 지각
  absent: 'X',   // 결석
};

/** 출결 기록이 없는 날짜에 표시할 기호 (빈 문자열) */
export const EMPTY_SYMBOL = '';

/**
 * 출결 상태 문자열을 엑셀 기호로 변환한다.
 * null / undefined / 미등록 상태는 빈 문자열 반환.
 */
export function getAttendanceSymbol(status: string | null | undefined): string {
  if (!status) return EMPTY_SYMBOL;
  return ATTENDANCE_SYMBOLS[status] ?? EMPTY_SYMBOL;
}

// ─────────────────────────────────────────────────────────────
// 컬럼 헤더
// ─────────────────────────────────────────────────────────────

/** 날짜 컬럼 앞에 위치하는 좌측 고정 컬럼 헤더 */
export const LEFT_COLUMN_HEADERS: string[] = [
  strings.export.colNumber,        // 번호
  strings.export.colName,          // 성명
  strings.export.colBirthDate,     // 생년월일
  strings.export.colGuardianPhone, // 보호자연락처
  strings.export.colSubjectClass,  // 교습과목 및 수강반
  strings.export.colEnrollPeriod,  // 수강기간
];

/** 날짜 컬럼 뒤에 위치하는 우측 합계 컬럼 헤더
 *  사유는 일별 셀에 직접 표기하므로 별도 비고 컬럼은 두지 않는다.
 */
export const RIGHT_COLUMN_HEADERS: string[] = [
  strings.export.colPresentTotal, // 출석합계
  strings.export.colLateTotal,    // 지각합계
  strings.export.colAbsentTotal,  // 결석합계
  strings.export.colAttendRate,   // 출석률
];

/**
 * 특정 연월에 맞는 전체 컬럼 헤더 배열을 반환한다.
 * 구성: 좌측 고정 컬럼 + 날짜 컬럼(1일~말일) + 우측 합계 컬럼
 *
 * @param year   연도 (예: 2026)
 * @param month  월 (1~12)
 */
export function getExcelColumnHeaders(year: number, month: number): string[] {
  // 해당 월의 마지막 날 계산
  const lastDay = new Date(year, month, 0).getDate();
  // 날짜 컬럼 헤더: '1일', '2일', ..., '31일'
  const dayHeaders = Array.from({ length: lastDay }, (_, i) => `${i + 1}일`);
  return [...LEFT_COLUMN_HEADERS, ...dayHeaders, ...RIGHT_COLUMN_HEADERS];
}

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

/**
 * 생년월일 문자열을 법정 출석부 형식으로 변환한다.
 * YYYY-MM-DD → YYYY.MM.DD
 *
 * @param birthDate  생년월일 문자열 또는 null
 */
export function formatBirthDate(birthDate: string | null): string {
  if (!birthDate) return '';
  // 하이픈(-)을 점(.)으로 교체
  return birthDate.replace(/-/g, '.');
}

/**
 * Date를 "YYYY.MM.DD" 형식으로 변환 (내부 헬퍼)
 */
function formatDot(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/**
 * 수강기간을 법정 출석부 형식으로 변환한다.
 * - 재원 중(withdrawalDate null/undefined): "YYYY.MM.DD~"
 * - 퇴원자(withdrawalDate 있음):           "YYYY.MM.DD~YYYY.MM.DD"
 * - enrollmentDate 없음:                   ""
 *
 * @param enrollmentDate  수강 시작일 (Firestore Timestamp 호환)
 * @param withdrawalDate  수강 종료일(퇴원일) — 재원 중이면 null/undefined
 */
export function formatEnrollmentPeriod(
  enrollmentDate: TimestampLike | null,
  withdrawalDate?: TimestampLike | null,
): string {
  if (!enrollmentDate) return '';
  try {
    const start = formatDot(enrollmentDate.toDate());
    if (!withdrawalDate) return `${start}~`;
    const end = formatDot(withdrawalDate.toDate());
    return `${start}~${end}`;
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────
// 엑셀 동적 날짜 컬럼 빌더 (B-2)
// ─────────────────────────────────────────────────────────────

/**
 * 학생 한 명의 퇴원/출결 정보를 추상화한 인터페이스.
 * 셀 빌더에서 Firebase 의존성을 피하기 위해 enrollment_date/withdrawal_date 만 추림.
 */
export interface ExportStudentLike {
  uid: string;
  is_active: boolean;
  withdrawal_date?: TimestampLike | null;
}

/**
 * 'YYYY-MM-DD' 문자열로 변환 (해당 월 범위 비교용 키)
 */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 엑셀 날짜 컬럼 목록을 만든다.
 *
 * 포함 기준:
 * - attendanceData 에 한 건이라도 기록된 날짜
 * - 퇴원자(students 중 withdrawal_date 있음)의 퇴원일이 해당 월에 속한 경우 강제 추가
 *
 * @returns 정렬된 'YYYY-MM-DD' 배열 (중복 제거)
 */
export function buildExportDateCols(
  attendanceData: Record<string, unknown>,
  students: ExportStudentLike[],
  year: number,
  month: number,
): string[] {
  const set = new Set<string>(Object.keys(attendanceData));

  // 해당 월의 첫 날·마지막 날 (로컬 타임)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  for (const s of students) {
    if (s.is_active) continue;
    if (!s.withdrawal_date) continue;
    try {
      const wd = s.withdrawal_date.toDate();
      if (wd < monthStart || wd > monthEnd) continue;
      set.add(toDateKey(wd));
    } catch {
      // toDate 실패 시 무시
    }
  }

  return Array.from(set).sort();
}

/**
 * 학생 × 날짜 셀의 표시값을 결정한다.
 *
 * 우선순위:
 * 1) 퇴원자 + 해당 날짜가 퇴원일과 일치 → "퇴원" (출결 기호·사유 무시 — A안: 퇴원 우선)
 * 2) 퇴원자 + 퇴원일 이후 날짜 → 빈 문자열 (재원하지 않은 날)
 * 3) 결석/지각 + 사유 있음 → "△(병원)" / "X(늦잠)" 형태로 사유를 셀에 직접 표기
 * 4) 그 외 → 출결 기호 (없으면 빈 문자열)
 *
 * @param date            'YYYY-MM-DD'
 * @param student         학생 정보 (is_active, withdrawal_date)
 * @param recordStatus    해당 학생의 해당 날짜 출결 status (없으면 null)
 * @param recordReason    해당 학생의 해당 날짜 결석/지각 사유 (없으면 null)
 */
export function getDayCellValue(
  date: string,
  student: ExportStudentLike,
  recordStatus: string | null | undefined,
  recordReason?: string | null,
): string {
  // 퇴원자 처리 분기 (재원자는 곧장 기호 매핑)
  if (!student.is_active && student.withdrawal_date) {
    try {
      const wdKey = toDateKey(student.withdrawal_date.toDate());
      if (date === wdKey) return strings.export.withdrawalCell;  // 퇴원일 셀 — 우선 표시
      if (date > wdKey) return EMPTY_SYMBOL;                     // 퇴원 이후 — 빈칸
    } catch {
      // 실패 시 일반 경로로 통과
    }
  }

  const symbol = getAttendanceSymbol(recordStatus ?? null);
  // 사유는 결석/지각일 때만 셀에 함께 표기 — 출석/미입력은 기호만 표시
  if ((recordStatus === 'absent' || recordStatus === 'late') && recordReason && recordReason.trim()) {
    return `${symbol}(${recordReason.trim()})`;
  }
  return symbol;
}

/**
 * 출석률 합계 계산용 "기호 전용" 셀 값을 반환한다.
 * getDayCellValue 와 동일한 분기를 사용하지만 사유는 절대 합치지 않는다.
 * (calcAttendanceSummary 가 정확한 기호 매칭으로 카운트하기 때문)
 */
export function getDayStatusSymbol(
  date: string,
  student: ExportStudentLike,
  recordStatus: string | null | undefined,
): string {
  if (!student.is_active && student.withdrawal_date) {
    try {
      const wdKey = toDateKey(student.withdrawal_date.toDate());
      if (date === wdKey) return EMPTY_SYMBOL;   // 퇴원일 — 합계에서 제외
      if (date > wdKey) return EMPTY_SYMBOL;
    } catch {
      // 실패 시 일반 경로
    }
  }
  return getAttendanceSymbol(recordStatus ?? null);
}

// ─────────────────────────────────────────────────────────────
// 엑셀 — 퇴원자 출석률·비고 처리 (B-3, B-4)
// ─────────────────────────────────────────────────────────────

/**
 * 출석률 계산용 "유효 기호 배열"을 추출한다 (B-3).
 *
 * 퇴원자는 퇴원일 당일 + 그 이후 셀을 모두 잘라내고 계산해야 출석률이 왜곡되지 않는다.
 * - 퇴원일 셀 = "퇴원" 문자열 → 빈 셀이 아니어서 분모(수업일)에 잘못 포함됨
 * - 퇴원일 이후 = 빈칸이라 자동 제외되긴 하지만, 명확성을 위해 동일 로직으로 함께 잘라냄
 *
 * 재원자(is_active true 또는 withdrawal_date 없음)는 daySymbols 그대로 반환.
 *
 * @param daySymbols  dateCols 와 같은 길이의 셀 값 배열
 * @param dateCols    'YYYY-MM-DD' 정렬 배열 (daySymbols 와 1:1 매칭)
 * @param student     학생 정보 (퇴원 여부 판정)
 */
export function getEffectiveSymbols(
  daySymbols: string[],
  dateCols: string[],
  student: ExportStudentLike,
): string[] {
  if (student.is_active || !student.withdrawal_date) return daySymbols;
  let wdKey: string;
  try {
    wdKey = toDateKey(student.withdrawal_date.toDate());
  } catch {
    return daySymbols;
  }
  // 퇴원일 이전(< wdKey)만 합계 계산에 사용 — 퇴원일 당일·이후 모두 제외
  return daySymbols.filter((_, i) => dateCols[i] < wdKey);
}

// ─────────────────────────────────────────────────────────────
// 합계 계산 유틸
// ─────────────────────────────────────────────────────────────

/** calcAttendanceSummary 반환 타입 */
export interface AttendanceSummary {
  present: number; // 출석 일수
  late: number;    // 지각 횟수
  absent: number;  // 결석 횟수
  rate: string;    // 출석률 (예: "92%")
}

/**
 * 한 학생의 날짜별 출결 기호 배열을 받아 월간 합계를 계산한다.
 * 출석률 = (출석 + 지각) / 수업 있는 날 수 × 100
 * 수업 있는 날 = 기호가 빈 문자열이 아닌 날
 *
 * @param symbols  날짜 순서대로 정렬된 출결 기호 배열 (예: ['○','△','X','','…'])
 */
export function calcAttendanceSummary(symbols: string[]): AttendanceSummary {
  // 출결이 입력된 날(빈 문자열 제외)만 수업일로 계산
  const classDays = symbols.filter(s => s !== EMPTY_SYMBOL).length;
  const present = symbols.filter(s => s === ATTENDANCE_SYMBOLS.present).length;
  const late    = symbols.filter(s => s === ATTENDANCE_SYMBOLS.late).length;
  const absent  = symbols.filter(s => s === ATTENDANCE_SYMBOLS.absent).length;

  // 수업일이 없으면 출석률 '-' 처리
  const rate = classDays > 0
    ? `${Math.round(((present + late) / classDays) * 100)}%`
    : '-';

  return { present, late, absent, rate };
}
