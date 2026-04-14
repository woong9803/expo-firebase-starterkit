/**
 * constants/theme.ts — 웅깅(Woongking) 디자인 토큰
 *
 * 웅깅(Woongking)_All_Screens.html에서 추출한 색상, 폰트, 간격 값을
 * React Native StyleSheet에서 바로 쓸 수 있는 형태로 정리.
 *
 * 사용 예시:
 *   import { Colors, FontSize, Spacing, Radius } from '../constants/theme';
 *   color: Colors.blue500
 *   fontSize: FontSize.md
 *   padding: Spacing.md
 */

// ─────────────────────────────────────────────
// 색상 (Colors)
// ─────────────────────────────────────────────
export const Colors = {
  // ── 블루 계열 (포인트 — 활성 탭, 링크, 프로그레스바) ──
  blue800: '#0C447C',
  blue700: '#185FA5',
  blue500: '#2176C7',  // 주 포인트 색상
  blue400: '#378ADD',  // 프로그레스바 fill
  blue100: '#B5D4F4',
  blue50:  '#E6F1FB',  // 블루 배경

  // ── 그레이 계열 (텍스트, 배경, 보더) ──
  gray900: '#0F172A',  // 주요 텍스트, Primary 버튼 배경
  gray800: '#1E293B',  // 아바타 배경 (학부모·admin)
  gray700: '#334155',  // 라벨, 카드 텍스트
  gray600: '#475569',
  gray500: '#64748B',  // 서브 텍스트, 통계 레이블
  gray400: '#94A3B8',  // 비활성 아이콘, 시간 텍스트
  gray300: '#CBD5E1',  // 비활성 탭 아이콘
  gray200: '#E2E8F0',  // 카드 보더, 구분선
  gray100: '#F1F5F9',  // 탭바 배경, 보조 버튼 배경
  gray50:  '#F8FAFC',  // 페이지 배경

  // ── 레드 계열 (결석, D-0, 미제출, 오류) ──
  red:     '#EF4444',
  redBg:   '#FEF2F2',
  redText: '#991B1B',
  redBorder: '#FECACA',

  // ── 그린 계열 (출석, 완료, 성공) ──
  green:     '#10B981',
  greenBg:   '#ECFDF5',
  greenText: '#065F46',
  greenBorder: '#A7F3D0',

  // ── 앰버 계열 (지각, 검사대기, 경고) ──
  amber:     '#F59E0B',
  amberBg:   '#FFFBEB',
  amberText: '#78350F',
  amberBorder: '#FDE68A',

  // ── 기타 ──
  white:   '#FFFFFF',
  kakao:   '#FEE500',  // 카카오 로그인 버튼 배경
  kakaoText: '#191919',

  // ── 헤더/배경 고정값 ──
  headerBg: '#FFFFFF',  // 헤더 배경은 항상 흰색 (역할 무관)
  pageBg:   '#F8FAFC',  // 페이지 배경
  cardBg:   '#FFFFFF',  // 카드 배경
} as const;

// ─────────────────────────────────────────────
// 폰트 크기 (FontSize)
// ─────────────────────────────────────────────
export const FontSize = {
  xs:   10,  // 칩, 네비게이션 라벨, 작은 보조 텍스트
  sm:   11,  // 라벨, 인사말
  md:   12,  // 섹션 라벨, 카드 텍스트
  base: 13,  // 기본 텍스트, 버튼 텍스트
  lg:   14,  // 소제목, 카드 제목
  xl:   15,  // 탑바 제목, 레이블
  xl2:  17,  // 입력값, 버튼 Primary
  xl3:  20,  // 아바타 이니셜
  xl4:  22,  // 통계 숫자, 화면 제목
  xl5:  24,  // 학원명, 학원코드 입력
  xl6:  26,  // 메인 제목 h1
} as const;

// ─────────────────────────────────────────────
// 폰트 두께 (FontWeight)
// ─────────────────────────────────────────────
export const FontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semibold: '600' as const,
  bold:    '700' as const,
  extrabold: '800' as const,
} as const;

// ─────────────────────────────────────────────
// 간격 (Spacing) — padding, margin, gap에 공통 사용
// ─────────────────────────────────────────────
export const Spacing = {
  xs:   2,
  sm:   4,
  md:   6,
  base: 8,
  lg:   10,
  xl:   12,
  xl2:  14,
  xl3:  16,
  xl4:  20,
  xl5:  24,
  xl6:  32,
  xl7:  40,
  xl8:  48,
} as const;

// ─────────────────────────────────────────────
// 보더 반경 (BorderRadius)
// ─────────────────────────────────────────────
export const Radius = {
  xs:   2,   // 작은 요소, 프로그레스바
  sm:   4,   // 아주 작은 칩
  md:   6,   // 탭, 버튼
  base: 8,   // 기본 버튼, 칩/뱃지
  lg:   9,   // 입력 필드, OTP 박스
  xl:   10,  // 입력 필드 (넓은)
  xl2:  12,  // 역할 선택 카드
  xl3:  14,  // 카드 컴포넌트
  xl4:  20,  // 큰 아이콘 배경, pill 뱃지
  full: 999, // 원형 (아바타, 인디케이터)
} as const;

// ─────────────────────────────────────────────
// 컴포넌트 크기 (ComponentSize)
// ─────────────────────────────────────────────
export const Size = {
  // 버튼 높이
  btnHeight: 44,
  btnHeightSm: 36,

  // 탑바
  topBarHeight: 48,

  // 바텀탭
  tabBarHeight: 72,

  // 입력 필드
  inputHeight: 44,

  // 아바타
  avatarLg: 40,
  avatarMd: 36,
  avatarSm: 28,

  // OTP 박스
  otpWidth:  34,
  otpHeight: 42,

  // 아이콘
  iconLg: 24,
  iconMd: 20,
  iconSm: 16,
} as const;

// ─────────────────────────────────────────────
// 그림자 (Shadow) — iOS/Android 공통 처리
// ─────────────────────────────────────────────
export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 4,
  },
} as const;

// ─────────────────────────────────────────────
// 칩 / 뱃지 프리셋 (ChipPreset)
// ─────────────────────────────────────────────
export const ChipStyle = {
  red: {
    backgroundColor: Colors.redBg,
    color: Colors.redText,
  },
  green: {
    backgroundColor: Colors.greenBg,
    color: Colors.greenText,
  },
  amber: {
    backgroundColor: Colors.amberBg,
    color: Colors.amberText,
  },
  blue: {
    backgroundColor: Colors.blue50,
    color: Colors.blue800,
  },
  gray: {
    backgroundColor: Colors.gray100,
    color: Colors.gray700,
  },
  dark: {
    backgroundColor: Colors.gray900,
    color: Colors.white,
  },
  important: {
    backgroundColor: Colors.red,
    color: Colors.white,
  },
  pro: {
    backgroundColor: Colors.greenBg,
    color: Colors.greenText,
    borderColor: Colors.greenBorder,
  },
} as const;

// ─────────────────────────────────────────────
// 버튼 프리셋 (ButtonPreset)
// ─────────────────────────────────────────────
export const ButtonStyle = {
  primary: {
    backgroundColor: Colors.gray900,  // ⚠️ Primary는 항상 거의 검정
    color: Colors.white,
  },
  secondary: {
    backgroundColor: Colors.gray100,
    color: Colors.gray800,
    borderColor: Colors.gray200,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: Colors.redBg,
    color: Colors.redText,
    borderColor: Colors.redBorder,
    borderWidth: 1,
  },
  kakao: {
    backgroundColor: Colors.kakao,
    color: Colors.kakaoText,
  },
  google: {
    backgroundColor: Colors.white,
    color: Colors.gray700,
    borderColor: Colors.gray200,
    borderWidth: 1.5,
  },
  apple: {
    backgroundColor: Colors.gray900,
    color: Colors.white,
  },
} as const;
