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
  formatBirthDate,
  formatEnrollmentPeriod,
  calcAttendanceSummary,
  buildExportDateCols,
  getDayCellValue,
  getDayStatusSymbol,
  getEffectiveSymbols,
  LEFT_COLUMN_HEADERS,
  RIGHT_COLUMN_HEADERS,
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
  // teacherName 은 호출 시그니처 호환을 위해 받지만 본 양식에서는 사용하지 않는다.
  void teacherName;

  // ── 1) 날짜 컬럼: 출결 기록이 있는 날짜 + 퇴원자의 퇴원일(해당 월 안) 합집합 ──
  // (학원 비운영일까지 1~말일 전체를 펼치면 빈 칸이 늘어남 — 운영일만 노출)
  // 퇴원일은 출결 기록이 없어도 반드시 컬럼에 노출 (퇴원자 셀에 "퇴원" 표시용)
  const dateCols = buildExportDateCols(attendanceData, students, year, month);

  // ── 2) 컬럼 헤더 행 조립 ─────────────────────────────────
  const dayHeaders = dateCols.map((d) => `${Number(d.slice(8, 10))}일`);
  const columnHeaders = [...LEFT_COLUMN_HEADERS, ...dayHeaders, ...RIGHT_COLUMN_HEADERS];

  // ── 3) 제목 행 조립 ──────────────────────────────────────
  // 전체 컬럼 수를 기준으로 병합 범위를 설정하므로 길이 먼저 계산
  const totalCols = columnHeaders.length;
  const titleText = `${academyName} ${className} ${year}년 ${month}월 ${strings.export.excelTitle}`;
  // 제목 행: 첫 셀에 텍스트, 나머지는 빈 문자열 (이후 merge 처리)
  const titleRow: string[] = [titleText, ...Array(totalCols - 1).fill('')];

  // ── 4) 학생 데이터 행 조립 ────────────────────────────────
  const dataRows: (string | number)[][] = students.map((student, idx) => {
    // 날짜별 표시 셀 — 결석/지각 사유는 셀에 직접 "X(병원)" 형태로 함께 표기
    // 퇴원자: 퇴원일 셀은 "퇴원", 퇴원 이후는 빈칸
    const displaySymbols = dateCols.map((date) => {
      const dayRecord = attendanceData[date]?.[student.uid];
      return getDayCellValue(date, student, dayRecord?.status, dayRecord?.reason);
    });

    // 합계 계산용 셀 — 사유를 합치지 않은 순수 기호만 (calcAttendanceSummary는 정확 매칭)
    const statusSymbols = dateCols.map((date) => {
      const dayRecord = attendanceData[date]?.[student.uid];
      return getDayStatusSymbol(date, student, dayRecord?.status);
    });

    // 월간 합계 계산 — 퇴원자는 퇴원일 당일·이후 셀 제외해야 출석률 왜곡 방지 (B-3)
    const effective = getEffectiveSymbols(statusSymbols, dateCols, student);
    const summary = calcAttendanceSummary(effective);

    // 교습과목 및 수강반 컬럼: "수학 · 수학반" 형식
    const subjectClass =
      subjectName && className
        ? `${subjectName} · ${className}`
        : subjectName || className;

    // 수강기간 — 재원: "YYYY.MM.DD~" / 퇴원: "YYYY.MM.DD~YYYY.MM.DD"
    const enrollPeriod = formatEnrollmentPeriod(
      student.enrollment_date as Parameters<typeof formatEnrollmentPeriod>[0],
      student.withdrawal_date as Parameters<typeof formatEnrollmentPeriod>[1],
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

    // 우측 합계 컬럼 값 — 사유는 일별 셀에 직접 표기하므로 별도 비고 컬럼 없음
    const rightCols: (string | number)[] = [
      summary.present,   // 출석합계
      summary.late,      // 지각합계
      summary.absent,    // 결석합계
      summary.rate,      // 출석률 (예: "92%")
    ];

    return [...leftCols, ...displaySymbols, ...rightCols];
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
  // 일별 셀에 사유가 함께 표기되므로 폭을 넉넉히 잡는다 (예: "X(병원)" / "△(늦잠)")
  ws['!cols'] = [
    { wch: 5 },   // 번호
    { wch: 10 },  // 성명
    { wch: 14 },  // 생년월일
    { wch: 16 },  // 보호자연락처
    { wch: 20 },  // 교습과목 및 수강반
    { wch: 16 },  // 수강기간
    // 날짜 컬럼들: 사유까지 들어가도록 12자 폭으로 통일
    ...Array(dateCols.length).fill({ wch: 12 }),
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
