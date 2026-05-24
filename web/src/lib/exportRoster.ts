/**
 * web/src/lib/exportRoster.ts
 *
 * 수강생 관리 대장 엑셀(.xlsx) 생성·다운로드.
 *
 * 정렬:
 *   1) 반별 그룹화 (반 정렬은 입력된 classes 배열 순서 유지 — 호출 측이 제어)
 *   2) 각 반 안에서 학생 가나다순
 *   3) 반 배정된 재학생 → 반 미배정 재학생 → 퇴원생 순
 *
 * 행 구조:
 *   - 시트 상단 1행: 학원명·생성일 캡션
 *   - 컬럼 헤더 행
 *   - 반 헤더 행("중등 수학 A반 (수학)") → 그 반 학생 행들 → 빈 행
 *   - 마지막에 "반 미배정" 그룹 (있을 때) → "퇴원생" 그룹 (있을 때)
 *
 * 컬럼: 번호 / 성명 / 생년월일 / 보호자연락처 / 주소 / 반·교습과목 / 수강료 / 수강기간
 *  - 번호: 반별 1번부터 리셋
 *  - 수강료: 학생 값 null/undefined → 반 default_tuition_fee fallback → displayTuition
 *  - 수강기간: formatEnrollmentPeriod (재학생 'YYYY.MM.DD~', 퇴원생 'YYYY.MM.DD~YYYY.MM.DD')
 */

import * as XLSX from 'xlsx';
import type { Class } from '../../../types/index';
import type { StudentWithClass } from '../hooks/useStudents';
import {
  displayTuition,
  formatEnrollmentPeriod,
} from '../../../lib/tuitionFormat';

// ─── 컬럼 헤더 ──────────────────────────────────────────────────────
const COLUMN_HEADERS = [
  '번호', '성명', '생년월일', '보호자연락처', '주소', '반·교습과목', '수강료', '수강기간',
];

// ─── 컬럼 너비 (단위: 문자 수, xlsx wch 기준) ────────────────────────
const COLUMN_WIDTHS = [
  { wch: 5 },   // 번호
  { wch: 12 },  // 성명
  { wch: 12 },  // 생년월일
  { wch: 16 },  // 보호자연락처
  { wch: 32 },  // 주소
  { wch: 22 },  // 반·교습과목
  { wch: 14 },  // 수강료
  { wch: 26 },  // 수강기간
];

// 빈 셀 표시 ('-') — 보호자연락처·주소 등 옵셔널 필드용
const DASH = '-';

// ─── 내부 유틸 ───────────────────────────────────────────────────────

/** 'YYYY-MM-DD' 또는 잘못된 문자열 → 'YYYY.MM.DD' 또는 원본 그대로(잘못된 경우 '-') */
function formatBirthDate(s: string | null | undefined): string {
  if (!s) return DASH;
  // 'YYYY-MM-DD' 형태만 점 구분으로 변환, 그 외에는 원본 보존
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
}

/** 반 + 교습과목 라벨 — 'A반 (수학)' / 교습과목 없으면 'A반' */
function formatClassLabel(cls: Class | undefined, fallback: string): string {
  if (!cls) return fallback;
  const subject = cls.subject?.trim();
  return subject ? `${cls.name} (${subject})` : cls.name;
}

/** 학생 수강료 표시 — 학생 값 비어있으면 반 default fallback */
function formatTuitionCell(student: StudentWithClass, cls: Class | undefined): string {
  const fee = student.tuition_fee !== null && student.tuition_fee !== undefined
    ? student.tuition_fee
    : cls?.default_tuition_fee;
  return displayTuition(fee);
}

/** 학생 1명 → 행(1차원 배열) */
function studentToRow(
  student: StudentWithClass,
  index: number,
  cls: Class | undefined,
  classLabelOverride?: string,
): (string | number)[] {
  return [
    index,
    student.name ?? DASH,
    formatBirthDate(student.birth_date),
    student.guardian_phone ?? DASH,
    student.address ?? DASH,
    classLabelOverride ?? formatClassLabel(cls, '-'),
    formatTuitionCell(student, cls),
    formatEnrollmentPeriod(
      student.enrollment_date ? student.enrollment_date.toDate() : null,
      student.withdrawal_date ? student.withdrawal_date.toDate() : null,
    ),
  ];
}

/** 가나다순 비교 — 한글 정렬 보장 */
function compareByNameKo(a: StudentWithClass, b: StudentWithClass): number {
  return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
}

/** YYYYMMDD 형식 오늘 날짜 — 파일명용 */
function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ─── 메인 export ─────────────────────────────────────────────────────

/**
 * 수강생 대장 엑셀 다운로드.
 *
 * @param students    StudentWithClass[] — 재학생·퇴원생 모두 포함
 * @param classes     Class[]            — 학원 내 전체 반 목록
 * @param academyName string             — 파일명·캡션용 학원명 (없으면 '학원')
 */
export function exportRoster(
  students: StudentWithClass[],
  classes: Class[],
  academyName: string,
): void {
  // 반 ID → Class 객체 맵
  const classMap = new Map<string, Class>();
  classes.forEach((c) => classMap.set(c.id, c));

  // 재학생 / 퇴원생 분리 — is_active === false 가 퇴원
  const activeStudents = students.filter((s) => s.is_active !== false);
  const inactiveStudents = students.filter((s) => s.is_active === false);

  // 반별 재학생 그룹 (classes 배열 순서 유지)
  const activeByClass = new Map<string, StudentWithClass[]>();
  classes.forEach((c) => activeByClass.set(c.id, []));
  const unassignedActive: StudentWithClass[] = [];
  activeStudents.forEach((s) => {
    if (s.class_id && activeByClass.has(s.class_id)) {
      activeByClass.get(s.class_id)!.push(s);
    } else {
      unassignedActive.push(s);
    }
  });

  // ─── 시트 데이터(2차원 배열) 조립 ──────────────────────────────
  const aoa: (string | number)[][] = [];

  // 1행: 캡션 (학원명 + 기준일)
  aoa.push([`${academyName || '학원'} 수강생 관리 대장 (기준: ${todayYYYYMMDD()})`]);
  aoa.push([]); // 빈 행

  // 2행: 컬럼 헤더
  aoa.push(COLUMN_HEADERS);

  // 반 그룹별 출력
  classes.forEach((cls) => {
    const studentsInClass = activeByClass.get(cls.id) ?? [];
    if (studentsInClass.length === 0) return; // 학생 없는 반은 헤더 자체 생략

    // 반 헤더 행 — 1열만 채우고 나머지는 빈 셀 (행 자체로 시각적 그룹 구분)
    aoa.push([formatClassLabel(cls, cls.name)]);

    // 가나다순 정렬 후 번호는 반별 1부터 리셋
    studentsInClass.sort(compareByNameKo).forEach((s, i) => {
      aoa.push(studentToRow(s, i + 1, cls));
    });

    aoa.push([]); // 다음 반과 시각적 분리용 빈 행
  });

  // 반 미배정 재학생 그룹 (있을 때만)
  if (unassignedActive.length > 0) {
    aoa.push(['반 미배정']);
    unassignedActive.sort(compareByNameKo).forEach((s, i) => {
      aoa.push(studentToRow(s, i + 1, undefined, '미배정'));
    });
    aoa.push([]);
  }

  // 퇴원생 그룹 (있을 때만)
  if (inactiveStudents.length > 0) {
    aoa.push(['퇴원생']);
    inactiveStudents.sort(compareByNameKo).forEach((s, i) => {
      // 퇴원생도 마지막 소속 반 정보를 표시 (반·교습과목 컬럼)
      const cls = s.class_id ? classMap.get(s.class_id) : undefined;
      aoa.push(studentToRow(s, i + 1, cls));
    });
  }

  // ─── 워크북 생성 + 다운로드 ────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLUMN_WIDTHS;
  // 캡션 행 8칸 병합 (가독성) — 행 0, 열 0~7
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLUMN_HEADERS.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '수강생대장');

  // 파일명: {학원명}_수강생대장_{YYYYMMDD}.xlsx
  // 파일시스템 안전을 위해 학원명에서 슬래시·역슬래시·콜론·따옴표·별표·물음표 제거
  const safeAcademy = (academyName || '학원').replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `${safeAcademy}_수강생대장_${todayYYYYMMDD()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
