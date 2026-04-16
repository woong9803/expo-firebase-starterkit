import { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
import { useAuthStore } from '../../store/useAuthStore';

/**
 * 역할별 화면 분기 — 앱 전체에서 이 파일 단 한 곳에서만 처리
 * 개별 화면(admin/index.tsx 등)에서 role 체크 절대 금지
 */
export default function AppLayout() {
  const router = useRouter();
  const { user, academy } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // phone_verified 없음 → Firestore 문서 미완료 → phone-verify로
    if (!user.phone_verified && !user.role) {
      router.replace('/(auth)/phone-verify');
      return;
    }

    // academy_id 없음 → 온보딩 미완료 → 역할 선택부터 다시
    if (!user.academy_id) {
      router.replace('/(auth)/role-select');
      return;
    }

    // 역할에 따라 전용 홈 화면으로 이동
    switch (user.role) {
      case 'admin':
        // academy가 null이면 아직 Firestore에서 로딩 중 → 다음 effect 실행까지 대기
        // (academy 등록 직후엔 setAcademy로 미리 채워지므로 null이 아님)
        if (academy === null) break;
        if (academy.status === 'pending') {
          router.replace('/(auth)/pending');
        } else {
          router.replace('/(app)/(admin)');
        }
        break;
      case 'teacher':
        router.replace('/(app)/(teacher)');
        break;
      case 'student':
        router.replace('/(app)/(student)');
        break;
      case 'parent':
        router.replace('/(app)/(parent)');
        break;
    }
  }, [user, academy]);

  return <Slot />;
}
