/**
 * lib/firebase.ts — React Native Firebase 인스턴스 export (RN/Expo 앱 전용)
 *
 * @react-native-firebase/* 는 GoogleService-Info.plist (iOS) / google-services.json (Android) 로
 * 네이티브 레이어에서 자동 초기화됨 — firebaseConfig·initializeApp 불필요.
 *
 * 웹 대시보드는 web/src/lib/firebase.ts 를 별도 사용한다.
 *
 * 마이그레이션 메모 (2026-05-12):
 *   기존 firebase JS SDK(firebase@12.x) 의 RN persistence(getReactNativePersistence) 가
 *   Expo + RN 0.83 + useFrameworks: static 조합에서 onAuthStateChanged 무한 대기 유발 →
 *   전체 인증/Firestore/Storage/Functions 를 React Native Firebase 로 이관.
 *   RN Firebase 는 자동으로 keychain/SharedPreferences 에 세션을 저장하므로
 *   "로그인 유지" 가 별도 코드 없이 보장된다.
 */
import { firebase } from '@react-native-firebase/app';
import rnAuth from '@react-native-firebase/auth';
import rnFirestore from '@react-native-firebase/firestore';
import rnStorage from '@react-native-firebase/storage';

// 네이티브 레이어가 자동 초기화 — 인스턴스 호출만으로 동일 싱글톤 반환
export const app = firebase.app();
export const auth = rnAuth();
export const db = rnFirestore();
export const storage = rnStorage();
