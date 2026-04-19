import { useNavigate } from 'react-router-dom';
import StatsCard from '../components/StatsCard';
import {
  useTodayStats,
  useClassAttendanceRates,
  useWeeklyTrend,
  useTodayByClass,
  type ClassAttendanceRate,
  type DailyTrend,
  type TodayClassRow,
} from '../hooks/useDashboard';
import { useAuthStore } from '../store/useAuthStore';

// ── SVG 아이콘 헬퍼 ──────────────────────────────────────────
const IconCheck = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconClock = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconX = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconTrend = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const IconPlus = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

// ── 스켈레톤 ──────────────────────────────────────────────────
function Skeleton({ height = 80, radius = 8 }: { height?: number; radius?: number }) {
  return (
    <div className="animate-pulse" style={{ background: '#f1f3f6', borderRadius: radius, height }} />
  );
}

// ── SVG 7일 추이 차트 ─────────────────────────────────────────
function WeekTrendChart({ data }: { data: DailyTrend[] }) {
  if (!data.length) return <Skeleton height={180} />;

  const W = 560, H = 180;
  const pad = { l: 36, r: 12, t: 14, b: 30 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  // 출석률(0~1) 계산
  const rateOf = (d: DailyTrend) => {
    const total = d.present + d.late + d.absent;
    return total > 0 ? d.present / total : 0;
  };

  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;

  // y 범위를 80~100% 사이로 고정해 변화가 잘 보이도록
  const MIN_RATE = 0.8;
  const toY = (rate: number) =>
    pad.t + chartH - ((rate - MIN_RATE) / (1 - MIN_RATE)) * chartH * 0.85 - chartH * 0.08;

  const points = data.map((d, i) => ({
    x: pad.l + i * stepX,
    y: toY(rateOf(d)),
    d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - pad.b} L ${pad.l} ${H - pad.b} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b5bdb" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b5bdb" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 그리드 라인 (80~100% 4구간) */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line
          key={i}
          x1={pad.l} x2={W - pad.r}
          y1={pad.t + chartH * t} y2={pad.t + chartH * t}
          stroke="#e4e7ec"
          strokeDasharray={i === 4 ? '0' : '3 4'}
          strokeWidth="1"
        />
      ))}

      {/* Y축 퍼센트 레이블 */}
      {[100, 95, 90, 85, 80].map((v, i) => (
        <text key={i}
          x={pad.l - 6} y={pad.t + chartH * (i / 4) + 3.5}
          textAnchor="end" fontSize="10" fill="#94a3b8"
        >
          {v}%
        </text>
      ))}

      {/* 그라데이션 영역 */}
      <path d={areaD} fill="url(#trendGrad)" />
      {/* 라인 */}
      <path d={pathD} fill="none" stroke="#3b5bdb" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* 데이터 포인트 + 라벨 */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4"
            fill="#ffffff" stroke="#3b5bdb" strokeWidth="2" />
          <text x={p.x} y={H - 10}
            textAnchor="middle" fontSize="11" fill="#475569" fontWeight="500">
            {p.d.date}
          </text>
          <text x={p.x} y={p.y - 10}
            textAnchor="middle" fontSize="10.5" fill="#0f172a" fontWeight="600">
            {(rateOf(p.d) * 100).toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── 반별 출석률 바 차트 ───────────────────────────────────────
function ClassRateBars({ data }: { data: ClassAttendanceRate[] }) {
  if (!data.length) {
    return <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>데이터가 없습니다</p>;
  }

  const sorted = [...data].sort((a, b) => b.rate - a.rate).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sorted.map((item) => {
        const barColor =
          item.rate >= 95 ? '#0ea371' :
          item.rate >= 90 ? '#3b5bdb' :
          '#d97706';
        return (
          <div key={item.className}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{item.className}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {item.rate}%
              </span>
            </div>
            <div style={{ background: '#f1f3f6', height: 6, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${item.rate}%`,
                height: '100%',
                background: barColor,
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 오늘 반별 출결 테이블 행 ──────────────────────────────────
function TodayClassRow({ row }: { row: TodayClassRow }) {
  const statusBadge = {
    done:        { label: '완료',  cls: 'badge-success' },
    'in-progress': { label: '수업중', cls: 'badge-info' },
    pending:     { label: '예정',  cls: 'badge-neutral' },
  }[row.status];

  return (
    <tr className="table-row">
      <td className="table-cell">
        <p style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</p>
        {row.schedule && (
          <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{row.schedule}</p>
        )}
      </td>
      <td className="table-cell" style={{ color: '#475569' }}>{row.teacher}</td>
      <td className="table-cell">
        <span className={statusBadge.cls}>{statusBadge.label}</span>
      </td>
      <td className="table-cell" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: '#0ea371', fontWeight: 600 }}>{row.present}</span>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>·</span>
        <span style={{ color: '#d97706', fontWeight: 600 }}>{row.late}</span>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>·</span>
        <span style={{ color: '#dc2626', fontWeight: 600 }}>{row.absent}</span>
      </td>
    </tr>
  );
}

// ── 메인 대시보드 ────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, academy } = useAuthStore();

  const { data: todayStats, isLoading: statsLoading } = useTodayStats();
  const { data: classRates, isLoading: ratesLoading } = useClassAttendanceRates();
  const { data: weeklyTrend, isLoading: trendLoading } = useWeeklyTrend();
  const { data: todayByClass, isLoading: classLoading } = useTodayByClass();

  const totalToday =
    (todayStats?.present ?? 0) +
    (todayStats?.late ?? 0) +
    (todayStats?.absent ?? 0) +
    (todayStats?.noRecord ?? 0);

  const monthlyRate =
    classRates && classRates.length > 0
      ? (classRates.reduce((acc, c) => acc + c.rate, 0) / classRates.length).toFixed(1)
      : '0.0';

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
            안녕하세요, {user?.name ?? '원장님'}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            {today} · 총 {totalToday}명 등원 대상
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn-primary" onClick={() => navigate('/notices')}>
            <IconPlus /> 공지 작성
          </button>
        </div>
      </div>

      {/* ── KPI 카드 4개 ── */}
      {statsLoading || ratesLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={110} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatsCard
            label="오늘 출석"
            value={todayStats?.present ?? 0}
            sub={`/ ${totalToday}명`}
            tone="success"
            icon={<IconCheck />}
          />
          <StatsCard
            label="오늘 지각"
            value={todayStats?.late ?? 0}
            sub="명"
            tone="warning"
            icon={<IconClock />}
          />
          <StatsCard
            label="오늘 결석"
            value={todayStats?.absent ?? 0}
            sub="명"
            tone="danger"
            icon={<IconX />}
          />
          <StatsCard
            label="이번달 출석률"
            value={`${monthlyRate}%`}
            tone="info"
            icon={<IconTrend />}
            delta={{ positive: true, value: '+1.2%p', sub: '지난달 대비' }}
          />
        </div>
      )}

      {/* ── 차트 행 (1.5fr : 1fr) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        {/* 최근 7일 출석률 추이 */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>최근 7일 출석률 추이</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>전체 학생 대비 출석 비율</p>
            </div>
          </div>
          <div style={{ padding: '16px 22px 18px' }}>
            {trendLoading
              ? <Skeleton height={180} />
              : <WeekTrendChart data={weeklyTrend ?? []} />
            }
          </div>
        </div>

        {/* 반별 이번달 출석률 */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>반별 이번달 출석률</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>상위 8개 반</p>
          </div>
          <div style={{ padding: '16px 22px 18px' }}>
            {ratesLoading
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[...Array(5)].map((_, i) => <Skeleton key={i} height={28} />)}
                </div>
              : <ClassRateBars data={classRates ?? []} />
            }
          </div>
        </div>
      </div>

      {/* ── 오늘 반별 출결 현황 테이블 ── */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>오늘 반별 출결 현황</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>출석 · 지각 · 결석 순</p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/attendance')}>
            전체 보기
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {classLoading ? (
          <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['반 이름', '담당 선생님', '상태', '출·지·결'].map((h, i) => (
                    <th
                      key={h}
                      className="table-header-cell"
                      style={{ textAlign: i === 3 ? 'right' : 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(todayByClass ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '28px 16px', fontSize: 13, color: '#94a3b8' }}>
                      등록된 반이 없습니다
                    </td>
                  </tr>
                ) : (
                  (todayByClass ?? []).slice(0, 8).map((row) => (
                    <TodayClassRow key={row.id} row={row} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
