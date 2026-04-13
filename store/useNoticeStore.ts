import { create } from 'zustand';
import { Notice } from '../types';

interface NoticeState {
  // ─── 상태 ───────────────────────────────────────────────────────────
  notices: Notice[];       // 현재 학원의 공지 목록 (실시간 구독)
  isLoading: boolean;

  // ─── 액션 ───────────────────────────────────────────────────────────
  setNotices: (notices: Notice[]) => void;
  setLoading: (isLoading: boolean) => void;
  clearNotice: () => void; // 언마운트/로그아웃 시 초기화
}

export const useNoticeStore = create<NoticeState>((set) => ({
  // 초기값
  notices: [],
  isLoading: false,

  // 공지 목록 업데이트 (onSnapshot 콜백에서 호출)
  setNotices: (notices) => set({ notices }),

  // 로딩 상태 토글
  setLoading: (isLoading) => set({ isLoading }),

  // 전체 초기화
  clearNotice: () => set({
    notices: [],
    isLoading: false,
  }),
}));
