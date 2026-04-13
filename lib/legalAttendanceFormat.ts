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
  onLeave: '-',  // 휴원
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

/** 날짜 컬럼 뒤에 위치하는 우측 합계 컬럼 헤더 */
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
 * 수강 시작일(Timestamp)을 "YYYY.MM.DD~" 형식으로 변환한다.
 * 법정 출석부 '수강기간' 컬럼에 사용.
 *
 * @param enrollmentDate  Firestore Timestamp 호환 객체 또는 null
 */
export function formatEnrollmentPeriod(enrollmentDate: TimestampLike | null): string {
  if (!enrollmentDate) return '';
  try {
    const d = enrollmentDate.toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    // 종료일은 미정이므로 시작일 뒤에 '~' 표시
    return `${y}.${m}.${day}~`;
  } catch {
    return '';
  }
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
 * 수업 있는 날 = 기호가 빈 문자열이 아닌 날 (휴원 포함)
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
