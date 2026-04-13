import { create } from 'zustand';
import { AttendanceRecord } from '../types';

interface AttendanceState {
  // ─── 상태 ───────────────────────────────────────────────────────────
  records: Record<string, AttendanceRecord>;    // studentUid → AttendanceRecord 맵
  selectedClassId: string | null;               // 현재 선택된 반 ID
  selectedDate: string | null;                  // 현재 선택된 날짜 (YYYY-MM-DD)
  isLoading: boolean;

  // ─── 액션 ───────────────────────────────────────────────────────────
  setRecords: (records: Record<string, AttendanceRecord>) => void;
  updateRecord: (studentUid: string, record: AttendanceRecord) => void; // 단일 학생 출결 변경
  setSelectedClassId: (classId: string | null) => void;
  setSelectedDate: (date: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearAttendance: () => void;                  // 언마운트/날짜 변경 시 초기화
}

export const useAttendanceStore = create<AttendanceState>((set) => ({
  // 초기값
  records: {},
  selectedClassId: null,
  selectedDate: null,
  isLoading: false,

  // 전체 출결 기록 교체 (날짜·반 변경 시)
  setRecords: (records) => set({ records }),

  // 단일 학생 출결 상태 변경 — 명렬표 실시간 반영용
  updateRecord: (studentUid, record) =>
    set((state) => ({
      records: { ...state.records, [studentUid]: record },
    })),

  // 반 선택 변경
  setSelectedClassId: (selectedClassId) => set({ selectedClassId }),

  // 날짜 선택 변경
  setSelectedDate: (selectedDate) => set({ selectedDate }),

  // 로딩 상태 토글
  setLoading: (isLoading) => set({ isLoading }),

  // 전체 초기화
  clearAttendance: () => set({
    records: {},
    selectedClassId: null,
    selectedDate: null,
    isLoading: false,
  }),
}));
