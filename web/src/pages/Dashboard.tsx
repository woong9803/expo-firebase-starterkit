import { useNavigate } from 'react-router-dom';
import StatsCard from '../components/StatsCard';
import {
  useTodayStats,
  useClassAttendanceRates,
  useWeeklyTrend,
  useTodayByClass,
  useOperationSummary,
  useHomeworkProgress,
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

// ── 오늘 반별 출결 카드 ──────────────────────────────────────
function TodayClassCard({ row, onClick }: { row: TodayClassRow; onClick: () => void }) {
  const statusMeta = {
    done:    { label: '완료',  bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
    partial: { label: '부분',  bg: '#FFFBEB', border: '#FDE68A', text: '#78350F' },
    pending: { label: '예정',  bg: '#F1F5F9', border: '#E2E8F0', text: '#475569' },
  }[row.status];

  // 출석률 (지각 포함, 결석/미입력 제외)
  const attended = row.present + row.late;
  const rate = row.total > 0 ? Math.round((attended / row.total) * 100) : 0;
  const barColor =
    row.total === 0 ? '#CBD5E1' :
    rate >= 95 ? '#10B981' :
    rate >= 80 ? '#5B50E8' :
    '#F59E0B';

  // 이름 노출은 최대 3명, 나머지는 +N
  const renderNames = (names: string[]) => {
    if (names.length === 0) return null;
    const display = names.slice(0, 3).join(', ');
    const more = names.length - 3;
    return more > 0 ? `${display} 외 ${more}명` : display;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="card"
      style={{
        padding: 0, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      {/* 헤더: 반 이름 + 상태 뱃지 */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: '#0F172A',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {row.name}
          </p>
          <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
            {row.teacher}{row.schedule ? ` · ${row.schedule}` : ''}
          </p>
        </div>
        <span style={{
          padding: '2px 8px', fontSize: 11, fontWeight: 700,
          background: statusMeta.bg, color: statusMeta.text,
          border: `1px solid ${statusMeta.border}`, borderRadius: 6, flexShrink: 0,
        }}>
          {statusMeta.label}
        </span>
      </div>

      {/* 출석률 바 + 출/지/결 카운트 */}
      <div style={{ padding: '12px 16px 10px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
            출석 {attended}/{row.total}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#0F172A',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {rate}%
          </span>
        </div>
        <div style={{
          background: '#F1F5F9', height: 6, borderRadius: 999,
          overflow: 'hidden', marginBottom: 10,
        }}>
          <div style={{
            width: `${rate}%`, height: '100%', background: barColor,
            borderRadius: 999, transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{
          display: 'flex', gap: 12, fontSize: 11.5,
          fontVariantNumeric: 'tabular-nums', color: '#475569',
        }}>
          <span><b style={{ color: '#10B981' }}>출</b> {row.present}</span>
          <span><b style={{ color: '#F59E0B' }}>지</b> {row.late}</span>
          <span><b style={{ color: '#EF4444' }}>결</b> {row.absent}</span>
          <span style={{ marginLeft: 'auto' }}>
            <b style={{ color: '#94A3B8' }}>미</b> {row.noRecord}
          </span>
        </div>
      </div>

      {/* 결석/미입력 명단 */}
      {(row.absentNames.length > 0 || row.noRecordNames.length > 0) && (
        <div style={{
          padding: '10px 16px 14px', borderTop: '1px solid #F1F5F9',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {row.absentNames.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#991B1B',
                background: '#FEF2F2', border: '1px solid #FECACA',
                padding: '2px 6px', borderRadius: 6, flexShrink: 0,
              }}>
                결석
              </span>
              <span style={{ fontSize: 12, color: '#0F172A', lineHeight: 1.5 }}>
                {renderNames(row.absentNames)}
              </span>
            </div>
          )}
          {row.noRecordNames.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#78350F',
                background: '#FFFBEB', border: '1px solid #FDE68A',
                padding: '2px 6px', borderRadius: 6, flexShrink: 0,
              }}>
                미입력
              </span>
              <span style={{ fontSize: 12, color: '#0F172A', lineHeight: 1.5 }}>
                {renderNames(row.noRecordNames)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 모든게 깔끔할 때 빈 영역 보강 */}
      {row.absentNames.length === 0 && row.noRecordNames.length === 0 && row.total > 0 && (
        <div style={{
          padding: '10px 16px 14px', borderTop: '1px solid #F1F5F9',
        }}>
          <p style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>
            ✓ 결석·미입력 없음
          </p>
        </div>
      )}

      {/* 학생이 없는 반 */}
      {row.total === 0 && (
        <div style={{
          padding: '10px 16px 14px', borderTop: '1px solid #F1F5F9',
        }}>
          <p style={{ fontSize: 12, color: '#94A3B8' }}>
            등록된 학생이 없어요
          </p>
        </div>
      )}
    </div>
  );
}

// ── 즉시 확인 카드 (결석/미입력 명단) ──────────────────────────
interface AttentionListProps {
  title: string;
  count: number;
  tone: 'danger' | 'warning';
  items: { name: string; className: string }[];
  onMore: () => void;
}

function AttentionListCard({ title, count, tone, items, onMore }: AttentionListProps) {
  const palette = {
    danger: { bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444', label: '#991B1B' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B', label: '#78350F' },
  }[tone];

  const display = items.slice(0, 6);
  const more = items.length - display.length;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: palette.dot, flexShrink: 0,
          }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</p>
          <span style={{
            background: palette.bg, color: palette.label, fontSize: 11.5, fontWeight: 700,
            padding: '2px 8px', borderRadius: 999, border: `1px solid ${palette.border}`,
          }}>
            {count}명
          </span>
        </div>
        <button className="btn-ghost btn-sm" onClick={onMore}>
          전체 보기
        </button>
      </div>
      <div style={{ padding: '12px 22px 16px' }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
            오늘은 해당 학생이 없어요
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {display.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: palette.bg,
                border: `1px solid ${palette.border}`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{s.name}</span>
                <span style={{ fontSize: 12, color: palette.label, fontWeight: 500 }}>{s.className}</span>
              </div>
            ))}
            {more > 0 && (
              <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                +{more}명 더 있어요
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 미니 KPI (운영 요약 칸) ────────────────────────────────────
function MiniStat({ label, value, sub, accent }: {
  label: string; value: number | string; sub?: string; accent?: string;
}) {
  return (
    <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, letterSpacing: '-0.01em' }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 800, color: accent ?? '#0f172a',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</p>}
    </div>
  );
}

// ── 숙제 검사 현황 카드 ─────────────────────────────────────────
function HomeworkProgressCard({
  data,
  onMore,
}: {
  data: NonNullable<ReturnType<typeof useHomeworkProgress>['data']>;
  onMore: () => void;
}) {
  const totalSubs = data.pendingCount + data.checkedCount;
  const checkRate = totalSubs > 0 ? Math.round((data.checkedCount / totalSubs) * 100) : 0;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>숙제 검사 현황</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>최근 14일 숙제 기준</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={onMore}>
          숙제 관리로
        </button>
      </div>
      <div style={{ padding: '14px 22px 18px' }}>
        {/* 진행률 바 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            검사 완료 {data.checkedCount} / {totalSubs}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#5B50E8', fontVariantNumeric: 'tabular-nums' }}>
            {checkRate}%
          </span>
        </div>
        <div style={{ background: '#F1F5F9', height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            width: `${checkRate}%`, height: '100%',
            background: 'linear-gradient(90deg, #7C3AED, #5B50E8)',
            borderRadius: 999, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* 검사 대기 + D-Day 임박 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{
            padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 10,
          }}>
            <p style={{ fontSize: 11, color: '#78350F', fontWeight: 600 }}>검사 대기</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#92400E', marginTop: 2 }}>
              {data.pendingCount}<span style={{ fontSize: 12, marginLeft: 2 }}>개</span>
            </p>
          </div>
          <div style={{
            padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10,
          }}>
            <p style={{ fontSize: 11, color: '#991B1B', fontWeight: 600 }}>마감 임박 (D-1 이내)</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#B91C1C', marginTop: 2 }}>
              {data.dueSoonCount}<span style={{ fontSize: 12, marginLeft: 2 }}>건</span>
            </p>
          </div>
        </div>

        {/* 검사 우선순위 숙제 리스트 */}
        {data.recentHomeworks.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '14px 0' }}>
            최근 14일 동안 출제된 숙제가 없어요
          </p>
        ) : (
          <div>
            <p style={{
              fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              우선 검사 필요
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.recentHomeworks.map((hw) => {
                const isOverdue = hw.daysLeft < 0;
                const dDay =
                  hw.daysLeft === 0 ? 'D-Day' :
                  isOverdue ? `D+${Math.abs(hw.daysLeft)}` :
                  `D-${hw.daysLeft}`;
                return (
                  <div key={hw.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', background: '#F8FAFC',
                    border: '1px solid #E2E8F0', borderRadius: 8,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: isOverdue ? '#991B1B' : hw.daysLeft <= 1 ? '#92400E' : '#5B50E8',
                      background: isOverdue ? '#FEE2E2' : hw.daysLeft <= 1 ? '#FFFBEB' : '#EEEDF9',
                      padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {dDay}
                    </span>
                    <span style={{
                      fontSize: 12.5, fontWeight: 600, color: '#0f172a',
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {hw.title}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#64748b' }}>{hw.className}</span>
                    <span style={{
                      fontSize: 11.5, fontWeight: 600,
                      color: hw.pending > 0 ? '#92400E' : '#10B981',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {hw.pending > 0 ? `대기 ${hw.pending}` : '완료'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 대시보드 ────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: todayStats, isLoading: statsLoading } = useTodayStats();
  const { data: classRates, isLoading: ratesLoading } = useClassAttendanceRates();
  const { data: weeklyTrend, isLoading: trendLoading } = useWeeklyTrend();
  const { data: todayByClass, isLoading: classLoading } = useTodayByClass();
  const { data: opSummary, isLoading: opLoading } = useOperationSummary();
  const { data: hwProgress, isLoading: hwLoading } = useHomeworkProgress();

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

      {/* ── 오늘 즉시 확인 (결석/미입력 명단) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {statsLoading ? (
          <>
            <Skeleton height={200} radius={14} />
            <Skeleton height={200} radius={14} />
          </>
        ) : (
          <>
            <AttentionListCard
              title="오늘 결석"
              count={todayStats?.absent ?? 0}
              tone="danger"
              items={todayStats?.absentStudents ?? []}
              onMore={() => navigate('/attendance')}
            />
            <AttentionListCard
              title="출결 미입력"
              count={todayStats?.noRecord ?? 0}
              tone="warning"
              items={todayStats?.noRecordStudents ?? []}
              onMore={() => navigate('/attendance')}
            />
          </>
        )}
      </div>

      {/* ── 운영 요약 + 숙제 검사 현황 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        {/* 운영 요약 */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>학원 운영 요약</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              현재 등록된 인원과 플랜 정보
            </p>
          </div>
          {opLoading || !opSummary ? (
            <div style={{ padding: '16px 22px' }}>
              <Skeleton height={120} />
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                borderBottom: '1px solid #F1F5F9',
              }}>
                <MiniStat label="재원 학생" value={opSummary.studentCount} sub="명" />
                <MiniStat label="선생님" value={opSummary.teacherCount} sub="명" />
                <MiniStat label="반" value={opSummary.classCount} sub="개" />
              </div>
              <div style={{ padding: '14px 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>현재 플랜</p>
                    <span style={{
                      padding: '2px 8px', background: '#EEEDF9', color: '#3730A3',
                      borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                    }}>
                      {opSummary.planLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                    {opSummary.planLimit
                      ? `${opSummary.studentCount} / ${opSummary.planLimit}명`
                      : `${opSummary.studentCount}명 (무제한)`}
                  </span>
                </div>
                {opSummary.planLimit && (
                  <div style={{ background: '#F1F5F9', height: 6, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${opSummary.planUsage * 100}%`, height: '100%',
                      background: opSummary.planUsage >= 0.9 ? '#EF4444'
                                : opSummary.planUsage >= 0.7 ? '#F59E0B'
                                : 'linear-gradient(90deg, #7C3AED, #5B50E8)',
                      borderRadius: 999, transition: 'width 0.4s ease',
                    }} />
                  </div>
                )}
                {opSummary.planLimit && opSummary.planUsage >= 0.85 && (
                  <button
                    className="btn-primary btn-sm"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={() => navigate('/subscription')}
                  >
                    플랜 업그레이드
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 숙제 검사 현황 */}
        {hwLoading || !hwProgress ? (
          <Skeleton height={280} radius={14} />
        ) : (
          <HomeworkProgressCard data={hwProgress} onMore={() => navigate('/homework')} />
        )}
      </div>

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

      {/* ── 오늘 반별 출결 카드 그리드 ── */}
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, padding: '0 4px',
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>오늘 반별 출결 현황</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              결석·미입력이 많은 반부터 표시 · 카드 클릭 시 출결 페이지로 이동
            </p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/attendance')}>
            전체 보기
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {classLoading ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
          }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={200} radius={14} />)}
          </div>
        ) : (todayByClass ?? []).length === 0 ? (
          <div className="card" style={{ padding: '40px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>등록된 반이 없습니다</p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
          }}>
            {(todayByClass ?? []).map((row) => (
              <TodayClassCard
                key={row.id}
                row={row}
                onClick={() => navigate('/attendance')}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
