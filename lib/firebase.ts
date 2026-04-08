import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth } from 'firebase/auth';
// @ts-ignore — firebase@12.x 타입 정의 누락, 런타임에는 정상 동작
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: FCM 활성화 시 expo-notifications 설치 필요
// 설치: npx expo install expo-notifications

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// 앱이 이미 초기화된 경우 재초기화 방지
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// AsyncStorage 기반 인증 상태 유지 — 앱 재시작 후에도 로그인 유지
export const auth = getApps().length === 1
  ? initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
  : getAuth(app);

export const db = getFirestore(app);
export const storage = getStorage(app);
