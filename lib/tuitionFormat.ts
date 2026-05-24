/**
 * lib/tuitionFormat.ts
 *
 * 수강료(원 단위) 입력·표시용 포맷 유틸 모음.
 * - 입력 중에는 콤마 자동 표기 (290000 → 290,000)
 * - 저장 시에는 number | null 로 정규화
 * - 표시 시에는 "290,000원" / "미설정" / "무료" 분기
 *
 * 규칙: 순수 함수만 — Firebase/Firestore import 금지.
 */

/**
 * 사용자 입력 문자열을 콤마 포맷으로 변환한다.
 * - 숫자가 아닌 문자는 모두 제거
 * - 빈 문자열이면 빈 문자열 그대로 반환
 *
 * 예: '290000' → '290,000' / '12a3' → '123' / '' → ''
 */
export function formatTuitionInput(raw: string): string {
  // 숫자만 추출 (콤마·문자·공백 모두 제거)
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  // 천 단위 콤마 삽입
  return Number(digits).toLocaleString('en-US');
}

/**
 * 콤마 포함 입력 문자열을 number | null 로 정규화한다.
 * - 빈 문자열 / 숫자 추출 결과가 비어있음 → null (미설정)
 * - 그 외 → number (0 포함 — 무료 체험반 의미)
 *
 * 예: '290,000' → 290000 / '0' → 0 / '' → null
 */
export function parseTuitionInput(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * 저장된 수강료(number | null)를 화면 표기용 문자열로 변환한다.
 * - null/undefined → '미설정'
 * - 0              → '무료'
 * - 그 외          → '290,000원'
 */
export function displayTuition(fee: number | null | undefined): string {
  if (fee === null || fee === undefined) return '미설정';
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('en-US')}원`;
}

/**
 * number | null 을 입력창 초기값(콤마 포함 문자열)으로 변환한다.
 * - null/undefined → ''
 * - 0              → '0'  (무료 체험반 — 명시적 0 보존)
 * - 그 외          → '290,000'
 */
export function tuitionToInputString(fee: number | null | undefined): string {
  if (fee === null || fee === undefined) return '';
  return fee.toLocaleString('en-US');
}

/**
 * 수강기간 라벨 변환 — 수강생 관리 대장 엑셀 등 표시용.
 * - 재학생: 'YYYY.MM.DD~'
 * - 퇴원생: 'YYYY.MM.DD~YYYY.MM.DD'
 * - enrollment_date 없으면 '-' 반환
 *
 * Firestore Timestamp 의존을 피하기 위해 toDate() 결과(Date) 또는 null 을 받는다.
 *
 * @param enrolledAt    등록일 (수강 시작) — Date 또는 null/undefined
 * @param withdrawnAt   퇴원일 (수강 종료) — Date 또는 null/undefined (재학생이면 null)
 */
export function formatEnrollmentPeriod(
  enrolledAt: Date | null | undefined,
  withdrawnAt: Date | null | undefined,
): string {
  if (!enrolledAt) return '-';
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  };
  const start = fmt(enrolledAt);
  return withdrawnAt ? `${start}~${fmt(withdrawnAt)}` : `${start}~`;
}

/**
 * 학생 반 배정·이동 시 학생 tuition_fee 자동 채움 결정 헬퍼.
 *
 * 정책:
 *  - 학생이 이미 값(0 포함)을 가지고 있으면 → undefined 반환 = "건드리지 않음"
 *    · 학생별 설정 보존 (형제 할인·면제 등 예외 케이스)
 *    · 0 도 명시적 무료를 의미하므로 보존 대상
 *  - 학생이 null/undefined 면 → 새 반 default_tuition_fee 사용
 *  - 새 반 default 도 null/undefined 면 → null 반환 (명시적 미설정 저장)
 *
 * 호출 측은 반환값을 다음과 같이 해석:
 *  - undefined → updateDoc 페이로드에서 tuition_fee 키 제외 (변경 없음)
 *  - number    → 그 값으로 저장
 *  - null      → null 로 저장 (미설정 명시)
 *
 * @param currentFee       학생의 현재 tuition_fee
 * @param newClassDefault  새 반의 default_tuition_fee
 */
export function resolveTuitionOnClassChange(
  currentFee: number | null | undefined,
  newClassDefault: number | null | undefined,
): number | null | undefined {
  // 학생이 이미 값(0 포함)을 가지면 보존 — undefined·null만 "비어있음"으로 간주
  if (currentFee !== null && currentFee !== undefined) return undefined;
  // 새 반 기본값도 비어있으면 null 로 명시 저장
  if (newClassDefault === null || newClassDefault === undefined) return null;
  return newClassDefault;
}
