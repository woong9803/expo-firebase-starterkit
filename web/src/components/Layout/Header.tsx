import { signOut } from 'firebase/auth';
import { useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';

// 경로 → 페이지 타이틀/서브타이틀 매핑
const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/': { title: strings.nav.dashboard, sub: '학원 운영 현황을 한눈에 파악하세요' },
  '/students': { title: strings.nav.students, sub: '학생 목록 조회·검색·필터 및 반 관리' },
  '/attendance': { title: strings.nav.attendance, sub: '날짜·반별 출결 확인 및 엑셀 출석부 다운로드' },
  '/teachers': { title: strings.nav.teachers, sub: '선생님 계정 관리 및 가입코드 공유' },
  '/notices': { title: strings.nav.notices, sub: '공지 작성·수정·삭제 및 읽음 현황 확인' },
  '/subscription': { title: strings.nav.subscription, sub: '플랜 확인·변경 및 결제 내역 조회' },
};

export default function Header() {
  const location = useLocation();
  const { academy } = useAuthStore();
  const meta = PAGE_META[location.pathname] ?? PAGE_META['/'];

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 240,
        right: 0,
        height: 62,
        background: '#ffffff',
        borderBottom: '1px solid #e4e7ec',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        padding: '0 28px',
        gap: 16,
      }}
    >
      {/* ── 페이지 타이틀 ── */}
      <div style={{ flexShrink: 0, minWidth: 0 }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em', lineHeight: 1.25 }}>
          {meta.title}
        </p>
        <p style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.2, marginTop: 1 }}>
          {academy?.name ?? strings.app.name} · {meta.sub}
        </p>
      </div>

      {/* ── 중앙 검색바 ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 380 }}>
          {/* 돋보기 아이콘 */}
          <svg
            width="14" height="14" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder="학생, 반 이름 검색..."
            style={{
              width: '100%',
              background: '#f6f7f9',
              border: '1px solid #e4e7ec',
              borderRadius: 8,
              padding: '7px 12px 7px 32px',
              fontSize: 13,
              color: '#0f172a',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b5bdb';
              e.currentTarget.style.boxShadow = '0 0 0 3px #eef2ff';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e4e7ec';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* ── 우측 아이콘 버튼 영역 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* 알림 버튼 */}
        <button
          style={{
            width: 34, height: 34, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#94a3b8', transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f5'; e.currentTarget.style.color = '#475569'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          title="알림"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* 설정 버튼 */}
        <button
          style={{
            width: 34, height: 34, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#94a3b8', transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f5'; e.currentTarget.style.color = '#475569'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          title="설정"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 20, background: '#e4e7ec', margin: '0 4px' }} />

        {/* 로그아웃 버튼 */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 500, color: '#94a3b8',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fee4e4'; e.currentTarget.style.color = '#991b1b'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {strings.auth.logout}
        </button>
      </div>
    </header>
  );
}
