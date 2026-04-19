import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

// 로그인 후 모든 대시보드 페이지의 공통 레이아웃
// 사이드바(200px) + 헤더(52px) + 메인 콘텐츠
export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-page-bg">
      <Sidebar />
      <Header />
      {/* 사이드바(240px) + 헤더(62px) 오프셋 */}
      <main className="min-h-screen" style={{ marginLeft: 240, paddingTop: 62 }}>
        <div style={{ padding: '28px 36px 48px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
