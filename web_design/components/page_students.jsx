// ============================================================
// Page: Students
// ============================================================

const StudentsPage = ({ onOpenModal }) => {
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [classFilter, setClassFilter] = React.useState('all');

  const filtered = window.DATA.STUDENTS.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (classFilter !== 'all' && s.classId !== classFilter) return false;
    if (search && !s.name.includes(search)) return false;
    return true;
  });

  const statusBadge = {
    active: { label: '재원', cls: 'badge-success' },
    paused: { label: '휴원', cls: 'badge-warning' },
    withdrawn: { label: '퇴원', cls: 'badge-neutral' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">학생 · 반 관리</div>
          <div className="page-sub">총 {window.DATA.STUDENTS.length}명 · {window.DATA.CLASSES.length}개 반 운영 중</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => onOpenModal('class')}>
            <Icon path={Icons.plus} size={15} /> 반 생성
          </button>
          <button className="btn btn-primary" onClick={() => onOpenModal('student')}>
            <Icon path={Icons.plus} size={15} /> 학생 등록
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-subtle)', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'all', label: '전체', count: window.DATA.STUDENTS.length },
              { id: 'active', label: '재원', count: window.DATA.STUDENTS.filter(s => s.status === 'active').length },
              { id: 'paused', label: '휴원', count: window.DATA.STUDENTS.filter(s => s.status === 'paused').length },
              { id: 'withdrawn', label: '퇴원', count: window.DATA.STUDENTS.filter(s => s.status === 'withdrawn').length },
            ].map(t => (
              <button key={t.id} onClick={() => setFilter(t.id)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: filter === t.id ? 'var(--bg-surface)' : 'transparent',
                  color: filter === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: filter === t.id ? 'var(--shadow-xs)' : 'none',
                }}>
                {t.label} <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>{t.count}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Icon path={Icons.search} size={14} />
            <input className="input" placeholder="이름으로 검색" value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }} />
            <div style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>
              <Icon path={Icons.search} size={14} />
            </div>
          </div>
          <select className="select" style={{ width: 180 }} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="all">전체 반</option>
            {window.DATA.CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm">
            <Icon path={Icons.filter} size={13} /> 상세 필터
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" /></th>
              <th>학생</th>
              <th>소속 반</th>
              <th>학교</th>
              <th>학부모 연락처</th>
              <th>등록일</th>
              <th>이번달 출석률</th>
              <th>상태</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 20).map(s => {
              const badge = statusBadge[s.status];
              return (
                <tr key={s.id}>
                  <td><input type="checkbox" /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 11, background: `hsl(${s.id.slice(-2) * 20} 60% 55%)` }}>
                        {s.name[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="small muted">{s.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{s.grade}</span>
                    <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>{s.className.replace(s.grade + ' ', '')}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.school}</td>
                  <td className="mono" style={{ color: 'var(--text-secondary)' }}>{s.parentPhone}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.enrolledAt}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 5, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${s.attendance}%`, height: '100%',
                          background: s.attendance >= 95 ? 'var(--success)' : s.attendance >= 85 ? 'var(--accent)' : 'var(--warning)',
                        }} />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.attendance}%</span>
                    </div>
                  </td>
                  <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  <td>
                    <button className="header-icon-btn" style={{ width: 28, height: 28 }}>
                      <Icon path={Icons.more} size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
          <div>{filtered.length}명 중 1-{Math.min(20, filtered.length)}명 표시</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm btn-secondary" disabled><Icon path={Icons.chevronLeft} size={13} /></button>
            <button className="btn btn-sm btn-secondary">1</button>
            <button className="btn btn-sm btn-ghost">2</button>
            <button className="btn btn-sm btn-ghost">3</button>
            <button className="btn btn-sm btn-secondary"><Icon path={Icons.chevronRight} size={13} /></button>
          </div>
        </div>
      </div>

      {/* Classes grid */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">반 목록</div>
            <div className="card-sub">각 반을 클릭해 소속 학생과 시간표를 확인하세요</div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => onOpenModal('class')}>
            <Icon path={Icons.plus} size={13} /> 반 추가
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {window.DATA.CLASSES.map(c => (
              <div key={c.id} style={{
                border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
                transition: 'all 0.15s', background: 'var(--bg-surface)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-accent">{c.grade}</span>
                  <button className="header-icon-btn" style={{ width: 24, height: 24 }}>
                    <Icon path={Icons.more} size={13} />
                  </button>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 2 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', gap: 10 }}>
                  <span><Icon path={Icons.user} size={11} /> {c.teacher}</span>
                  <span>·</span>
                  <span>{c.room}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mono">{c.schedule}</span>
                  <span style={{ fontWeight: 600 }}>{c.students}명</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.StudentsPage = StudentsPage;
