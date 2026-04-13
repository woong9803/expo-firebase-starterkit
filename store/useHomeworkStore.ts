import { create } from 'zustand';
import { Homework, Submission } from '../types';

interface HomeworkState {
  // ─── 상태 ───────────────────────────────────────────────────────────
  homeworks: Homework[];                        // 현재 반의 숙제 목록
  selectedHomework: Homework | null;            // 상세 보기 중인 숙제
  submissions: Record<string, Submission>;      // studentUid → Submission 맵
  isLoading: boolean;

  // ─── 액션 ───────────────────────────────────────────────────────────
  setHomeworks: (homeworks: Homework[]) => void;
  setSelectedHomework: (homework: Homework | null) => void;
  setSubmissions: (submissions: Record<string, Submission>) => void;
  setLoading: (isLoading: boolean) => void;
  clearHomework: () => void;                    // 언마운트/로그아웃 시 초기화
}

export const useHomeworkStore = create<HomeworkState>((set) => ({
  // 초기값
  homeworks: [],
  selectedHomework: null,
  submissions: {},
  isLoading: false,

  // 숙제 목록 업데이트
  setHomeworks: (homeworks) => set({ homeworks }),

  // 선택된 숙제 변경 (상세 화면 진입 시)
  setSelectedHomework: (selectedHomework) => set({ selectedHomework }),

  // 제출물 맵 업데이트 (선생님 검사 화면)
  setSubmissions: (submissions) => set({ submissions }),

  // 로딩 상태 토글
  setLoading: (isLoading) => set({ isLoading }),

  // 전체 초기화
  clearHomework: () => set({
    homeworks: [],
    selectedHomework: null,
    submissions: {},
    isLoading: false,
  }),
}));
