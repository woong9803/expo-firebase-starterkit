import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/Layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StudentManagement from './pages/StudentManagement';
import AttendanceManagement from './pages/AttendanceManagement';
import RosterCalendar from './pages/RosterCalendar';
import HomeworkManagement from './pages/HomeworkManagement';
import TeacherManagement from './pages/TeacherManagement';
import NoticeManagement from './pages/NoticeManagement';
import VideoManagement from './pages/VideoManagement';
import SubscriptionManagement from './pages/SubscriptionManagement';
import AcademySettings from './pages/AcademySettings';
import PendingApproval from './pages/PendingApproval';

// Firebase Auth 상태 초기화 — 앱 전체에서 사용자 정보 공유
function AppRoutes() {
  useAuth();

  return (
    <Routes>
      {/* 로그인 페이지 — 인증 불필요 */}
      <Route path="/login" element={<Login />} />

      {/* 승인 대기/반려/비활성 안내 — admin 인증만 필요, status 체크는 페이지 내부 */}
      <Route
        path="/approval"
        element={
          <ProtectedRoute requireActive={false}>
            <PendingApproval />
          </ProtectedRoute>
        }
      />

      {/* 대시보드 — admin 전용 + active 상태 필수 */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<StudentManagement />} />
        <Route path="/attendance" element={<AttendanceManagement />} />
        <Route path="/attendance/roster" element={<RosterCalendar />} />
        <Route path="/homework" element={<HomeworkManagement />} />
        <Route path="/teachers" element={<TeacherManagement />} />
        <Route path="/notices" element={<NoticeManagement />} />
        <Route path="/videos" element={<VideoManagement />} />
        <Route path="/subscription" element={<SubscriptionManagement />} />
        <Route path="/settings" element={<AcademySettings />} />
      </Route>

      {/* 정의되지 않은 경로 → 홈으로 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
