import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
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

// ⚠️ getReactNativePersistence는 firebase@12.x + Expo 조합에서 onAuthStateChanged를 막아
// 무한 로딩을 유발함 — 해결 전까지 메모리 persistence 유지
export const auth = getAuth(app);

// Firestore 캐시 설정
// - Firebase JS SDK는 React Native에서 IndexedDB 기반 persistentLocalCache 미지원
//   → memoryLocalCache 명시적 사용 (앱 세션 내 캐시, 재시작 시 초기화)
// - 세션 내 오프라인 쓰기는 자동으로 큐에 쌓이고, 재연결 시 자동 동기화됨
// - experimentalForceLongPolling: Expo 환경의 WebSocket 제한 우회
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  });
} catch {
  // 이미 초기화된 경우 기존 인스턴스 반환
  db = getFirestore(app);
}

export { db };
export const storage = getStorage(app);
