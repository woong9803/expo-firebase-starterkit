import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';

interface Props {
  children: React.ReactNode;
  // 학원 status 가 'active' 일 때만 접근 허용 (기본 true)
  // false 로 두면 pending/rejected/deactivated 상태에서도 진입 가능 (PendingApproval 페이지용)
  requireActive?: boolean;
}

// admin role인 경우에만 자식 컴포넌트를 렌더링
// 미인증 또는 비 admin → /login으로 리다이렉트
// admin인데 학원이 비활성 → /approval 안내 화면으로 리다이렉트
// admin·active 인데 Pro 플랜이 아니거나 만료됨 → /approval 안내 화면 (Pro 미가입 분기)
//   → 웹 대시보드는 PRD 기준 Pro 전용 기능 (685줄 플랜표)
export default function ProtectedRoute({ children, requireActive = true }: Props) {
  const { user, academy, isLoading } = useAuthStore();

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

  // requireActive=true 인 페이지에서 학원이 비활성이면 안내 화면으로
  // (academy 가 아직 로드 중이면 일단 통과 — useAuth 에서 채움)
  if (requireActive && academy && academy.status !== 'active') {
    return <Navigate to="/approval" replace />;
  }

  // requireActive=true 인 페이지에서 Pro 플랜이 아니거나 만료된 경우 안내 화면으로
  // 만료 체크: plan_expires_at 가 미래여야 통과 (필드 없으면 통과 = trial 등 만료 개념 없는 케이스 고려)
  // 단 학원이 active 상태일 때만 plan 체크 (pending/rejected 는 위에서 이미 처리됨)
  if (requireActive && academy && academy.status === 'active') {
    const expiresAt = academy.plan_expires_at;
    const notExpired =
      !expiresAt ||
      (typeof expiresAt === 'object' && 'toMillis' in expiresAt
        ? expiresAt.toMillis() > Date.now()
        : true);
    const isPro = academy.plan === 'pro' && notExpired;
    if (!isPro) {
      return <Navigate to="/approval" replace />;
    }
  }

  return <>{children}</>;
}
