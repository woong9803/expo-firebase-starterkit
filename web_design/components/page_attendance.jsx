// ============================================================
// Page: Attendance
// ============================================================

const AttendancePage = () => {
  const [selectedDate, setSelectedDate] = React.useState('2026-04-19');
  const [viewMode, setViewMode] = React.useState('today'); // today | calendar
  const [selectedClass, setSelectedClass] = React.useState(null);

  const byClass = window.DATA.TODAY_BY_CLASS;
  const totals = byClass.reduce((acc, c) => {
    acc.present += c.present; acc.late += c.late; acc.absent += c.absent; acc.total += c.students;
    return acc;
  }, { present: 0, late: 0, absent: 0, total: 0 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">출결 관리</div>
          <div className="page-sub">2026년 4월 19일 · 일요일</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary">
            <Icon path={Icons.calendar} size={15} /> 날짜 선택
          </button>
          <button className="btn btn-primary">
            <Icon path={Icons.download} size={15} /> 월별 출석부 (Excel)
          </button>
        </div>
      </div>

      {/* Top summary */}
      <div className="grid-4">
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>총 대상</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{totals.total}명</div>
          <div className="small muted" style={{ marginTop: 6 }}>전 반 합계</div>
        </div>
        <div className="card" style={{ padding: '18px 20px', borderLeft: '3px solid var(--success)' }}>
          <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>출석</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{totals.present}명</div>
          <div className="small muted" style={{ marginTop: 6 }}>{(totals.present / totals.total * 100).toFixed(1)}%</div>
        </div>
        <div className="card" style={{ padding: '18px 20px', borderLeft: '3px solid var(--warning)' }}>
          <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>지각</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{totals.late}명</div>
          <div className="small muted" style={{ marginTop: 6 }}>{(totals.late / totals.total * 100).toFixed(1)}%</div>
        </div>
        <div className="card" style={{ padding: '18px 20px', borderLeft: '3px solid var(--danger)' }}>
          <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>결석</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{totals.absent}명</div>
          <div className="small muted" style={{ marginTop: 6 }}>{(totals.absent / totals.total * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* By class */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">반별 오늘 출결</div>
              <div className="card-sub">반을 클릭해 상세 보기</div>
            </div>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {byClass.map(c => {
              const rate = (c.present / c.students * 100);
              const selected = selectedClass === c.id;
              return (
                <div key={c.id}
                  onClick={() => setSelectedClass(c.id)}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selected ? 'var(--accent-soft)' : 'transparent',
                    borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                      <div className="small muted" style={{ marginTop: 3 }}>
                        {c.teacher} · {c.schedule}
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {rate.toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 4, alignItems: 'center', height: 6, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${c.present / c.students * 100}%`, height: '100%', background: 'var(--success)' }} />
                    <div style={{ width: `${c.late / c.students * 100}%`, height: '100%', background: 'var(--warning)', marginLeft: -4 }} />
                    <div style={{ width: `${c.absent / c.students * 100}%`, height: '100%', background: 'var(--danger)', marginLeft: -4 }} />
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11.5 }}>
                    <span style={{ color: 'var(--success)' }}>● 출석 {c.present}</span>
                    <span style={{ color: 'var(--warning)' }}>● 지각 {c.late}</span>
                    <span style={{ color: 'var(--danger)' }}>● 결석 {c.absent}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Absence reasons */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {selectedClass ? window.DATA.CLASSES.find(c => c.id === selectedClass)?.name : '결석 사유 확인'}
              </div>
              <div className="card-sub">학부모 제출 사유</div>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>학생</th>
                <th>상태</th>
                <th>사유</th>
                <th>제출 시각</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: '김도현', grade: '초5', status: 'absent', reason: '감기 몸살', time: '15:42' },
                { name: '박서준', grade: '초6', status: 'absent', reason: '가족 경조사 참석', time: '13:10' },
                { name: '이지안', grade: '중2', status: 'late', reason: '학교 보충수업 지연', time: '18:55' },
                { name: '정재민', grade: '중3', status: 'absent', reason: '병원 진료', time: '17:28' },
                { name: '최우빈', grade: '고1', status: 'late', reason: '교통 체증', time: '21:08' },
                { name: '한소희', grade: '고2', status: 'absent', reason: '개인 일정', time: '14:22' },
                { name: '황민아', grade: '중1', status: 'late', reason: '학교 행사', time: '18:48' },
                { name: '강민재', grade: '중2', status: 'absent', reason: '미제출', time: '-' },
              ].map((r, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="small muted">{r.grade}</div>
                  </td>
                  <td>
                    <span className={`badge ${r.status === 'late' ? 'badge-warning' : 'badge-danger'}`}>
                      {r.status === 'late' ? '지각' : '결석'}
                    </span>
                  </td>
                  <td style={{ color: r.reason === '미제출' ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                    {r.reason}
                  </td>
                  <td className="mono small muted">{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calendar heatmap */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">이번달 출석 캘린더</div>
            <div className="card-sub">2026년 4월 · 진한 색상일수록 높은 출석률</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span className="small muted">낮음</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o, i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: `var(--accent)`, opacity: o }} />
            ))}
            <span className="small muted">높음</span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>{d}</div>
            ))}
            {Array.from({ length: 30 }, (_, i) => {
              const day = i - 2; // Apr 1 on Wed
              const isValid = day >= 1 && day <= 30;
              const rate = isValid ? 85 + (day * 11) % 14 : null;
              const opacity = isValid ? (rate - 85) / 14 * 0.85 + 0.15 : 0;
              const isToday = day === 19;
              return (
                <div key={i} style={{
                  aspectRatio: '1.3/1',
                  borderRadius: 6,
                  background: isValid ? 'var(--accent)' : 'transparent',
                  opacity: isValid ? opacity : 0,
                  position: 'relative',
                  border: isToday ? '2px solid var(--text-primary)' : '1px solid transparent',
                }}>
                  {isValid && (
                    <>
                      <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 11, fontWeight: 600, color: opacity > 0.5 ? 'white' : 'var(--text-primary)' }}>{day}</div>
                      <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: opacity > 0.5 ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{rate}%</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

window.AttendancePage = AttendancePage;
