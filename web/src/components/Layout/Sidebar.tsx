import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';

// 사이드바 메뉴 아이템 정의
const navItems = [
  {
    path: '/',
    label: strings.nav.dashboard,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: '/students',
    label: strings.nav.students,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    path: '/attendance',
    label: strings.nav.attendance,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: '/teachers',
    label: strings.nav.teachers,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    path: '/notices',
    label: strings.nav.notices,
    // 공지 아이템에는 미확인 뱃지를 런타임에서 주입할 수 있도록 badge 필드 예약
    badge: null as number | null,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    path: '/subscription',
    label: strings.nav.subscription,
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
];

// 이니셜 아바타 — HSL 색상 자동 배정
function InitialAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = name
    ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    : 200;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `hsl(${hue}, 55%, 48%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#fff',
        fontSize: size * 0.38,
        fontWeight: 700,
      }}
    >
      {name?.charAt(0) ?? '관'}
    </div>
  );
}

export default function Sidebar() {
  const { user, academy } = useAuthStore();

  return (
    <aside
      className="h-screen flex flex-col fixed left-0 top-0 z-20"
      style={{ width: 240, background: '#0f1523', borderRight: '1px solid #1e2636' }}
    >
      {/* ── 로고 + 학원명 ── */}
      <div
        style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid #1e2636',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 로고 마크 */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#3b5bdb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px' }}>
              웅
            </span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
              {strings.app.name}
            </p>
            <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2, marginTop: 1 }}>
              {academy?.name ?? '관리자 콘솔'}
            </p>
          </div>
        </div>
      </div>

      {/* ── 네비게이션 ── */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        <p style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 10px 8px' }}>
          메뉴
        </p>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              marginBottom: 2,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#ffffff' : '#cbd5e1',
              background: isActive ? '#243049' : 'transparent',
              textDecoration: 'none',
              transition: 'background 0.12s, color 0.12s',
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              if (!el.style.background.includes('243049')) {
                el.style.background = '#1a2234';
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              if (!el.style.background.includes('243049')) {
                el.style.background = 'transparent';
              }
            }}
          >
            {({ isActive }) => (
              <>
                <span style={{ color: isActive ? '#748ffc' : '#64748b', flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {/* 공지 미확인 뱃지 */}
                {'badge' in item && item.badge != null && item.badge > 0 && (
                  <span style={{
                    background: '#3b5bdb',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: '1px 6px',
                    lineHeight: 1.5,
                  }}>
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── 하단 유저 푸터 ── */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #1e2636',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <InitialAvatar name={user?.name ?? '관'} size={30} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ?? '원장님'}
          </p>
          <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2 }}>원장</p>
        </div>
        <p style={{ fontSize: 10, color: '#1e2636', letterSpacing: '0.02em' }}>v1.0</p>
      </div>
    </aside>
  );
}
