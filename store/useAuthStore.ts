import { create } from 'zustand';
import { User, Academy } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  academyId: string | null;   // 현재 로그인 사용자의 학원 ID
  academy: Academy | null;    // 현재 학원 상세 정보
  // 학부모 전용 — 현재 선택된 자녀 uid (탭 전환 시 모든 화면이 공유)
  selectedChildUid: string | null;
  // pending 상태 admin이 "미리 탐색해보기"를 눌렀을 때 AppLayout pending 체크 우회용
  pendingExploreGranted: boolean;
  // 휴대폰 인증 진행 중인 번호 — reCAPTCHA fallback 으로 앱이 외부에서 복귀했을 때
  // +not-found 화면이 phone-verify 로 사용자를 다시 데려가기 위한 키
  pendingPhoneAuthNumber: string | null;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  setAcademyId: (id: string | null) => void;
  setAcademy: (academy: Academy | null) => void;
  setAssignedClassIds: (ids: string[]) => void; // 선생님 담당반 목록 업데이트
  setSelectedChildUid: (uid: string | null) => void; // 학부모 자녀 선택
  setPendingExploreGranted: (granted: boolean) => void;
  setPendingPhoneAuthNumber: (phone: string | null) => void;
  clearUser: () => void;      // 로그아웃 시 모든 상태 초기화
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  academyId: null,
  academy: null,
  selectedChildUid: null,
  pendingExploreGranted: false,
  pendingPhoneAuthNumber: null,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setAcademyId: (id) => set({ academyId: id }),
  setAcademy: (academy) => set({ academy }),
  // 선생님 담당반 목록을 store에 즉시 반영 (Firestore 저장 후 호출)
  setAssignedClassIds: (ids) =>
    set((state) => ({
      user: state.user ? { ...state.user, assigned_class_ids: ids } : null,
    })),
  // 학부모 자녀 선택 — 전체 화면에 즉시 반영
  setSelectedChildUid: (uid) => set({ selectedChildUid: uid }),
  // "미리 탐색해보기" 클릭 시 pending 체크 우회 허용
  setPendingExploreGranted: (granted) => set({ pendingExploreGranted: granted }),
  // 휴대폰 인증 중인 번호 보관 — phone-input 진입 시 set, 인증 완료 후 null 로 초기화
  setPendingPhoneAuthNumber: (phone) => set({ pendingPhoneAuthNumber: phone }),
  // 로그아웃 시 사용자·학원 정보 + 탐색 허용 플래그 모두 초기화
  clearUser: () => set({
    user: null,
    academyId: null,
    academy: null,
    selectedChildUid: null,
    pendingExploreGranted: false,
    pendingPhoneAuthNumber: null,
  }),
}));
