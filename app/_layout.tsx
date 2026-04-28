import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getDoc, onSnapshot } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { Collections } from '../lib/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { initFCM, registerFCMListeners } from '../lib/fcm';
import { configureGoogleSignIn } from '../lib/auth';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { User, Academy } from '../types';
import ErrorBoundary from '../components/ErrorBoundary';

// Firestore 조회에 타임아웃 적용 — 네트워크 지연 시 무한 대기 방지
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    ),
  ]);
}

// ErrorBoundary는 class 컴포넌트이므로 훅을 직접 사용할 수 없음
// → 내부 RootLayoutInner에서 훅을 처리하고, 외부 RootLayout이 ErrorBoundary로 감쌈
function RootLayoutInner() {
  const router   = useRouter();
  const segments = useSegments();
  const { user, setUser, setAcademy, setAcademyId } = useAuthStore();
  // 노치/상태바 영역 높이 — 흰색 오버레이에 사용
  const { top } = useSafeAreaInsets();

  const [initialized, setInitialized] = useState(false);

  // 소셜 로그인 SDK 앱 시작 시 1회 초기화
  useEffect(() => {
    configureGoogleSignIn();
    const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_APP_KEY;
    if (kakaoKey) initializeKakaoSDK(kakaoKey).catch(() => {});
  }, []);

  useEffect(() => {
    // 안전망: 어떤 이유로도 8초 안에 초기화 안 되면 강제 탈출
    const fallbackTimer = setTimeout(() => {
      console.warn('[Auth] fallback timer triggered');
      setUser(null);
      setInitialized(true);
    }, 8000);

    // onAuthStateChanged 자체가 throw할 수 있으므로 try-catch 적용
    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        clearTimeout(fallbackTimer);
        try {
          if (firebaseUser) {
            const userSnap = await withTimeout(
              getDoc(Collections.user(firebaseUser.uid)),
              5000
            );
            if (userSnap.exists()) {
              const userData = userSnap.data() as User;

              // 탈퇴 처리된 계정 감지 — 즉시 로그아웃
              if (userData.deleted_at != null) {
                await firebaseUser.getIdToken(true).catch(() => {}); // 토큰 무효화 시도
                await signOut(auth).catch(() => {});
                setUser(null);
                setInitialized(true);
                clearTimeout(fallbackTimer);
                return;
              }

              setUser(userData);
              if (userData.academy_id) {
                const academySnap = await withTimeout(
                  getDoc(Collections.academy(userData.academy_id)),
                  5000
                );
                if (academySnap.exists()) {
                  setAcademy({ id: academySnap.id, ...academySnap.data() } as Academy);
                  setAcademyId(userData.academy_id);
                }
              }
              // 온보딩 완료된 사용자에게만 FCM 초기화 (토큰 발급 + Firestore 저장)
              if (userData.academy_id && userData.role) {
                initFCM(firebaseUser.uid).catch((e) =>
                  console.warn('[Layout] FCM 초기화 실패:', e)
                );
              }
            } else {
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email ?? '' } as User);
            }
          } else {
            setUser(null);
            setAcademy(null);
            setAcademyId(null);
          }
        } catch (e) {
          console.error('[Auth] 초기화 오류:', e);
          setUser(null);
        } finally {
          setInitialized(true);
        }
      });
    } catch (e) {
      // auth 객체 자체가 깨진 경우 — 비로그인으로 강제 초기화
      console.error('[Auth] onAuthStateChanged 설정 실패:', e);
      clearTimeout(fallbackTimer);
      setUser(null);
      setInitialized(true);
    }

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  // 내 user 문서 실시간 구독 — admin이 assigned_class_ids 등을 변경하면 즉시 반영
  // onAuthStateChanged는 로그인 시 1회만 조회하므로 이후 변경은 감지 못함
  useEffect(() => {
    if (!user?.uid || !user?.role) return;

    const unsub = onSnapshot(
      Collections.user(user.uid),
      (snap) => {
        if (snap.exists()) {
          setUser({ ...snap.data(), uid: snap.id } as User);
        }
      },
      (e) => console.warn('[RootLayout] user 문서 구독 실패:', e)
    );
    return () => unsub();
  }, [user?.uid]);

  // FCM 리스너 등록 — 로그인된 사용자에게만 적용
  // 알림 클릭 딥링크 이동 + 토큰 갱신 자동 업데이트
  useEffect(() => {
    if (!user?.uid || !user?.academy_id || !user?.role) return;
    const cleanup = registerFCMListeners(user.uid);
    return cleanup;
  }, [user?.uid]);

  // 초기화 완료 후 라우팅
  // ⚠️ segments는 의존성에 넣지 않음 — 내비게이션 결과로 segments가 바뀌면
  // effect가 재실행되어 무한 루프가 발생하기 때문
  // user/initialized가 바뀔 때만 리다이렉트 판단, segments는 현재 위치 읽기용으로만 사용
  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // 비로그인 상태인데 앱 안에 있으면 → 로그인 화면으로
      router.replace('/(auth)');
    } else if (user && inAuthGroup) {
      // 로그인 상태인데 auth 화면에 있을 때:
      // 온보딩 완료(academy_id + role 모두 있음)인 경우만 앱으로 이동
      // 온보딩 중인 사용자는 auth 흐름 그대로 유지 — 이름 파라미터 등 보존
      const onboardingComplete = !!(user.academy_id && user.role);
      if (onboardingComplete) {
        router.replace('/(app)');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user]);

  if (!initialized) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  return (
    <>
      {/* 상태바 텍스트(시각, 배터리 등)를 항상 어두운 색으로 표시 */}
      <StatusBar style="dark" />
      <Slot />
      {/* 노치/상태바 영역을 흰색으로 고정 — 모든 화면에 공통 적용
          pointerEvents="none" 으로 터치 이벤트는 아래 화면으로 그대로 전달 */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: top,
          backgroundColor: '#ffffff',
        }}
      />
    </>
  );
}

// 루트 레이아웃 — ErrorBoundary로 전체 앱 크래시 캐치
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RootLayoutInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
