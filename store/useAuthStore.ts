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
  // 로그아웃 시 사용자·학원 정보 모두 초기화
  clearUser: () => set({ user: null, academyId: null, academy: null }),
}));
