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
  formatBirthDate,
  formatEnrollmentPeriod,
  calcAttendanceSummary,
  buildExportDateCols,
  getDayCellValue,
  getDayStatusSymbol,
  getEffectiveSymbols,
  LEFT_COLUMN_HEADERS,
  RIGHT_COLUMN_HEADERS,
} from '../../../lib/legalAttendanceFormat';
// 앱(lib/excelExporter.ts)과 동일한 제목·컬럼 헤더 텍스트를 공유하기 위해
// 루트 constants/strings.ts 를 직접 사용한다.
import { strings as rootStrings } from '../../../constants/strings';

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
 * 단일 반의 출석부 워크시트를 생성한다.
 * 여러 반을 하나의 워크북에 담을 때 재사용 가능.
 *
 * 날짜 컬럼은 출결 기록이 1건이라도 있는 날짜만 노출한다.
 * (학원 비운영일까지 31일 전체를 펼치면 의미 없는 빈 칸이 늘어남)
 */
function buildAttendanceSheet(params: WebExportParams): XLSX.WorkSheet {
  const { academyName, className, subjectName, year, month, students, attendanceData } = params;

  // 날짜 컬럼: 출결 기록이 있는 날짜 + 퇴원자의 퇴원일(해당 월 안) 합집합
  // 퇴원일은 출결 기록이 없어도 컬럼에 노출 (퇴원자 셀에 "퇴원" 표시)
  const dateCols = buildExportDateCols(attendanceData, students, year, month);
  const dayHeaders = dateCols.map((d) => `${Number(d.slice(8, 10))}일`);

  // 컬럼 헤더 (좌측 고정 + 날짜 + 우측 합계)
  const columnHeaders = [...LEFT_COLUMN_HEADERS, ...dayHeaders, ...RIGHT_COLUMN_HEADERS];
  const totalCols = columnHeaders.length;

  // 제목 행 (병합 처리 예정) — 앱과 동일한 문구를 공유 strings에서 사용
  const titleText = `${academyName} ${className} ${year}년 ${month}월 ${rootStrings.export.excelTitle}`;
  const titleRow: string[] = [titleText, ...Array(totalCols - 1).fill('')];

  // 학생별 데이터 행 조립
  const dataRows = students.map((student, idx) => {
    // 날짜별 표시 셀 — 결석/지각 사유는 셀에 직접 "X(병원)" 형태로 함께 표기
    // 퇴원자: 퇴원일 셀은 "퇴원", 퇴원 이후는 빈칸
    const displaySymbols = dateCols.map((date) => {
      const record = attendanceData[date]?.[student.uid];
      return getDayCellValue(date, student, record?.status, record?.reason);
    });

    // 합계 계산용 셀 — 사유를 합치지 않은 순수 기호만 (calcAttendanceSummary는 정확 매칭)
    const statusSymbols = dateCols.map((date) => {
      const record = attendanceData[date]?.[student.uid];
      return getDayStatusSymbol(date, student, record?.status);
    });

    // 월간 합계 — 퇴원자는 퇴원일 당일·이후 셀 제외해야 출석률 왜곡 방지 (B-3)
    const effective = getEffectiveSymbols(statusSymbols, dateCols, student);
    const summary = calcAttendanceSummary(effective);

    // 교습과목·수강반 컬럼 값
    const subjectClass =
      subjectName && className
        ? `${subjectName} · ${className}`
        : subjectName || className;

    // 수강기간 — 재원: "YYYY.MM.DD~" / 퇴원: "YYYY.MM.DD~YYYY.MM.DD"
    const enrollPeriod = formatEnrollmentPeriod(
      student.enrollment_date as Parameters<typeof formatEnrollmentPeriod>[0],
      student.withdrawal_date as Parameters<typeof formatEnrollmentPeriod>[1],
    );

    return [
      idx + 1,                             // 번호
      student.name,                        // 성명
      formatBirthDate(student.birth_date), // 생년월일
      student.guardian_phone ?? '',        // 보호자연락처
      subjectClass,                        // 교습과목 및 수강반
      enrollPeriod,                        // 수강기간
      ...displaySymbols,                   // 날짜별 출결 기호 + 사유(결석/지각만)
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
  // 일별 셀에는 사유까지 표기되므로 폭을 12자로 넉넉히 잡는다
  const LEFT_WIDTHS = [5, 10, 14, 16, 20, 16];
  const RIGHT_WIDTHS = [8, 8, 8, 8]; // 출석/지각/결석/출석률

  ws['!cols'] = [
    ...LEFT_WIDTHS.map((w) => ({ wch: w })),
    ...Array(dateCols.length).fill({ wch: 12 }),
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
 * 명렬표 페이지 전용 다운로드 — 동일한 양식이지만 파일명만 다르다.
 * (보관 시 「법정 출석부」와 「명렬표」가 서로 구분되도록)
 */
export function downloadRosterAttendanceExcel(params: WebExportParams) {
  const { className, year, month } = params;

  const wb = XLSX.utils.book_new();
  const ws = buildAttendanceSheet(params);
  XLSX.utils.book_append_sheet(wb, ws, '출결현황');

  triggerDownload(wb, `${className}_${year}년_${month}월_출결명렬표.xlsx`);
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
