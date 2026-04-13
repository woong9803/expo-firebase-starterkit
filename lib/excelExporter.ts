/**
 * lib/excelExporter.ts
 *
 * 법정 출석부 형식의 엑셀 파일을 생성하는 유틸.
 * SheetJS(xlsx)로 데이터를 조립하고, expo-file-system 캐시에 저장한 뒤
 * 로컬 URI를 반환한다. 공유는 호출 측(화면 컴포넌트)에서 expo-sharing으로 처리.
 *
 * 의존성:
 *  - xlsx          (npm)
 *  - expo-file-system (Expo SDK)
 *  - lib/legalAttendanceFormat.ts
 */

import * as XLSX from 'xlsx';
// expo-file-system v55에서 writeAsStringAsync·cacheDirectory는 legacy 경로에서 import
import {
  writeAsStringAsync,
  cacheDirectory,
  EncodingType,
} from 'expo-file-system/legacy';
import type { User, AttendanceRecord } from '../types/index';
import {
  getExcelColumnHeaders,
  getAttendanceSymbol,
  formatBirthDate,
  formatEnrollmentPeriod,
  calcAttendanceSummary,
  EMPTY_SYMBOL,
} from './legalAttendanceFormat';
import { strings } from '../constants/strings';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

/** generateLegalAttendanceExcel 호출 시 필요한 매개변수 */
export interface ExportParams {
  academyName: string;                    // 학원 이름 (제목 행에 삽입)
  className: string;                      // 반 이름 (파일명·제목 행에 사용)
  subjectName: string;                    // 교습과목 (예: 수학)
  teacherName: string;                    // 담당 선생님 이름
  year: number;                           // 출결 연도 (예: 2026)
  month: number;                          // 출결 월 (1~12)
  students: User[];                       // 반 학생 목록 (번호 순)
  attendanceData: Record<string, Record<string, AttendanceRecord>>;
  // ↑ { 'YYYY-MM-DD': { [studentUid]: AttendanceRecord } }
}

/** generateLegalAttendanceExcel 반환 값 */
export interface ExportResult {
  uri: string;      // expo-file-system 캐시 내 파일 경로
  fileName: string; // 파일 이름 (예: 수학반_2026년_5월_출결현황.xlsx)
}

// ─────────────────────────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────────────────────────

/**
 * 법정 출석부 형식의 엑셀 파일을 생성하고 로컬 URI를 반환한다.
 *
 * 엑셀 구조:
 *  행 1 — 제목 (예: "○○학원 수학반 2026년 5월 출결현황")
 *  행 2 — 컬럼 헤더 (번호·성명·생년월일·… · 1일·2일·…·31일 · 출석합계·…)
 *  행 3~ — 학생 데이터 행
 */
export async function generateLegalAttendanceExcel(
  params: ExportParams
): Promise<ExportResult> {
  const { academyName, className, subjectName, teacherName, year, month, students, attendanceData } =
    params;

  // ── 1) 해당 월의 날짜 목록 생성 ───────────────────────────
  const lastDay = new Date(year, month, 0).getDate();
  // 날짜 문자열 배열: ['YYYY-MM-01', 'YYYY-MM-02', ..., 'YYYY-MM-31']
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const dateCols = Array.from({ length: lastDay }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${yearMonth}-${dd}`;
  });

  // ── 2) 컬럼 헤더 행 조립 ─────────────────────────────────
  const columnHeaders = getExcelColumnHeaders(year, month);
  // 좌측 고정 컬럼 수 (번호·성명·생년월일·보호자연락처·교습과목·수강기간)
  const LEFT_COL_COUNT = 6;
  // 우측 합계 컬럼 수 (출석합계·지각합계·결석합계·출석률)
  const RIGHT_COL_COUNT = 4;

  // ── 3) 제목 행 조립 ──────────────────────────────────────
  // 전체 컬럼 수를 기준으로 병합 범위를 설정하므로 길이 먼저 계산
  const totalCols = columnHeaders.length;
  const titleText = `${academyName} ${className} ${year}년 ${month}월 ${strings.export.title}`;
  // 제목 행: 첫 셀에 텍스트, 나머지는 빈 문자열 (이후 merge 처리)
  const titleRow: string[] = [titleText, ...Array(totalCols - 1).fill('')];

  // ── 4) 학생 데이터 행 조립 ────────────────────────────────
  const dataRows: (string | number)[][] = students.map((student, idx) => {
    // 날짜별 출결 기호 배열 (합계 계산용 — 기호만)
    const daySymbols = dateCols.map((date) => {
      const dayRecord = attendanceData[date]?.[student.uid];
      return getAttendanceSymbol(dayRecord?.status ?? null);
    });

    // 날짜별 셀 값 배열 (엑셀 출력용 — 결석/지각 사유 포함)
    // 사유가 있는 경우: "X(병원)", "△(늦잠)" 형태로 표시
    const dayCells = dateCols.map((date, i) => {
      const dayRecord = attendanceData[date]?.[student.uid];
      const symbol = daySymbols[i];
      const hasReason =
        symbol !== EMPTY_SYMBOL &&
        dayRecord?.reason &&
        (dayRecord.status === 'absent' || dayRecord.status === 'late');
      return hasReason ? `${symbol}(${dayRecord!.reason})` : symbol;
    });

    // 월간 합계 계산 (기호만 있는 배열 기준)
    const summary = calcAttendanceSummary(daySymbols);

    // 교습과목 및 수강반 컬럼: "수학 · 수학반" 형식
    const subjectClass =
      subjectName && className
        ? `${subjectName} · ${className}`
        : subjectName || className;

    // 수강기간: enrollment_date Timestamp → "YYYY.MM.DD~"
    const enrollPeriod = formatEnrollmentPeriod(
      student.enrollment_date as Parameters<typeof formatEnrollmentPeriod>[0]
    );

    // 좌측 고정 컬럼 값
    const leftCols: (string | number)[] = [
      idx + 1,                                           // 번호
      student.name,                                      // 성명
      formatBirthDate(student.birth_date),               // 생년월일
      student.guardian_phone ?? '',                      // 보호자연락처
      subjectClass,                                      // 교습과목 및 수강반
      enrollPeriod,                                      // 수강기간
    ];

    // 우측 합계 컬럼 값
    const rightCols: (string | number)[] = [
      summary.present,   // 출석합계
      summary.late,      // 지각합계
      summary.absent,    // 결석합계
      summary.rate,      // 출석률 (예: "92%")
    ];

    return [...leftCols, ...dayCells, ...rightCols];
  });

  // ── 5) AOA(Array of Arrays)로 워크시트 생성 ───────────────
  const aoa: (string | number)[][] = [titleRow, columnHeaders, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── 6) 제목 행 병합 (A1 ~ 마지막 컬럼 1행) ────────────────
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({
    s: { r: 0, c: 0 },              // 시작: 1행 1열
    e: { r: 0, c: totalCols - 1 }, // 끝: 1행 마지막열
  });

  // ── 7) 컬럼 너비 설정 ─────────────────────────────────────
  ws['!cols'] = [
    { wch: 5 },   // 번호
    { wch: 10 },  // 성명
    { wch: 14 },  // 생년월일
    { wch: 16 },  // 보호자연락처
    { wch: 20 },  // 교습과목 및 수강반
    { wch: 16 },  // 수강기간
    // 날짜 컬럼들 (1일~말일): 각 3자
    ...Array(lastDay).fill({ wch: 3 }),
    { wch: 8 },   // 출석합계
    { wch: 8 },   // 지각합계
    { wch: 8 },   // 결석합계
    { wch: 8 },   // 출석률
  ];

  // ── 8) 워크북 생성 후 base64 직렬화 ─────────────────────
  const wb = XLSX.utils.book_new();
  // 시트 이름: "출결현황" (엑셀 시트명 31자 제한)
  XLSX.utils.book_append_sheet(wb, ws, '출결현황');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // ── 9) expo-file-system 캐시에 파일 저장 ─────────────────
  const fileName = `${className}_${year}년_${month}월_출결현황.xlsx`;
  const uri = `${cacheDirectory}${fileName}`;

  await writeAsStringAsync(uri, base64, {
    encoding: EncodingType.Base64,
  });

  return { uri, fileName };
}
