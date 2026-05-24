/**
 * web/src/pages/PendingApproval.tsx — admin 승인 대기/반려/비활성 안내 페이지
 *
 * 진입 조건 (ProtectedRoute에서 라우팅):
 *   academy.status !== 'active' (pending / rejected / deactivated)
 *
 * 표시 항목:
 *   - 상태별 배너 (대기 ⏳ / 반려 ⚠️ / 비활성 🚫)
 *   - 신청 정보 (학원명·원장·연락처·신청일)
 *   - 반려 사유 (rejected일 때만)
 *   - 카카오톡 문의 + 새로고침 + 다른 계정 로그인
 *
 * 자동 라우팅:
 *   - status === 'active' 로 변경되면 / 로 이동 (실시간 구독)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { useAcademyRealtime } from '../hooks/useAcademy';
import { strings } from '../constants/strings';
import type { Timestamp } from 'firebase/firestore';

// 카카오톡 채널 URL — 운영 환경에서 실제 채널로 교체
const KAKAO_CHANNEL_URL = 'https://pf.kakao.com/_xexamxh';

function formatDate(ts: Timestamp | { toDate: () => Date } | null | undefined): string {
  if (!ts) return '-';
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function PendingApproval() {
  // academy 실시간 구독 — 승인되면 즉시 status 가 active 로 바뀌어 자동 리다이렉트
  useAcademyRealtime();

  const { academy } = useAuthStore();
  const navigate = useNavigate();

  // status active + Pro 플랜(미만료) 일 때만 자동 리다이렉트
  // → status active 라도 Pro 미가입/만료 학원은 ProtectedRoute 가 다시 /approval 로 보내므로
  //   조건 없이 navigate('/') 하면 리다이렉트 루프 발생
  useEffect(() => {
    if (academy?.status !== 'active') return;
    const expiresAt = academy.plan_expires_at;
    const notExpired =
      !expiresAt ||
      (typeof expiresAt === 'object' && 'toMillis' in expiresAt
        ? expiresAt.toMillis() > Date.now()
        : true);
    const isPro = academy.plan === 'pro' && notExpired;
    if (isPro) navigate('/', { replace: true });
  }, [academy?.status, academy?.plan, academy?.plan_expires_at, navigate]);

  // academy 로딩 전엔 빈 화면
  if (!academy) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f9' }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>{strings.common.loading}</p>
      </div>
    );
  }

  const isPending = academy.status === 'pending';
  const isRejected = academy.status === 'rejected';
  // status active 인데 Pro 가 아니거나 만료된 경우 — 웹 대시보드 진입 차단됨
  const isProRequired = academy.status === 'active' && (() => {
    const expiresAt = academy.plan_expires_at;
    const notExpired =
      !expiresAt ||
      (typeof expiresAt === 'object' && 'toMillis' in expiresAt
        ? expiresAt.toMillis() > Date.now()
        : true);
    return !(academy.plan === 'pro' && notExpired);
  })();

  // 상태별 메타 정보
  const meta = isPending
    ? { icon: '⏳', toneBg: '#fffbeb', toneBorder: '#fde68a', toneText: '#78350f',
        title: strings.approval.pendingTitle, desc: strings.approval.pendingDesc, help: strings.approval.pendingHelp }
    : isRejected
    ? { icon: '⚠️', toneBg: '#fef2f2', toneBorder: '#fca5a5', toneText: '#991b1b',
        title: strings.approval.rejectedTitle, desc: strings.approval.rejectedDesc, help: '' }
    : isProRequired
    ? { icon: '🔒', toneBg: '#eef2ff', toneBorder: '#c7d2fe', toneText: '#3730a3',
        title: strings.approval.proRequiredTitle, desc: strings.approval.proRequiredDesc, help: strings.approval.proRequiredHelp }
    : { icon: '🚫', toneBg: '#f8fafc', toneBorder: '#cbd5e1', toneText: '#475569',
        title: strings.approval.deactivatedTitle, desc: strings.approval.deactivatedDesc, help: '' };

  async function handleLogout() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  function handleRefresh() {
    window.location.reload();
  }

  function handleKakao() {
    window.open(KAKAO_CHANNEL_URL, '_blank', 'noopener,noreferrer');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f6f7f9',
      padding: '60px 20px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
    }}>
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 상단 로고/타이틀 */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {strings.app.name}
          </p>
          <p style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>
            {strings.app.dashboardTitle}
          </p>
        </div>

        {/* 상태 배너 */}
        <div style={{
          background: meta.toneBg,
          border: `1px solid ${meta.toneBorder}`,
          borderRadius: 14,
          padding: '32px 28px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 44, marginBottom: 8 }}>{meta.icon}</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: meta.toneText, marginBottom: 8 }}>
            {meta.title}
          </p>
          <p style={{ fontSize: 13.5, color: meta.toneText, lineHeight: 1.6, opacity: 0.85 }}>
            {meta.desc}
          </p>
        </div>

        {/* 반려 사유 (rejected일 때만) */}
        {isRejected && academy.reject_reason && (
          <div className="card" style={{ padding: '18px 22px' }}>
            <p style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
              {strings.approval.rejectReason}
            </p>
            <p style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.6 }}>
              {academy.reject_reason}
            </p>
          </div>
        )}

        {/* 신청 정보 카드 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 22px',
            borderBottom: '1px solid #e4e7ec',
            background: '#fafbfc',
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              {strings.approval.accountInfo}
            </p>
          </div>
          <div style={{ padding: '6px 22px' }}>
            <InfoRow label={strings.approval.academyName} value={academy.name ?? '-'} />
            <InfoRow label={strings.approval.ownerName} value={academy.owner_name ?? '-'} />
            <InfoRow label={strings.approval.ownerPhone} value={academy.owner_phone ?? '-'} />
            {academy.address && <InfoRow label={strings.approval.address} value={academy.address} />}
            <InfoRow label={strings.approval.submittedAt} value={formatDate(academy.submitted_at)} isLast />
          </div>
        </div>

        {/* 도움말 (pending 또는 Pro 미가입 안내일 때) */}
        {(isPending || isProRequired) && meta.help && (
          <p style={{ fontSize: 12.5, color: '#64748b', textAlign: 'center', lineHeight: 1.6, padding: '0 12px' }}>
            {meta.help}
          </p>
        )}

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <button
            className="btn-primary"
            onClick={handleKakao}
            style={{ width: '100%' }}
          >
            💬 {strings.approval.contactKakao}
          </button>
          <button
            className="btn-secondary"
            onClick={handleRefresh}
            title="승인 상태를 다시 확인합니다"
            style={{ width: '100%' }}
          >
            🔄 {strings.approval.refresh}
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={handleLogout}
            style={{ marginTop: 4 }}
          >
            {strings.approval.goToLogin}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 신청 정보 한 줄
function InfoRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: isLast ? 'none' : '1px solid #f1f3f6',
      gap: 12,
    }}>
      <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
