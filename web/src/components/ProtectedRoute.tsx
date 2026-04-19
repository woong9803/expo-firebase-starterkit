import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';

interface Props {
  children: React.ReactNode;
}

// admin role인 경우에만 자식 컴포넌트를 렌더링
// 미인증 또는 비 admin → /login으로 리다이렉트
export default function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuthStore();

  // 인증 상태 로딩 중 — 빈 화면 표시
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-page-bg">
        <p className="text-text-sub text-sm">{strings.common.loading}</p>
      </div>
    );
  }

  // 미인증
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // admin이 아닌 경우 접근 차단
  if (user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
