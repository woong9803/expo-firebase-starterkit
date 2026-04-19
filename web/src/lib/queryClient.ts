import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 창 포커스 시 자동 재조회 비활성화 (Firestore onSnapshot으로 실시간 동기화)
      refetchOnWindowFocus: false,
      // 에러 발생 시 재시도 1회
      retry: 1,
      // 5분간 캐시 유지
      staleTime: 5 * 60 * 1000,
    },
  },
});
