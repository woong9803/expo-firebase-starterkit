/**
 * lib/age.ts — 만 나이 계산 헬퍼
 *
 * PIPA(개인정보보호법) 제22조: 만 14세 미만 아동의 개인정보 수집·이용에는
 * 법정대리인(부모 등)의 동의가 필수.
 *
 * 이 헬퍼는 학생 가입·등록 시 생년월일로 14세 미만 여부를 판정하는 데 사용.
 */

/** 생년월일 문자열이 유효한 YYYY-MM-DD 인지 검사 */
function isValidBirthDate(birthDate: string): boolean {
  // 형식 검사
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;

  const [yStr, mStr, dStr] = birthDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  // 합리적인 범위 검사 (1900년 이후 ~ 오늘 이전)
  const now = new Date();
  if (y < 1900 || y > now.getFullYear()) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  // Date 객체로 실제 유효성 검사 (예: 2025-02-30 같은 거 차단)
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return false;
  }

  return true;
}

/**
 * 만 나이 계산 (한국 기준)
 * - 생일이 아직 안 지났으면 -1
 * - 잘못된 형식이면 null
 */
export function calculateAge(birthDate: string): number | null {
  if (!isValidBirthDate(birthDate)) return null;

  const [yStr, mStr, dStr] = birthDate.split('-');
  const birthYear = Number(yStr);
  const birthMonth = Number(mStr);
  const birthDay = Number(dStr);

  const today = new Date();
  let age = today.getFullYear() - birthYear;

  // 생일이 아직 안 지났으면 -1
  const m = today.getMonth() + 1; // 1~12
  const d = today.getDate();
  if (m < birthMonth || (m === birthMonth && d < birthDay)) {
    age -= 1;
  }

  return age;
}

/**
 * 만 14세 미만 여부 (PIPA 제22조 기준)
 * - 생년월일 형식이 잘못됐거나 미입력이면 false (호출 측에서 형식 검증을 먼저 할 것)
 */
export function isUnder14(birthDate: string): boolean {
  const age = calculateAge(birthDate);
  if (age === null) return false;
  return age < 14;
}
