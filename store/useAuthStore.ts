import { create } from 'zustand';
import { User, Academy } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  academyId: string | null;   // 현재 로그인 사용자의 학원 ID
  academy: Academy | null;    // 현재 학원 상세 정보
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  setAcademyId: (id: string | null) => void;
  setAcademy: (academy: Academy | null) => void;
  setAssignedClassIds: (ids: string[]) => void; // 선생님 담당반 목록 업데이트
  clearUser: () => void;      // 로그아웃 시 모든 상태 초기화
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  academyId: null,
  academy: null,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setAcademyId: (id) => set({ academyId: id }),
  setAcademy: (academy) => set({ academy }),
  // 선생님 담당반 목록을 store에 즉시 반영 (Firestore 저장 후 호출)
  setAssignedClassIds: (ids) =>
    set((state) => ({
      user: state.user ? { ...state.user, assigned_class_ids: ids } : null,
    })),
  // 로그아웃 시 사용자·학원 정보 모두 초기화
  clearUser: () => set({ user: null, academyId: null, academy: null }),
}));
