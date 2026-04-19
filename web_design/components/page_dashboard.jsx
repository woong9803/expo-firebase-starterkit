// ============================================================
// Page: Dashboard
// ============================================================

const { TODAY_ATTENDANCE: TA, WEEK_TREND, CLASS_ATTENDANCE } = window.DATA;

const StatCard = ({ label, value, sub, tone, icon, delta }) => (
  <div className="card" style={{ padding: '20px 22px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>{value}</div>
          {sub && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{sub}</div>}
        </div>
        {delta && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: delta.positive ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            <Icon path={delta.positive ? Icons.arrowUp : Icons.arrowDown} size={12} />
            <span>{delta.value}</span>
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, marginLeft: 4 }}>{delta.sub}</span>
          </div>
        )}
      </div>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        display: 'grid', placeItems: 'center',
        background: `var(--${tone}-soft)`, color: `var(--${tone})`,
      }}>
        <Icon path={icon} size={18} />
      </div>
    </div>
  </div>
);

const WeekTrendChart = () => {
  const max = Math.max(...WEEK_TREND.map(d => d.present + d.late + d.absent));
  const H = 180;
  const W = 560;
  const pad = { l: 32, r: 12, t: 12, b: 28 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const stepX = chartW / (WEEK_TREND.length - 1);
  const rate = (d) => d.present / (d.present + d.late + d.absent);
  const points = WEEK_TREND.map((d, i) => ({
    x: pad.l + i * stepX,
    y: pad.t + chartH - rate(d) * chartH * 0.85 - chartH * 0.1,
    d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length-1].x} ${H - pad.b} L ${pad.l} ${H - pad.b} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i}
          x1={pad.l} x2={W - pad.r}
          y1={pad.t + chartH * t} y2={pad.t + chartH * t}
          stroke="var(--border)" strokeDasharray={i === 4 ? '0' : '3 4'} strokeWidth="1" />
      ))}
      {/* y labels */}
      {[100, 95, 90, 85, 80].map((v, i) => (
        <text key={i} x={pad.l - 8} y={pad.t + chartH * (i / 4) + 3.5}
          textAnchor="end" fontSize="10" fill="var(--text-tertiary)">{v}%</text>
      ))}
      <path d={areaD} fill="url(#trendGrad)" />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="2" />
          <text x={p.x} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--text-secondary)" fontWeight="500">
            {p.d.day}
          </text>
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10.5" fill="var(--text-primary)" fontWeight="600">
            {(rate(p.d) * 100).toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  );
};

const ClassRateBars = () => {
  const sorted = [...CLASS_ATTENDANCE].sort((a, b) => b.rate - a.rate).slice(0, 8);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sorted.map(c => (
        <div key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{c.rate}%</div>
          </div>
          <div style={{ background: 'var(--bg-subtle)', height: 6, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              width: `${c.rate}%`, height: '100%',
              background: c.rate >= 95 ? 'var(--success)' : c.rate >= 90 ? 'var(--accent)' : 'var(--warning)',
              borderRadius: 999, transition: 'width .4s',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const TodayByClassRow = ({ c }) => {
  const statusMap = {
    done: { label: '완료', cls: 'badge-success' },
    'in-progress': { label: '수업중', cls: 'badge-info' },
    pending: { label: '예정', cls: 'badge-neutral' },
  };
  const s = statusMap[c.status];
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{c.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.schedule}</div>
      </td>
      <td style={{ color: 'var(--text-secondary)' }}>{c.teacher}</td>
      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{c.present}</span>
        <span style={{ color: 'var(--text-tertiary)', margin: '0 6px' }}>·</span>
        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{c.late}</span>
        <span style={{ color: 'var(--text-tertiary)', margin: '0 6px' }}>·</span>
        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{c.absent}</span>
      </td>
    </tr>
  );
};

const Dashboard = () => {
  const rate = (TA.present / TA.total * 100).toFixed(1);
  const today = window.DATA.TODAY_BY_CLASS.slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">안녕하세요, 원용기 원장님</div>
          <div className="page-sub">오늘은 2026년 4월 19일 일요일입니다 · 총 {TA.total}명 등원 대상</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary">
            <Icon path={Icons.download} size={15} /> 리포트 다운로드
          </button>
          <button className="btn btn-primary">
            <Icon path={Icons.plus} size={15} /> 공지 작성
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid-4">
        <StatCard
          label="오늘 출석"
          value={TA.present}
          sub={`/ ${TA.total}명`}
          tone="success"
          icon={Icons.checkCircle}
        />
        <StatCard
          label="오늘 지각"
          value={TA.late}
          sub="명"
          tone="warning"
          icon={Icons.clock}
        />
        <StatCard
          label="오늘 결석"
          value={TA.absent}
          sub="명"
          tone="danger"
          icon={Icons.xCircle}
        />
        <StatCard
          label="이번달 출석률"
          value={`${rate}%`}
          tone="info"
          icon={Icons.trend}
          delta={{ positive: true, value: '+1.2%p', sub: '지난달 대비' }}
        />
      </div>

      {/* Chart row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">최근 7일 출석률 추이</div>
              <div className="card-sub">전체 학생 대비 출석 비율</div>
            </div>
            <button className="btn btn-sm btn-ghost">주간 ▾</button>
          </div>
          <div className="card-body">
            <WeekTrendChart />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">반별 이번달 출석률</div>
              <div className="card-sub">상위 8개 반</div>
            </div>
          </div>
          <div className="card-body">
            <ClassRateBars />
          </div>
        </div>
      </div>

      {/* Today by class */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">오늘 반별 출결 현황</div>
            <div className="card-sub">출석 · 지각 · 결석 순</div>
          </div>
          <button className="btn btn-sm btn-ghost">전체 보기 <Icon path={Icons.chevronRight} size={12} /></button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>반 이름</th>
              <th>담당 선생님</th>
              <th>상태</th>
              <th style={{ textAlign: 'right' }}>출·지·결</th>
            </tr>
          </thead>
          <tbody>
            {today.map(c => <TodayByClassRow key={c.id} c={c} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.Dashboard = Dashboard;
