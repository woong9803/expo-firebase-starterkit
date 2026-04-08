import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { Collections } from '../lib/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { User, Academy } from '../types';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading, setUser, setLoading, setAcademy, setAcademyId } = useAuthStore();

  useEffect(() => {
    // Firebase Auth 상태 변화 감지 — 로그인/로그아웃 자동 처리
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Firestore에서 사용자 상세 정보 로드 (역할·학원 ID 등)
        const userSnap = await getDoc(Collections.user(firebaseUser.uid));

        if (userSnap.exists()) {
          const userData = userSnap.data() as User;
          setUser(userData);

          // 학원 정보도 함께 로드 (pending 상태 판단 등에 사용)
          if (userData.academy_id) {
            const academySnap = await getDoc(Collections.academy(userData.academy_id));
            if (academySnap.exists()) {
              setAcademy({ id: academySnap.id, ...academySnap.data() } as Academy);
              setAcademyId(userData.academy_id);
            }
          }
        } else {
          // Firestore 문서 없음 → 가입 미완료 상태
          setUser(null);
        }
      } else {
        // 로그아웃 → 모든 상태 초기화
        setUser(null);
        setAcademy(null);
        setAcademyId(null);
      }

      setLoading(false);
    });

    // 컴포넌트 언마운트 시 Auth 리스너 해제
    return () => unsubscribe();
  }, []);

  // 인증 상태에 따라 화면 분기
  useEffect(() => {
    if (isLoading) return; // Firebase Auth 확인 중 → 대기

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // 미인증 사용자 → 로그인 화면
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // 인증된 사용자 → 앱 메인 (역할 분기는 (app)/_layout.tsx에서)
      router.replace('/(app)');
    }
  }, [user, isLoading, segments]);

  // 인증 상태 확인 중 로딩 스피너 표시
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  // Slot: 현재 라우트를 그대로 렌더 (Stack 대신 사용 — new arch 호환)
  return <Slot />;
}
