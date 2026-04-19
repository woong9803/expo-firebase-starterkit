// ============================================================
// Page: Teachers
// ============================================================

const TeachersPage = () => {
  const [showCode, setShowCode] = React.useState(false);
  const joinCode = 'HANBIT-MX7K9';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">선생님 관리</div>
          <div className="page-sub">소속 선생님 {window.DATA.TEACHERS.filter(t => t.status === 'active').length}명 · 대기 {window.DATA.TEACHERS.filter(t => t.status === 'pending').length}명</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowCode(true)}>
            <Icon path={Icons.copy} size={15} /> 가입코드 공유
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">소속 선생님</div>
            <button className="btn btn-sm btn-ghost">
              <Icon path={Icons.filter} size={13} /> 필터
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>선생님</th>
                <th>담당 반</th>
                <th>담당 학생</th>
                <th>연락처</th>
                <th>합류일</th>
                <th>상태</th>
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {window.DATA.TEACHERS.map(t => {
                const classes = t.classes.map(cid => window.DATA.CLASSES.find(c => c.id === cid)).filter(Boolean);
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar" style={{ background: `hsl(${t.id.charCodeAt(1) * 60} 55% 55%)` }}>{t.name[0]}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{t.name}</div>
                          <div className="small muted">{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {classes.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {classes.map(c => (
                            <span key={c.id} className="badge badge-neutral" style={{ fontSize: 11 }}>{c.name}</span>
                          ))}
                        </div>
                      ) : <span className="small muted">미배정</span>}
                    </td>
                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{t.students}명</td>
                    <td className="mono small" style={{ color: 'var(--text-secondary)' }}>{t.phone}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.joinedAt}</td>
                    <td>
                      {t.status === 'active'
                        ? <span className="badge badge-success"><span className="dot" /> 활성</span>
                        : <span className="badge badge-warning"><span className="dot" /> 대기</span>}
                    </td>
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, #5a7af0 100%)',
            color: 'white', border: 'none',
          }}>
            <div style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9, fontSize: 12, fontWeight: 600 }}>
                <Icon path={Icons.sparkle} size={14} /> 선생님 초대
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 12, lineHeight: 1.5 }}>
                아래 가입코드를 공유하면<br />선생님이 직접 계정을 만듭니다.
              </div>
              <div style={{
                marginTop: 16, padding: '12px 14px',
                background: 'rgba(255,255,255,0.15)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>{joinCode}</span>
                <button onClick={() => setShowCode(true)} style={{
                  background: 'rgba(255,255,255,0.2)', color: 'white',
                  padding: '5px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                }}>
                  복사
                </button>
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 10 }}>
                유효기간: 무제한 · 언제든 재발급 가능
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">이번주 선생님 활동</div>
            </div>
            <div style={{ padding: '6px 0' }}>
              {[
                { name: '김수연', action: '출결 입력', time: '2시간 전', count: '34명' },
                { name: '박지훈', action: '공지 발행', time: '4시간 전', count: '초6 A반' },
                { name: '이민호', action: '학생 추가', time: '어제', count: '+2명' },
                { name: '최은정', action: '결석 승인', time: '어제', count: '3건' },
                { name: '윤서진', action: '출결 입력', time: '2일 전', count: '66명' },
              ].map((a, i) => (
                <div key={i} style={{ padding: '10px 22px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}><b>{a.name}</b> · {a.action}</div>
                    <div className="small muted" style={{ marginTop: 2 }}>{a.count}</div>
                  </div>
                  <div className="small muted">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCode && (
        <div className="modal-backdrop" onClick={() => setShowCode(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">가입코드 공유</div>
              <button className="header-icon-btn" onClick={() => setShowCode(false)}>
                <Icon path={Icons.close} />
              </button>
            </div>
            <div className="modal-body">
              <div className="small muted" style={{ marginBottom: 14 }}>
                선생님이 아래 코드로 본 학원에 소속되어 계정을 만들 수 있습니다.
              </div>
              <div style={{
                padding: '22px', border: '2px dashed var(--border-strong)', borderRadius: 12,
                textAlign: 'center', background: 'var(--bg-subtle)',
              }}>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.08em' }}>{joinCode}</div>
                <div className="small muted" style={{ marginTop: 8 }}>이 코드는 학원 관리자만 발급할 수 있습니다</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }}>
                  <Icon path={Icons.copy} /> 복사
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }}>
                  <Icon path={Icons.mail} /> 이메일 전송
                </button>
                <button className="btn btn-danger" style={{ flex: 1 }}>재발급</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.TeachersPage = TeachersPage;
