/**
 * web/src/components/Layout/Header.tsx
 *
 * 대시보드 상단 헤더 — 검색·알림·설정·로그아웃 활성화.
 * - 검색: 학생 이름 입력 → /students?q=… 로 이동 (학생 페이지에서 q 파라미터 수신)
 * - 알림: 오늘 결석/지각·미입력 인원 + 학원 승인 상태 표시 → 항목 클릭 시 해당 페이지 이동
 * - 설정: /settings 로 이동
 */

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { useTodayStats } from '../../hooks/useDashboard';
import { strings } from '../../constants/strings';

// 경로 → 페이지 타이틀/서브타이틀 매핑
const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/': { title: strings.nav.dashboard, sub: '학원 운영 현황을 한눈에 파악하세요' },
  '/students': { title: strings.nav.students, sub: '학생 목록 조회·검색·필터 및 반 관리' },
  '/attendance': { title: strings.nav.attendance, sub: '날짜·반별 출결 확인 및 엑셀 출석부 다운로드' },
  '/attendance/roster': { title: strings.attendance.rosterTitle, sub: '출결을 입력한 날짜만 한 화면에서 비교하세요' },
  '/teachers': { title: strings.nav.teachers, sub: '선생님 계정 관리 및 가입코드 공유' },
  '/notices': { title: strings.nav.notices, sub: '공지 작성·수정·삭제 및 읽음 현황 확인' },
  '/videos': { title: strings.nav.videos, sub: '학습 영상을 반별로 등록·관리하세요' },
  '/subscription': { title: strings.nav.subscription, sub: '플랜 확인·변경 및 결제 내역 조회' },
  '/settings': { title: strings.nav.settings, sub: '학원 정보 수정 및 학원코드 공유' },
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { academy } = useAuthStore();
  const meta = PAGE_META[location.pathname] ?? PAGE_META['/'];

  // ── 검색 입력값 ─────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');

  // 페이지 이동 시 검색어 비우기 (이전 검색어 잔여 표시 방지)
  useEffect(() => {
    setSearchInput('');
  }, [location.pathname]);

  function submitSearch() {
    const q = searchInput.trim();
    if (!q) {
      navigate('/students');
    } else {
      navigate(`/students?q=${encodeURIComponent(q)}`);
    }
  }

  // ── 알림 패널 ─────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: today } = useTodayStats();

  // 알림 항목별로 "확인됨" 처리 — 학원별로 localStorage에 dismissId 셋 보관
  // dismissId는 종류 + 날짜 + 카운트를 포함하므로,
  //   (1) 사용자가 항목을 클릭하면 그 id가 dismissed로 들어가 즉시 사라지고
  //   (2) 카운트가 바뀌거나 날짜가 바뀌면 새 id가 생겨 다시 표시됨.
  const dismissedKey = academy?.id ? `notif_dismissed_${academy.id}` : null;
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !dismissedKey) return new Set();
    try {
      const raw = localStorage.getItem(dismissedKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  // 학원 전환 시 저장된 dismissed 다시 로딩
  useEffect(() => {
    if (!dismissedKey) { setDismissed(new Set()); return; }
    try {
      const raw = localStorage.getItem(dismissedKey);
      setDismissed(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setDismissed(new Set());
    }
  }, [dismissedKey]);

  function dismissOne(dismissId: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(dismissId);
      if (dismissedKey) {
        // 사이즈가 너무 커지지 않도록 최근 200개만 유지
        const arr = Array.from(next).slice(-200);
        localStorage.setItem(dismissedKey, JSON.stringify(arr));
      }
      return next;
    });
  }

  // 오늘 날짜 (dismissId 구성용)
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // 알림 항목 조립
  // - 오늘 결석/지각 학생 N명
  // - 오늘 출결 미입력 학생 N명
  // - 학원 승인 상태 (pending/rejected)
  type NotifItem = {
    id: string;
    dismissId: string; // 학원별 dismissed Set에 저장될 고유 키 (날짜+카운트 포함)
    icon: string;
    title: string;
    desc: string;
    color: string;
    onClick: () => void;
  };
  const rawNotifications: NotifItem[] = [];
  if (academy?.status === 'pending') {
    rawNotifications.push({
      id: 'status-pending',
      dismissId: 'status-pending',
      icon: '⏳',
      title: '학원 승인 대기 중',
      desc: '심사가 끝나면 모든 기능이 활성화돼요.',
      color: '#F59E0B',
      onClick: () => navigate('/approval'),
    });
  }
  if (academy?.status === 'rejected') {
    rawNotifications.push({
      id: 'status-rejected',
      dismissId: 'status-rejected',
      icon: '⚠️',
      title: '학원 승인이 반려되었어요',
      desc: '카카오톡 채널로 문의해주세요.',
      color: '#EF4444',
      onClick: () => navigate('/approval'),
    });
  }
  if (today) {
    const absentCount = (today.absent ?? 0) + (today.late ?? 0);
    if (absentCount > 0) {
      rawNotifications.push({
        id: 'today-absent',
        // 날짜+카운트 변경 시 새 dismissId가 되어 다시 표시됨
        dismissId: `today-absent:${todayKey}:${absentCount}`,
        icon: '🚨',
        title: `오늘 결석·지각 ${absentCount}명`,
        desc: today.absentStudents.slice(0, 2).map((s) => `${s.className} ${s.name}`).join(', ')
          + (today.absentStudents.length > 2 ? ` 외 ${today.absentStudents.length - 2}명` : ''),
        color: '#EF4444',
        onClick: () => { navigate('/attendance'); setNotifOpen(false); },
      });
    }
    if (today.noRecord > 0) {
      rawNotifications.push({
        id: 'today-no-record',
        dismissId: `today-no-record:${todayKey}:${today.noRecord}`,
        icon: '📝',
        title: `출결 미입력 ${today.noRecord}명`,
        desc: '오늘 아직 출결이 입력되지 않은 학생이 있어요.',
        color: '#F59E0B',
        onClick: () => { navigate('/attendance'); setNotifOpen(false); },
      });
    }
  }
  // dismissed Set에 들어있는 항목은 패널·뱃지에서 모두 숨김
  const notifications = rawNotifications.filter((n) => !dismissed.has(n.dismissId));
  const unreadCount = notifications.length;

  // 외부 클릭 시 알림 패널 닫기
  useEffect(() => {
    if (!notifOpen) return;
    function onDown(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notifOpen]);

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

      {/* ── 중앙 검색바 — Enter 시 학생 검색 ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
          style={{ position: 'relative', width: '100%', maxWidth: 380 }}
        >
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="학생 이름 검색 후 Enter"
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
        </form>
      </div>

      {/* ── 우측 아이콘 버튼 영역 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* 알림 버튼 + 드롭다운 */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            style={{
              position: 'relative',
              width: 34, height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: notifOpen ? '#eef1f5' : 'transparent', border: 'none', cursor: 'pointer',
              color: notifOpen ? '#475569' : '#94a3b8', transition: 'background 0.12s',
            }}
            title="알림"
            aria-label="알림"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {/* 미확인 카운트 뱃지 */}
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 14, height: 14, borderRadius: 7,
                padding: '0 4px',
                background: '#EF4444', color: '#fff',
                fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{
              position: 'absolute', top: 42, right: 0,
              width: 340, maxHeight: 420, overflowY: 'auto',
              background: '#fff',
              border: '1px solid #E2E8F0', borderRadius: 12,
              boxShadow: '0 12px 32px rgba(15,23,42,0.14)',
              zIndex: 50,
            }}>
              <div style={{
                padding: '12px 14px', borderBottom: '1px solid #E2E8F0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>알림</span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>
                  {unreadCount > 0 ? `${unreadCount}건` : '확인할 항목 없음'}
                </span>
              </div>

              {notifications.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 12.5 }}>
                  새로운 알림이 없어요 🎉
                </div>
              ) : (
                <div>
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        // 항목을 클릭하면 그 항목만 dismissed로 들어가 즉시 사라짐
                        dismissOne(n.dismissId);
                        n.onClick();
                      }}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '12px 14px',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        background: 'transparent', border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1.2 }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: n.color, margin: 0 }}>{n.title}</p>
                        <p style={{
                          fontSize: 12, color: '#64748B', marginTop: 3,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          lineHeight: 1.4,
                        }}>
                          {n.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 설정 버튼 — /settings 로 이동 */}
        <button
          onClick={() => navigate('/settings')}
          style={{
            width: 34, height: 34, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: location.pathname === '/settings' ? '#eef1f5' : 'transparent',
            border: 'none', cursor: 'pointer',
            color: location.pathname === '/settings' ? '#475569' : '#94a3b8',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f5'; e.currentTarget.style.color = '#475569'; }}
          onMouseLeave={(e) => {
            const isActive = location.pathname === '/settings';
            e.currentTarget.style.background = isActive ? '#eef1f5' : 'transparent';
            e.currentTarget.style.color = isActive ? '#475569' : '#94a3b8';
          }}
          title="학원 설정"
          aria-label="학원 설정"
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
