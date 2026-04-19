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
  signInWithPhoneNumber,
  GoogleAuthProvider,
  OAuthProvider,
  ConfirmationResult,
  UserCredential,
  ApplicationVerifier,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import {
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import { auth } from './firebase';
import { Collections } from './firestore';
import { User } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const KakaoLogin = require('react-native-kakao-login').default as {
  login: () => Promise<{ accessToken: string }>;
  logout: () => Promise<void>;
};

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
  });
};

/**
 * Google 로그인
 * @react-native-google-signin/google-signin으로 idToken 획득 후
 * Firebase GoogleAuthProvider credential로 변환해 로그인
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  if (!GoogleSignin) {
    throw new Error('Google 로그인을 사용하려면 앱을 빌드해야 합니다.');
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
  const kakaoToken = await KakaoLogin.login();
  const functions = getFunctions();
  const kakaoLoginFn = httpsCallable<
    { accessToken: string },
    { customToken: string }
  >(functions, 'kakaoLogin');
  const result = await kakaoLoginFn({ accessToken: kakaoToken.accessToken });
  return signInWithCustomToken(auth, result.data.customToken);
};

// ─── 휴대폰 OTP 인증 ───────────────────────────────────────────────

/**
 * 휴대폰 OTP 발송
 * - 중복 번호 체크 선행 (이미 가입된 번호면 'DUPLICATE_PHONE' 에러 throw)
 * - appVerifier: expo-firebase-recaptcha의 FirebaseRecaptchaVerifierModal ref 전달
 * - 반환된 ConfirmationResult를 verifyPhoneOtp에 그대로 전달할 것
 */
export const sendPhoneOtp = async (
  phoneNumber: string,
  appVerifier?: ApplicationVerifier
): Promise<ConfirmationResult> => {
  // 이미 가입된 번호인지 먼저 확인
  const isDuplicate = await checkPhoneDuplicate(phoneNumber);
  if (isDuplicate) {
    // phone-verify.tsx에서 strings.errors.duplicatePhone으로 표시
    throw new Error('DUPLICATE_PHONE');
  }

  // E.164 국제 전화번호 형식으로 변환 (+82)
  const formattedPhone = formatPhoneNumber(phoneNumber);
  // 네이티브 앱(iOS/Android)에서는 APNs/Silent push로 자동 검증 가능.
  // 웹 빌드나 에뮬레이터 환경에서는 expo-firebase-recaptcha의
  // FirebaseRecaptchaVerifierModal을 appVerifier로 전달해야 함.
  return signInWithPhoneNumber(auth, formattedPhone, appVerifier as ApplicationVerifier);
};

/**
 * OTP 코드 검증
 * sendPhoneOtp에서 반환된 ConfirmationResult와 사용자 입력 6자리 코드를 전달
 */
export const verifyPhoneOtp = async (
  confirmationResult: ConfirmationResult,
  code: string
): Promise<UserCredential> => {
  return confirmationResult.confirm(code);
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

/**
 * 학원코드 검증 (선생님 가입 시)
 * academies 컬렉션에서 academy_code 필드로 검색
 * @returns 유효하면 academyId, 없으면 null
 */
export const validateAcademyCode = async (
  code: string
): Promise<string | null> => {
  const q = query(
    Collections.academies(),
    where('academy_code', '==', code.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id; // academyId
};

/**
 * 반 초대코드 검증 (학생 가입 시)
 * classes 컬렉션에서 invite_code 필드로 검색
 * @returns 유효하면 { classId, academyId }, 없으면 null
 */
export const validateInviteCode = async (
  code: string
): Promise<{ classId: string; academyId: string } | null> => {
  const q = query(
    Collections.classes(),
    where('invite_code', '==', code.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const classDoc = snap.docs[0];
  return {
    classId: classDoc.id,
    academyId: classDoc.data().academy_id as string,
  };
};

/**
 * 자녀 연동코드 검증 (학부모 가입 시)
 * users 컬렉션에서 link_code + role === 'student' 조건으로 검색
 * @returns 유효하면 studentUid, 없으면 null
 */
export const validateLinkCode = async (
  code: string
): Promise<string | null> => {
  const q = query(
    Collections.users(),
    where('link_code', '==', code.toUpperCase()),
    where('role', '==', 'student')
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id; // studentUid
};

// ─── 유틸리티 ───────────────────────────────────────────────────────

/**
 * 6자리 영숫자 랜덤 코드 생성
 * 학생 연동코드(link_code), 반 초대코드(invite_code) 발급에 사용
 */
export const generateLinkCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * 휴대폰 번호 중복 여부 확인
 * users 컬렉션에서 phone_number 필드로 검색
 */
export const checkPhoneDuplicate = async (
  phoneNumber: string
): Promise<boolean> => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const q = query(
    Collections.users(),
    where('phone_number', '==', formattedPhone)
  );
  const snap = await getDocs(q);
  return !snap.empty;
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
