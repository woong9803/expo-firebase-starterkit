import { create } from 'zustand';
import type { User, Academy } from '../../../types/index';

interface AuthState {
  user: User | null;
  academy: Academy | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setAcademy: (academy: Academy | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  academy: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setAcademy: (academy) => set({ academy }),
  setLoading: (isLoading) => set({ isLoading }),
  // 로그아웃 시 모든 상태 초기화
  clearUser: () => set({ user: null, academy: null }),
}));
