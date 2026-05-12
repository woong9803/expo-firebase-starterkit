/**
 * lib/auth.ts — 웅깅(Woongking) 인증 헬퍼 함수
 *
 * Firebase Auth 래퍼 + Firestore users 문서 관리 + 코드 검증 로직을 한 곳에서 관리.
 * 인증 화면(login, register, code-input 등)에서 직접 Firebase를 호출하지 말고
 * 이 파일의 함수를 import해서 사용할 것.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signInWithCustomToken,
  GoogleAuthProvider,
  OAuthProvider,
  UserCredential,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
// 휴대폰 OTP 는 React Native Firebase 네이티브 SDK 사용
// — Web SDK 의 signInWithPhoneNumber 는 RN 환경에서 reCAPTCHA verifier 가 동작하지 않아 auth/argument-error 발생
// — RN Firebase 는 iOS APNs Silent Push, Android SafetyNet 으로 verifier 자동 처리
import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Platform } from 'react-native';
// expo-notifications — APNs 토큰 수신용 (권한 다이얼로그 없이 토큰만 발급)
// iOS Phone Auth 의 silent push verifier 가 동작하려면 APNs 토큰이 RN Firebase Auth 에
// 등록되어 있어야 한다. @react-native-firebase/messaging 은 useFrameworks: 'static' +
// RN 0.83 조합에서 modular header 충돌이 발생해 사용하지 못함.
// → expo-notifications.getDevicePushTokenAsync() 가 내부적으로 APNs 등록을 트리거하고
//    토큰 발급까지 한 번에 처리한다.
import * as Notifications from 'expo-notifications';
import {
  setDoc,
  updateDoc,
  getDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
// 암호학적으로 안전한 난수 — 학원/연동/초대 코드 생성에 사용
// (Math.random() 은 예측 가능 PRNG → 코드 추측 공격 위험)
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
import { auth, db } from './firebase';
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

// ─── 이메일/비밀번호 인증 ───────────────────────────────────────────

/**
 * 이메일/비밀번호 로그인
 * 동일 이메일로 다른 소셜 방식 가입 시 안내 메시지 포함 에러 반환
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error: unknown) {
    const authError = error as { code?: string };
    // 동일 이메일로 소셜 가입된 계정이 있는 경우
    if (authError.code === 'auth/account-exists-with-different-credential') {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      throw new Error(
        `기존 방식(${methods[0]})으로 로그인 후 설정에서 소셜 계정을 연결할 수 있어요`
      );
    }
    throw error;
  }
};

/** 이메일/비밀번호 신규 회원가입 */
export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  return createUserWithEmailAndPassword(auth, email, password);
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
 * Firebase GoogleAuthProvider credential로 변환해 로그인
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  if (!GoogleSignin) {
    throw new Error(
      'Google 로그인 모듈이 없습니다.\n' +
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 환경변수를 설정하고 npx expo run:ios 로 리빌드해주세요.'
    );
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken ?? null;
  const credential = GoogleAuthProvider.credential(idToken);

  return signInWithCredential(auth, credential);
};

/**
 * Apple 로그인 (iOS 전용)
 * 호출 전 반드시 Platform.OS === 'ios' 조건 확인 필요
 * expo-apple-authentication으로 identityToken 획득 후 Firebase OAuthCredential 변환
 */
export const signInWithApple = async (): Promise<UserCredential> => {
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  // Apple identity token → Firebase OAuthCredential 변환
  const oauthProvider = new OAuthProvider('apple.com');
  const credential = oauthProvider.credential({
    idToken: appleCredential.identityToken ?? '',
  });

  return signInWithCredential(auth, credential);
};

/**
 * 카카오 로그인
 * 1. react-native-kakao-login으로 카카오 accessToken 획득
 * 2. Cloud Function `kakaoLogin`에 accessToken 전달 → Firebase Custom Token 발급
 * 3. signInWithCustomToken으로 Firebase 로그인 완료
 *
 * ⚠️ 카카오 Admin Key는 Cloud Function 환경변수에만 있음 — 클라이언트 코드 포함 절대 금지
 */
export const signInWithKakao = async (): Promise<UserCredential> => {
  // 네이티브 모듈 null 체크 — npx expo run:ios 리빌드 전에는 null
  if (!KakaoUser) {
    throw new Error(
      '카카오 로그인 모듈이 없습니다.\n' +
      'EXPO_PUBLIC_KAKAO_APP_KEY 환경변수를 설정하고 npx expo run:ios 로 리빌드해주세요.'
    );
  }
  // @react-native-kakao/user의 login() — accessToken 포함 토큰 반환
  const kakaoToken = await KakaoUser.login();
  const functions = getFunctions();
  const kakaoLoginFn = httpsCallable<
    { accessToken: string },
    { customToken: string; kakaoUser?: { name?: string; email?: string } }
  >(functions, 'kakaoLogin');
  const result = await kakaoLoginFn({ accessToken: kakaoToken.accessToken });
  const credential = await signInWithCustomToken(auth, result.data.customToken);

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
// React Native Firebase 사용 이유: Web SDK 는 RN 환경에서 reCAPTCHA verifier 미동작
// 인증 흐름:
//   1) RN Firebase 로 OTP 발송·검증 (APNs/SafetyNet 으로 verifier 자동)
//   2) 검증 성공 후 RN Firebase 세션은 즉시 signOut — Web SDK 의 currentUser(소셜 로그인) 와 충돌 방지
//   3) phone_verified 플래그만 Firestore users 문서에 저장 (phone-verify.tsx 에서 처리)

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
  // 동작 원리:
  //  1) getDevicePushTokenAsync() 가 [UIApplication registerForRemoteNotifications] 호출
  //  2) iOS 시스템이 application:didRegisterForRemoteNotificationsWithDeviceToken: 콜백 발생
  //  3) Firebase iOS SDK 의 AppDelegate swizzle 이 콜백 가로채 [Auth setAPNSToken] 자동 호출
  //  4) 이후 signInWithPhoneNumber 호출 시 silent push verifier 사용 가능
  // → expo-notifications 가 권한 다이얼로그 없이 토큰 발급만 트리거 (사용자에게 알림 권한 요청 X)
  // production 빌드에서도 보이도록 console.warn 사용 (console.log 는 Hermes 가 strip 가능)
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
  // RN Firebase: iOS APNs Silent Push / Android SafetyNet 으로 verifier 자동 처리
  return rnAuth().signInWithPhoneNumber(formattedPhone);
};

/**
 * OTP 코드 검증
 * - confirm() 으로 코드 일치 여부만 판정
 * - 검증 성공 후 RN Firebase 세션은 signOut — Web SDK 의 소셜 로그인 세션을 보존
 *   (두 SDK 의 auth state 는 별개 — 동시 로그인 시 Firestore Rules 체크에서 충돌 가능)
 */
export const verifyPhoneOtp = async (
  confirmationResult: PhoneConfirmationResult,
  code: string
): Promise<void> => {
  await confirmationResult.confirm(code);
  // 즉시 RN Firebase 세션 정리 — Web SDK 의 currentUser 만 유지되도록
  await rnAuth().signOut();
};

// ─── 소셜 로그인 신규 유저 처리 ──────────────────────────────────────

/**
 * 소셜 로그인 후 Firestore 문서 존재 여부 확인
 * - 존재하면 true (기존 유저 → 자동 라우팅)
 * - 없으면 false (신규 유저 → phone-input으로 온보딩 시작)
 */
export const checkUserDocExists = async (uid: string): Promise<boolean> => {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(Collections.user(uid));
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
  await setDoc(Collections.user(uid), {
    uid,
    ...data,
    created_at: serverTimestamp(),
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
  await updateDoc(Collections.user(uid), { ...data });
};

// ─── 코드 검증 ─────────────────────────────────────────────────────
//
// 모든 온보딩 코드(학원·반·연동) 검증은 validateOnboardingCode Cloud Function을
// 거친다. 클라이언트 직접 쿼리는 무차별 대입 공격(6자리 영숫자 = 36^6)에 취약하므로,
// 서버 rate limit(uid 10분/5회 + IP 10분/20회) 뒤에서만 수행한다.
//
// 반환 규칙:
// - 성공: 서버가 돌려주는 리치 데이터(name/status 등) 그대로 반환
// - 존재하지 않는 코드(not-found): null — 기존 호출부 호환 유지
// - Rate limit(resource-exhausted) 및 기타 오류: 에러 그대로 throw
//   → 화면 레벨에서 e.code === 'functions/resource-exhausted' 로 분기해 안내

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
    const fn = httpsCallable<{ code: string; type: string }, T>(
      getFunctions(),
      'validateOnboardingCode'
    );
    const result = await fn({ code: code.toUpperCase(), type });
    return result.data;
  } catch (e: unknown) {
    const err = e as { code?: string };
    // v9 모듈러 SDK: 'functions/not-found', 일부 버전: 'not-found'
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
 *
 * 보안 고려:
 *  - Math.random() 은 V8 PRNG 라 충분한 출력 샘플로 다음 값 예측 가능 →
 *    6자리(36진수)는 약 22억 경우의 수지만 예측 가능 RNG 라면 공격 범위가 좁아진다
 *  - expo-crypto.getRandomBytes() 는 OS 의 CSPRNG 를 호출 (iOS SecRandom, Android SecureRandom)
 *  - 모듈 편향(modulo bias) 회피: 256 % 36 = 4 → 36의 배수 미만 바이트만 채택
 *
 * Cloud Functions 의 createStudentAccount 는 별도로 crypto.randomInt 를 사용한다
 * (Node.js 표준 crypto). 이 함수는 클라이언트 경로 전용.
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
 * 과거에는 users 컬렉션을 where('phone_number', ...) 로 검색했으나
 * Firestore Rules 가 익명 사용자에게 users 컬렉션 list 권한을 주지 않아
 * "Missing or insufficient permissions" 에러가 발생.
 *
 * → 휴대폰 번호 자체를 문서 ID 로 쓰는 별도 컬렉션을 두고, 단건 get 으로 확인.
 *   (phone_lookups Rules: get 만 허용, list 는 차단)
 */
export const checkPhoneDuplicate = async (
  phoneNumber: string
): Promise<boolean> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const snap = await getDoc(doc(db, 'phone_lookups', formattedPhone));
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
  await setDoc(doc(db, 'phone_lookups', formattedPhone), {
    uid,
    created_at: serverTimestamp(),
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
