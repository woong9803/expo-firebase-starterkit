import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, app } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { User, Academy } from '../../../types/index';

// Firebase Auth 상태 감지 + Firestore users/{uid} 조회
// admin role 여부를 포함한 전체 사용자 정보 초기화
export function useAuth() {
  const { user, academy, isLoading, setUser, setAcademy, setLoading, clearUser } =
    useAuthStore();

  useEffect(() => {
    // academy 실시간 구독 해제 함수 — onAuthStateChanged 콜백 외부에 보관해
    // useEffect cleanup / 사용자 전환 시 확실히 해제되도록 한다.
    let unsubAcademy: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // 사용자 전환·로그아웃 시 이전 academy 구독 해제
      if (unsubAcademy) {
        unsubAcademy();
        unsubAcademy = null;
      }

      if (!firebaseUser) {
        clearUser();
        setLoading(false);
        return;
      }

      try {
        // Firestore users/{uid} 문서 조회
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!userDoc.exists()) {
          clearUser();
          setLoading(false);
          return;
        }

        const rawData = userDoc.data();

        // 탈퇴 처리된 계정은 스토어에 올리지 않고 무시
        // signOut은 Login.tsx의 checkAdminAndNavigate에서 처리
        if (rawData.deleted_at) {
          clearUser();
          setLoading(false);
          return;
        }

        // Custom Claim에 role이 없으면 Firestore role로 동기화
        const idTokenResult = await firebaseUser.getIdTokenResult();
        if (!idTokenResult.claims['role'] && rawData.role) {
          try {
            const functions = getFunctions(app, 'asia-northeast3');
            const refresh = httpsCallable(functions, 'refreshMyClaim');
            await refresh({});
            // 갱신된 Custom Claim이 반영된 새 토큰 발급
            await firebaseUser.getIdToken(true);
          } catch (e) {
            console.warn('Custom Claim 동기화 실패:', e);
          }
        }

        const userData = { uid: firebaseUser.uid, ...rawData } as User;
        setUser(userData);

        // 학원 정보 실시간 구독 — 외부 변수에 저장해 다음 사용자 전환 시 해제 가능
        if (userData.academy_id) {
          unsubAcademy = onSnapshot(
            doc(db, 'academies', userData.academy_id),
            (snap) => {
              if (snap.exists()) {
                setAcademy({ id: snap.id, ...snap.data() } as Academy);
              }
            }
          );
        }
      } catch (err) {
        console.error('사용자 정보 조회 실패:', err);
        clearUser();
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubAcademy) unsubAcademy();
    };
  }, [setUser, setAcademy, setLoading, clearUser]);

  return { user, academy, isLoading };
}
