import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// 앱 중복 초기화 방지
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// getAuth: 이미 초기화돼 있으면 기존 인스턴스 반환, 아니면 기본값으로 초기화
// ⚠️ getReactNativePersistence는 firebase@12.x + Expo 조합에서 onAuthStateChanged를 막아
// 무한 로딩을 유발함 — 해결 전까지 메모리 persistence 유지
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
