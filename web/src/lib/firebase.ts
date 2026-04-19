import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// VITE_ 접두사 환경변수 사용 (앱의 EXPO_PUBLIC_ 와 동일한 Firebase 프로젝트)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// 앱 중복 초기화 방지
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 웹 환경에서는 experimentalForceLongPolling 불필요 (WebSocket 정상 동작)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
