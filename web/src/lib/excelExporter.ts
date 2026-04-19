/**
 * web/src/lib/excelExporter.ts
 *
 * 법정 출석부 엑셀 파일을 생성해 브라우저에서 다운로드한다.
 * 앱(lib/excelExporter.ts)과 동일한 법정 양식을 사용하되,
 * expo-file-system 대신 Blob URL + anchor.click() 패턴으로 저장한다.
 *
 * 의존성:
 *  - xlsx (npm)
 *  - lib/legalAttendanceFormat.ts (앱과 공유)
 */

import * as XLSX from 'xlsx';
import type { User, AttendanceRecord } from '../../../types/index';
import {
  getExcelColumnHeaders,
  getAttendanceSymbol,
  formatBirthDate,
  formatEnrollmentPeriod,
  calcAttendanceSummary,
  EMPTY_SYMBOL,
} from '../../../lib/legalAttendanceFormat';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface WebExportParams {
  academyName: string;
  className: string;
  subjectName: string;
  year: number;
  month: number;
  students: User[];
  // { 'YYYY-MM-DD': { [studentUid]: AttendanceRecord } }
  attendanceData: Record<string, Record<string, AttendanceRecord>>;
}

// ─── 워크시트 생성 헬퍼 ──────────────────────────────────────────────────────

/**
 * 단일 반의 법정 출석부 워크시트를 생성한다.
 * 여러 반을 하나의 워크북에 담을 때 재사용 가능.
 */
function buildAttendanceSheet(params: WebExportParams): XLSX.WorkSheet {
  const { academyName, className, subjectName, year, month, students, attendanceData } = params;

  // 해당 월 날짜 목록 ('YYYY-MM-01' ~ 'YYYY-MM-말일')
  const lastDay = new Date(year, month, 0).getDate();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const dateCols = Array.from({ length: lastDay }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${ym}-${dd}`;
  });

  // 컬럼 헤더 생성 (좌측 고정 + 날짜 + 우측 합계)
  const columnHeaders = getExcelColumnHeaders(year, month);
  const totalCols = columnHeaders.length;

  // 제목 행 (병합 처리 예정)
  const titleText = `${academyName} ${className} ${year}년 ${month}월 출결현황`;
  const titleRow: string[] = [titleText, ...Array(totalCols - 1).fill('')];

  // 학생별 데이터 행 조립
  const dataRows = students.map((student, idx) => {
    // 날짜별 출결 기호 배열 (합계 계산용)
    const daySymbols = dateCols.map((date) => {
      const record = attendanceData[date]?.[student.uid];
      return getAttendanceSymbol(record?.status ?? null);
    });

    // 날짜별 셀 값 (결석/지각 사유 있으면 "X(사유)" 형태)
    const dayCells = dateCols.map((date, i) => {
      const record = attendanceData[date]?.[student.uid];
      const symbol = daySymbols[i];
      const hasReason =
        symbol !== EMPTY_SYMBOL &&
        record?.reason &&
        (record.status === 'absent' || record.status === 'late');
      return hasReason ? `${symbol}(${record!.reason})` : symbol;
    });

    // 월간 합계 (출석/지각/결석/출석률)
    const summary = calcAttendanceSummary(daySymbols);

    // 교습과목·수강반 컬럼 값
    const subjectClass =
      subjectName && className
        ? `${subjectName} · ${className}`
        : subjectName || className;

    // 수강기간 (enrollment_date → "YYYY.MM.DD~")
    const enrollPeriod = formatEnrollmentPeriod(
      student.enrollment_date as Parameters<typeof formatEnrollmentPeriod>[0]
    );

    return [
      idx + 1,                             // 번호
      student.name,                        // 성명
      formatBirthDate(student.birth_date), // 생년월일
      student.guardian_phone ?? '',        // 보호자연락처
      subjectClass,                        // 교습과목 및 수강반
      enrollPeriod,                        // 수강기간
      ...dayCells,                         // 날짜별 출결 기호
      summary.present,                     // 출석합계
      summary.late,                        // 지각합계
      summary.absent,                      // 결석합계
      summary.rate,                        // 출석률
    ];
  });

  // 2차원 배열로 워크시트 생성
  const aoa: (string | number)[][] = [titleRow, columnHeaders, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 제목 행 병합 (A1 ~ 마지막 열)
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({
    s: { r: 0, c: 0 },
    e: { r: 0, c: totalCols - 1 },
  });

  // 고정 컬럼 너비 (좌측 6개 + 우측 4개)
  const LEFT_WIDTHS = [5, 10, 14, 16, 20, 16];
  const RIGHT_WIDTHS = [8, 8, 8, 8];

  // 날짜 컬럼 너비 — 사유 텍스트 "X(가족행사)" 같은 긴 내용이 있을 수 있으므로
  // 각 날짜 컬럼별로 데이터 행 최대 길이를 계산해 자동 조정
  const dayColWidths: number[] = Array(lastDay).fill(3); // 기본 3
  dataRows.forEach((row) => {
    for (let d = 0; d < lastDay; d++) {
      const colIdx = LEFT_WIDTHS.length + d;
      const cell = String(row[colIdx] ?? '');
      // 한글 1자 = 2 너비, ASCII 1자 = 1 너비로 계산
      const visualWidth = [...cell].reduce(
        (acc, char) => acc + (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(char) ? 2 : 1),
        0
      );
      if (visualWidth > dayColWidths[d]) {
        dayColWidths[d] = Math.min(visualWidth + 1, 20); // 최대 20으로 제한
      }
    }
  });

  ws['!cols'] = [
    ...LEFT_WIDTHS.map((w) => ({ wch: w })),
    ...dayColWidths.map((w) => ({ wch: w })),
    ...RIGHT_WIDTHS.map((w) => ({ wch: w })),
  ];

  return ws;
}

// ─── 퍼블릭 함수 ─────────────────────────────────────────────────────────────

/**
 * 단일 반 법정 출석부 엑셀 파일을 생성해 브라우저에서 다운로드한다.
 * 파일명: {반이름}_{연도}년_{월}월_출결현황.xlsx
 */
export function downloadClassAttendanceExcel(params: WebExportParams) {
  const { className, year, month } = params;

  const wb = XLSX.utils.book_new();
  const ws = buildAttendanceSheet(params);
  XLSX.utils.book_append_sheet(wb, ws, '출결현황');

  triggerDownload(wb, `${className}_${year}년_${month}월_출결현황.xlsx`);
}

/**
 * 전체 반 법정 출석부를 하나의 엑셀 파일(다중 시트)로 다운로드한다.
 * 각 시트 이름 = 반 이름 (31자 제한으로 앞 15자 사용)
 * 파일명: 전체반_{연도}년_{월}월_출결현황.xlsx
 */
export function downloadAllClassesAttendanceExcel(
  classes: { params: WebExportParams }[],
  year: number,
  month: number
) {
  const wb = XLSX.utils.book_new();

  classes.forEach(({ params }) => {
    const ws = buildAttendanceSheet(params);
    // 엑셀 시트명은 최대 31자 제한
    const sheetName = params.className.slice(0, 15);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  triggerDownload(wb, `전체반_${year}년_${month}월_출결현황.xlsx`);
}

// ─── 내부 유틸 ───────────────────────────────────────────────────────────────

/**
 * Blob URL + anchor.click() 패턴으로 xlsx 파일을 브라우저 다운로드한다.
 */
function triggerDownload(wb: XLSX.WorkBook, fileName: string) {
  const wbArray = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
