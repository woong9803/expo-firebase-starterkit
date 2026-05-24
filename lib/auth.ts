/**
 * lib/auth.ts — 웅깅(Woongking) 인증 헬퍼 함수 (React Native Firebase)
 *
 * Firebase Auth 래퍼 + Firestore users 문서 관리 + 코드 검증 로직을 한 곳에서 관리.
 * 인증 화면(login, register, code-input 등)에서 직접 Firebase를 호출하지 말고
 * 이 파일의 함수를 import해서 사용할 것.
 *
 * 마이그레이션(2026-05-12): firebase JS SDK → @react-native-firebase/* 전환.
 *   - 자동 세션 persistence (로그인 유지) 확보
 *   - 두 SDK(JS/RN) 동시 사용에서 오던 phone OTP 후 signOut 우회 코드 제거
 */

import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import rnFirestore from '@react-native-firebase/firestore';
import rnFunctions from '@react-native-firebase/functions';
import { Platform } from 'react-native';
// expo-notifications — APNs 토큰 수신용 (권한 다이얼로그 없이 토큰만 발급)
// iOS Phone Auth 의 silent push verifier 가 동작하려면 APNs 토큰이 RN Firebase Auth 에
// 등록되어 있어야 한다. @react-native-firebase/messaging 은 useFrameworks: 'static' +
// RN 0.83 조합에서 modular header 충돌이 발생해 사용하지 못함.
// → expo-notifications.getDevicePushTokenAsync() 가 내부적으로 APNs 등록을 트리거하고
//    토큰 발급까지 한 번에 처리한다.
import * as Notifications from 'expo-notifications';
// 암호학적으로 안전한 난수 — 학원/연동/초대 코드 생성 + Apple nonce 에 사용
import * as Crypto from 'expo-crypto';
// GoogleSignin 지연 로드 — 최상단 import 시 네이티브 모듈 없으면 번들 전체 크래시
// Xcode로 빌드된 바이너리에 네이티브 모듈이 포함된 경우에만 정상 작동
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GoogleSignin } = (() => {
  try {
    return require('@react-native-google-signin/google-signin');
  } catch {
    return { GoogleSignin: null };
  }
})();
import * as AppleAuthentication from 'expo-apple-authentication';
import { db } from './firebase';
import { Collections } from './firestore';
import { User } from '../types';

// @react-native-kakao/user — 지연 로드 (네이티브 모듈 없으면 크래시 방지)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KakaoUser = (() => {
  try {
    return require('@react-native-kakao/user');
  } catch {
    return null;
  }
})();

// ─── 안전 로그아웃 헬퍼 ────────────────────────────────────────────

/**
 * RN Firebase signOut + native 측 keychain/credential 정리 대기
 *
 * 배경(2026-05-21):
 *   로그아웃 직후 즉시 다른 계정으로 이메일/비번 로그인 시도하면
 *   `auth/invalid-credential` ("supplied auth credential is malformed or has expired")
 *   가 발생하는 케이스 확인. JS 측 signOut 은 끝났지만 iOS keychain /
 *   Android SharedPreferences 정리가 비동기로 잠시 더 걸리는 동안
 *   native 가 이전 사용자 컨텍스트로 요청을 보내며 충돌.
 *
 * 처리:
 *   - signOut 호출 후 300ms 대기 → native cleanup 시간 확보
 *   - signOut 실패해도 swallow (이미 로그아웃 상태일 수 있음)
 *   - 모든 로그아웃 호출 지점은 이 헬퍼로 통일 (auth().signOut 직접 호출 금지)
 */
export const safeSignOut = async (): Promise<void> => {
  // ─── FCM 토큰 정리 (signOut 이전에 수행해야 함) ──────────────────
  // 배경(2026-05-21):
  //   같은 디바이스에서 학부모↔학생 등 다른 계정으로 전환할 때,
  //   로그아웃 시 user.fcm_token 을 비우지 않으면 두 user 문서에 동일한
  //   ExponentPushToken 이 남게 됨. 결과적으로 선생님이 학생에게 푸시를
  //   보낼 때 학생 디바이스로 학생용+학부모용 알림이 둘 다 도착하는 버그.
  // 처리:
  //   - signOut 직전에 현재 로그인된 user 문서의 fcm_token 을 빈 문자열로 갱신
  //   - signOut 이후엔 본인 문서 write 권한이 사라지므로 반드시 signOut 전에 수행
  //   - 네트워크 오류 등으로 실패해도 로그아웃 자체는 막지 않음 (swallow)
  try {
    const currentUid = rnAuth().currentUser?.uid;
    if (currentUid) {
      await Collections.user(currentUid)
        .update({ fcm_token: '' })
        .catch((e) => console.warn('[safeSignOut] fcm_token 정리 실패(무시):', e));
    }
  } catch (e) {
    console.warn('[safeSignOut] fcm_token 정리 단계 예외(무시):', e);
  }

  try {
    await rnAuth().signOut();
  } catch (e) {
    // 이미 signOut 된 상태 등은 무시 — 로그만 남김
    console.warn('[safeSignOut] signOut 실패(무시):', e);
  }
  // native keychain/credential persistence 정리 대기
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
};

// ─── 이메일/비밀번호 인증 ───────────────────────────────────────────

/**
 * 이메일/비밀번호 로그인
 * 동일 이메일로 다른 소셜 방식 가입 시 안내 메시지 포함 에러 반환
 *
 * invalid-credential 친화 메시지(2026-05-21):
 *   Firebase Auth SDK 22+ 부터 wrong-password / user-not-found / invalid-email 이
 *   모두 `auth/invalid-credential` 로 통합됨 (보안상 케이스 미공개).
 *   원본 영문 메시지 노출 대신 한국어 친화 안내로 변환.
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseAuthTypes.UserCredential> => {
  try {
    return await rnAuth().signInWithEmailAndPassword(email, password);
  } catch (error: unknown) {
    const authError = error as { code?: string };
    // 동일 이메일로 소셜 가입된 계정이 있는 경우
    if (authError.code === 'auth/account-exists-with-different-credential') {
      const methods = await rnAuth().fetchSignInMethodsForEmail(email);
      throw new Error(
        `기존 방식(${methods[0]})으로 로그인 후 설정에서 소셜 계정을 연결할 수 있어요`
      );
    }
    // wrong-password / user-not-found / invalid-credential 통합 처리
    if (
      authError.code === 'auth/invalid-credential' ||
      authError.code === 'auth/wrong-password' ||
      authError.code === 'auth/user-not-found' ||
      authError.code === 'auth/invalid-email'
    ) {
      throw new Error('이메일 또는 비밀번호를 다시 확인해 주세요.');
    }
    if (authError.code === 'auth/too-many-requests') {
      throw new Error('로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
    }
    if (authError.code === 'auth/network-request-failed') {
      throw new Error('네트워크 연결을 확인해 주세요.');
    }
    if (authError.code === 'auth/user-disabled') {
      throw new Error('비활성화된 계정이에요. 학원에 문의해 주세요.');
    }
    throw error;
  }
};

/** 이메일/비밀번호 신규 회원가입 */
export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseAuthTypes.UserCredential> => {
  return rnAuth().createUserWithEmailAndPassword(email, password);
};

// ─── 소셜 로그인 ───────────────────────────────────────────────────

/**
 * GoogleSignin 초기화 — 앱 시작 시 1회 호출 필요 (app/_layout.tsx에서 호출)
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: Firebase 콘솔 → Authentication → Google → 웹 클라이언트 ID
 */
export const configureGoogleSignIn = () => {
  if (!GoogleSignin) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    // GoogleService-Info.plist가 Xcode 프로젝트에 등록되지 않은 경우 직접 지정
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
};

/**
 * Google 로그인
 * @react-native-google-signin/google-signin으로 idToken 획득 후
 * RN Firebase GoogleAuthProvider credential로 변환해 로그인
 */
export const signInWithGoogle = async (): Promise<FirebaseAuthTypes.UserCredential> => {
  if (!GoogleSignin) {
    throw new Error(
      'Google 로그인 모듈이 없습니다.\n' +
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 환경변수를 설정하고 npx expo run:ios 로 리빌드해주세요.'
    );
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken ?? null;
  const credential = rnAuth.GoogleAuthProvider.credential(idToken);

  return rnAuth().signInWithCredential(credential);
};

/**
 * Apple 로그인 (iOS 전용)
 * 호출 전 반드시 Platform.OS === 'ios' 조건 확인 필요
 *
 * RN Firebase 의 AppleAuthProvider.credential 은 (identityToken, rawNonce) 형태를 요구한다.
 * - rawNonce 를 SHA256 해시한 값을 expo-apple-authentication 의 nonce 로 전달
 * - Apple 이 발급한 identityToken 안에는 hashedNonce 가 포함되어 있고,
 *   Firebase 는 rawNonce 를 자체 해싱해 일치 여부를 검증한다 (replay 공격 방지).
 */
export const signInWithApple = async (): Promise<FirebaseAuthTypes.UserCredential> => {
  // 32바이트 random nonce 생성 (hex 64자)
  const rawNonceBytes = Crypto.getRandomBytes(32);
  const rawNonce = Array.from(rawNonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const credential = rnAuth.AppleAuthProvider.credential(
    appleCredential.identityToken ?? '',
    rawNonce
  );

  return rnAuth().signInWithCredential(credential);
};

/**
 * 카카오 로그인
 * 1. react-native-kakao-login으로 카카오 accessToken 획득
 * 2. Cloud Function `kakaoLogin`에 accessToken 전달 → Firebase Custom Token 발급
 * 3. signInWithCustomToken으로 Firebase 로그인 완료
 *
 * ⚠️ 카카오 Admin Key는 Cloud Function 환경변수에만 있음 — 클라이언트 코드 포함 절대 금지
 */
export const signInWithKakao = async (): Promise<FirebaseAuthTypes.UserCredential> => {
  // 네이티브 모듈 null 체크 — npx expo run:ios 리빌드 전에는 null
  if (!KakaoUser) {
    throw new Error(
      '카카오 로그인 모듈이 없습니다.\n' +
      'EXPO_PUBLIC_KAKAO_APP_KEY 환경변수를 설정하고 npx expo run:ios 로 리빌드해주세요.'
    );
  }
  // @react-native-kakao/user의 login() — accessToken 포함 토큰 반환
  const kakaoToken = await KakaoUser.login();
  const kakaoLoginFn = rnFunctions().httpsCallable<
    { accessToken: string },
    { customToken: string; kakaoUser?: { name?: string; email?: string } }
  >('kakaoLogin');
  const result = await kakaoLoginFn({ accessToken: kakaoToken.accessToken });
  const credential = await rnAuth().signInWithCustomToken(result.data.customToken);

  // 카카오 Custom Token 로그인은 Firebase Auth 의 displayName/email 을 자동으로 채우지 않음
  // → CF 응답으로 받은 카카오 닉네임·이메일을 직접 Firestore users 문서로 저장해야
  //   "내 정보" 화면 등에서 이름이 표시됨
  const kakaoInfo = result.data.kakaoUser;
  if (kakaoInfo?.name || kakaoInfo?.email) {
    const exists = await checkUserDocExists(credential.user.uid);
    if (!exists) {
      // 신규 카카오 유저 — users 문서 즉시 생성 (role 미설정 — 온보딩에서 결정)
      await createUserDoc(credential.user.uid, {
        name: kakaoInfo?.name ?? '',
        email: kakaoInfo?.email ?? '',
      });
    }
  }

  return credential;
};

// ─── 휴대폰 OTP 인증 ───────────────────────────────────────────────
//
// React Native Firebase 사용 — iOS APNs Silent Push / Android SafetyNet 으로 verifier 자동
// (Web SDK 의 reCAPTCHA verifier 는 RN 환경에서 동작하지 않음)
//
// 마이그레이션 후 변경: 이제 메인 인증도 RN Firebase 라 phone OTP 검증 후
// 별도 signOut 이 필요 없다. 이전엔 Web SDK 의 currentUser 와 충돌 회피 목적으로 signOut.

// RN Firebase ConfirmationResult 타입을 외부에서도 쓰도록 re-export
export type PhoneConfirmationResult = FirebaseAuthTypes.ConfirmationResult;

/**
 * 휴대폰 OTP 발송 (RN Firebase 네이티브 SDK)
 * - 중복 번호 체크 선행 (이미 가입된 번호면 'DUPLICATE_PHONE' 에러 throw)
 * - 반환된 ConfirmationResult 를 verifyPhoneOtp 에 그대로 전달할 것
 */
export const sendPhoneOtp = async (
  phoneNumber: string
): Promise<PhoneConfirmationResult> => {
  // 이미 가입된 번호인지 먼저 확인
  const isDuplicate = await checkPhoneDuplicate(phoneNumber);
  if (isDuplicate) {
    // phone-verify.tsx 에서 strings.errors.duplicatePhone 으로 표시
    throw new Error('DUPLICATE_PHONE');
  }

  // E.164 국제 전화번호 형식으로 변환 (+82)
  const formattedPhone = formatPhoneNumber(phoneNumber);

  // ─── iOS APNs 토큰 사전 등록 (reCAPTCHA fallback 회피) ─────────────
  // RN Firebase 24.x 는 phone auth 호출 시 APNs 토큰이 등록되어 있어야 silent push verifier 사용
  // 미등록 시 SDK 가 reCAPTCHA 로 자동 fallback → "Verifying you're not a robot..." 무한 루프
  console.warn('[sendPhoneOtp] 진입 / Platform:', Platform.OS);

  if (Platform.OS === 'ios') {
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const apnsToken = tokenData?.data;
      console.warn(
        '[sendPhoneOtp] APNs 토큰:',
        apnsToken ? `수신됨 (${String(apnsToken).slice(0, 10)}…)` : '미수신 (null)'
      );
      // Firebase iOS SDK 의 swizzle 이 토큰 hook 처리하도록 짧은 대기
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('[sendPhoneOtp] APNs 등록 실패:', err.message ?? String(e));
    }
  } else {
    console.warn('[sendPhoneOtp] 분기 skip (iOS 아님)');
  }

  console.warn('[sendPhoneOtp] signInWithPhoneNumber 호출 시작');
  return rnAuth().signInWithPhoneNumber(formattedPhone);
};

/**
 * OTP 코드 검증 — 코드 일치 여부만 판정 (signOut 없음)
 * 마이그레이션 후 메인 SDK 가 RN Firebase 단일이라 세션 격리 작업 불필요.
 */
export const verifyPhoneOtp = async (
  confirmationResult: PhoneConfirmationResult,
  code: string
): Promise<void> => {
  await confirmationResult.confirm(code);
};

// ─── 비밀번호 찾기 (휴대폰 OTP 기반) ────────────────────────────────

/**
 * 비밀번호 찾기용 휴대폰 OTP 발송
 *
 * sendPhoneOtp 와 반대로 "이미 가입된 번호"여야 정상 발송.
 * 등록되지 않은 번호면 'NOT_REGISTERED' 에러로 즉시 실패시켜
 * 잘못된 번호로 SMS 비용·요청 발생을 방지.
 */
export const sendPhoneOtpForReset = async (
  phoneNumber: string
): Promise<PhoneConfirmationResult> => {
  // 등록된 번호인지 먼저 확인
  const isRegistered = await checkPhoneDuplicate(phoneNumber);
  if (!isRegistered) {
    throw new Error('NOT_REGISTERED');
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  // iOS APNs 사전 등록 (silent push verifier 활성화 — sendPhoneOtp 와 동일 처리)
  if (Platform.OS === 'ios') {
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const apnsToken = tokenData?.data;
      console.warn(
        '[sendPhoneOtpForReset] APNs 토큰:',
        apnsToken ? `수신됨 (${String(apnsToken).slice(0, 10)}…)` : '미수신'
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e: unknown) {
      console.warn('[sendPhoneOtpForReset] APNs 등록 실패:', (e as Error).message);
    }
  }

  return rnAuth().signInWithPhoneNumber(formattedPhone);
};

/**
 * 비밀번호 재설정 Cloud Function 호출 래퍼
 *
 * 호출 전제: phone OTP 인증 완료 → phone-auth 로 sign-in 된 상태.
 * 서버에서 토큰의 phone_number 와 입력 phoneNumber 매칭 검증.
 *
 * 성공 시 진짜 user(이메일/소셜 가입자)의 비번이 갱신되고
 * 임시 phone-only user 는 서버에서 자동 정리됨.
 */
export const resetPasswordByPhone = async (
  phoneNumber: string,
  newPassword: string
): Promise<void> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  // CF 는 asia-northeast3 region 에 배포됨
  // RN Firebase 의 region 지정 패턴: .app().functions(region).httpsCallable(name)
  const fn = rnFunctions
    .app()
    .functions('asia-northeast3')
    .httpsCallable<
      { phoneNumber: string; newPassword: string },
      { success: boolean }
    >('resetPasswordByPhone');
  await fn({ phoneNumber: formattedPhone, newPassword });
};

// ─── 소셜 로그인 신규 유저 처리 ──────────────────────────────────────

/**
 * 소셜 로그인 후 Firestore 문서 존재 여부 확인
 * - 존재하면 true (기존 유저 → 자동 라우팅)
 * - 없으면 false (신규 유저 → phone-input으로 온보딩 시작)
 */
export const checkUserDocExists = async (uid: string): Promise<boolean> => {
  const snap = await Collections.user(uid).get();
  return snap.exists();
};

// ─── Firestore 사용자 문서 관리 ─────────────────────────────────────

/**
 * Firestore users/{uid} 문서 최초 생성
 * 회원가입 직후 이름·이메일·역할 등 기본 정보 저장 시 사용
 */
export const createUserDoc = async (
  uid: string,
  data: Partial<Omit<User, 'uid' | 'created_at'>>
): Promise<void> => {
  await Collections.user(uid).set({
    uid,
    ...data,
    created_at: rnFirestore.FieldValue.serverTimestamp(),
  });
};

/**
 * Firestore users/{uid} 문서 업데이트
 * 온보딩 완료(역할 확정, 학원 연결) 후 추가 정보 저장 시 사용
 */
export const updateUserDoc = async (
  uid: string,
  data: Partial<Omit<User, 'uid' | 'created_at'>>
): Promise<void> => {
  await Collections.user(uid).update({ ...data });
};

// ─── 코드 검증 ─────────────────────────────────────────────────────
//
// 모든 온보딩 코드(학원·반·연동) 검증은 validateOnboardingCode Cloud Function을
// 거친다. 클라이언트 직접 쿼리는 무차별 대입 공격(6자리 영숫자 = 36^6)에 취약하므로,
// 서버 rate limit(uid 10분/5회 + IP 10분/20회) 뒤에서만 수행한다.

export interface AcademyCodeResult {
  academy_id: string;
  name: string;
  status: 'pending' | 'active' | 'rejected';
}

export interface InviteCodeResult {
  class_id: string;
  academy_id: string;
  name: string;
}

export interface LinkCodeResult {
  student_uid: string;
  name: string;
  academy_id: string;
}

/**
 * validateOnboardingCode Cloud Function 공통 호출
 * not-found 는 null 로 변환, rate limit 등 나머지는 throw
 */
async function callValidateCode<T>(
  code: string,
  type: 'academy' | 'invite' | 'link'
): Promise<T | null> {
  try {
    const fn = rnFunctions().httpsCallable<{ code: string; type: string }, T>(
      'validateOnboardingCode'
    );
    const result = await fn({ code: code.toUpperCase(), type });
    return result.data;
  } catch (e: unknown) {
    const err = e as { code?: string };
    // RN Firebase: 'functions/not-found' 또는 'not-found'
    if (err.code === 'functions/not-found' || err.code === 'not-found') {
      return null;
    }
    throw e;
  }
}

/**
 * 학원코드 검증 (선생님 가입 시)
 * @returns 유효하면 { academy_id, name, status }, 없으면 null
 */
export const validateAcademyCode = (
  code: string
): Promise<AcademyCodeResult | null> =>
  callValidateCode<AcademyCodeResult>(code, 'academy');

/**
 * 반 초대코드 검증 (학생 가입 시)
 * @returns 유효하면 { class_id, academy_id, name }, 없으면 null
 */
export const validateInviteCode = (
  code: string
): Promise<InviteCodeResult | null> =>
  callValidateCode<InviteCodeResult>(code, 'invite');

/**
 * 자녀 연동코드 검증 (학부모 가입 시)
 * @returns 유효하면 { student_uid, name, academy_id }, 없으면 null
 */
export const validateLinkCode = (
  code: string
): Promise<LinkCodeResult | null> =>
  callValidateCode<LinkCodeResult>(code, 'link');

// ─── 유틸리티 ───────────────────────────────────────────────────────

/**
 * 6자리 영숫자 랜덤 코드 생성 — 학생 연동코드(link_code),
 * 학원코드(academy_code), 반 초대코드(invite_code) 발급에 사용
 */
export const generateLinkCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const charsLen = chars.length; // 36
  // modulo bias 방지를 위해 36 의 배수 미만 바이트만 사용
  // 256 / 36 = 7.111… → 252(36*7) 미만이면 균등, 그 이상이면 재추첨
  const maxValid = Math.floor(256 / charsLen) * charsLen; // 252
  let result = '';
  while (result.length < 6) {
    // 한 번에 여유분 16바이트 추첨 → 평균 1회 호출로 6자리 완성
    const bytes = Crypto.getRandomBytes(16);
    for (let i = 0; i < bytes.length && result.length < 6; i++) {
      const byte = bytes[i];
      if (byte >= maxValid) continue; // bias 회피 — 재추첨
      result += chars.charAt(byte % charsLen);
    }
  }
  return result;
};

/**
 * 휴대폰 번호 중복 여부 확인
 *
 * phone_lookups/{phone} 문서 존재 여부로 판정.
 * (phone_lookups Rules: get 만 허용, list 는 차단)
 */
export const checkPhoneDuplicate = async (
  phoneNumber: string
): Promise<boolean> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const snap = await db.collection('phone_lookups').doc(formattedPhone).get();
  return snap.exists();
};

/**
 * phone_lookups/{phone} 매핑 문서 생성
 * OTP 검증 성공 직후 호출 — 다음 가입 시 중복 체크에 사용됨
 */
export const recordPhoneLookup = async (
  phoneNumber: string,
  uid: string
): Promise<void> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  await db.collection('phone_lookups').doc(formattedPhone).set({
    uid,
    created_at: rnFirestore.FieldValue.serverTimestamp(),
  });
};

// ─── 내부 유틸리티 (export 불필요) ──────────────────────────────────

/**
 * 한국 전화번호를 E.164 국제 형식으로 변환
 * 예: 01012345678 → +821012345678
 */
const formatPhoneNumber = (phone: string): string => {
  if (phone.startsWith('+')) return phone;
  // 맨 앞 0 제거 후 +82 접두사 추가
  return `+82${phone.replace(/^0/, '')}`;
};
