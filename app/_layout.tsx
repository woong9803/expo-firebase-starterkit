import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { Collections } from '../lib/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { User, Academy } from '../types';

// Firestore 조회에 타임아웃 적용 — 네트워크 지연 시 무한 대기 방지
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    ),
  ]);
}

export default function RootLayout() {
  const router   = useRouter();
  const segments = useSegments();
  const { user, setUser, setAcademy, setAcademyId } = useAuthStore();

  const [initialized, setInitialized] = useState(false);

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

  return <Slot />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
