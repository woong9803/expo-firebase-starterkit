// KPI 카드 — label / 큰 숫자(+sub) / 아이콘 배지 / 옵션 delta

interface Delta {
  positive: boolean;
  value: string;  // "+1.2%p"
  sub: string;    // "지난달 대비"
}

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'accent';
  icon: React.ReactNode;
  delta?: Delta;
}

const TONE_COLORS = {
  success: { bg: '#e6f7ef', color: '#0ea371' },
  warning: { bg: '#fef3e0', color: '#d97706' },
  danger:  { bg: '#fee4e4', color: '#dc2626' },
  info:    { bg: '#e0f2fe', color: '#0284c7' },
  accent:  { bg: '#eef2ff', color: '#3b5bdb' },
};

export default function StatsCard({ label, value, sub, tone, icon, delta }: Props) {
  const colors = TONE_COLORS[tone];

  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* 텍스트 영역 */}
        <div>
          <p style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.02em' }}>
            {label}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {value}
            </p>
            {sub && (
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{sub}</span>
            )}
          </div>
          {delta && (
            <div style={{
              marginTop: 10,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600,
              color: delta.positive ? '#0ea371' : '#dc2626',
            }}>
              {/* 방향 화살표 */}
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d={delta.positive
                    ? 'M5 15l7-7 7 7'
                    : 'M19 9l-7 7-7-7'} />
              </svg>
              <span>{delta.value}</span>
              <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{delta.sub}</span>
            </div>
          )}
        </div>

        {/* 아이콘 배지 */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          background: colors.bg,
          color: colors.color,
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}
