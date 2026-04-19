// ============================================================
// Page: Announcements
// ============================================================

const AnnouncementsPage = () => {
  const [selected, setSelected] = React.useState(window.DATA.ANNOUNCEMENTS[0].id);
  const [showEditor, setShowEditor] = React.useState(false);
  const current = window.DATA.ANNOUNCEMENTS.find(a => a.id === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">공지사항</div>
          <div className="page-sub">학생·학부모 대상 공지를 발행하고 읽음 현황을 확인합니다</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowEditor(true)}>
          <Icon path={Icons.plus} size={15} /> 새 공지 작성
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 600 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {['전체', '발행됨', '예약', '임시저장'].map((t, i) => (
              <button key={t} style={{
                padding: '5px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 6,
                background: i === 0 ? 'var(--accent-soft)' : 'transparent',
                color: i === 0 ? 'var(--accent-text)' : 'var(--text-secondary)',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ maxHeight: 700, overflowY: 'auto' }}>
            {window.DATA.ANNOUNCEMENTS.map(a => (
              <div key={a.id} onClick={() => setSelected(a.id)} style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected === a.id ? 'var(--accent-soft)' : 'transparent',
                borderLeft: selected === a.id ? '3px solid var(--accent)' : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.4 }}>{a.title}</div>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{a.createdAt.slice(5)}</span>
                </div>
                <div className="small muted" style={{ marginTop: 4, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {a.body}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <span className="badge badge-neutral" style={{ fontSize: 10.5 }}>{a.target}</span>
                  <span className="small muted" style={{ marginLeft: 'auto', fontWeight: 600 }}>읽음 {a.readRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="card">
          <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <span className="badge badge-accent">{current.target}</span>
              {current.roles.map(r => <span key={r} className="badge badge-neutral">{r}</span>)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{current.title}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
              <span>원용기 원장</span>
              <span>·</span>
              <span>{current.createdAt} 발행</span>
            </div>
          </div>

          <div style={{ padding: '24px 28px', fontSize: 14, lineHeight: 1.75, color: 'var(--text-primary)' }}>
            {current.body}
            <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              * 추가 문의사항은 학원 데스크(02-1234-5678) 또는 담당 선생님께 연락 주시기 바랍니다.
            </div>
          </div>

          {/* Read rate */}
          <div style={{ padding: '0 28px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>읽음 현황</div>
              <div style={{ fontSize: 13 }}>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{current.readCount}</b>
                <span style={{ color: 'var(--text-tertiary)' }}> / {current.totalCount}명 ({current.readRate}%)</span>
              </div>
            </div>
            <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${current.readRate}%`, height: '100%', background: 'var(--success)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
              {[
                { label: '읽음', value: current.readCount, color: 'var(--success)' },
                { label: '미확인', value: current.totalCount - current.readCount, color: 'var(--text-tertiary)' },
                { label: '푸시 발송', value: current.totalCount, color: 'var(--accent)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <div className="small muted">{s.label}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, marginTop: 2, color: s.color }}>{s.value}명</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--bg-subtle)' }}>
            <button className="btn btn-secondary">
              <Icon path={Icons.edit} size={14} /> 수정
            </button>
            <button className="btn btn-secondary">
              <Icon path={Icons.users} size={14} /> 미확인자 재알림
            </button>
            <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>
              <Icon path={Icons.trash} size={14} /> 삭제
            </button>
          </div>
        </div>
      </div>

      {showEditor && (
        <div className="modal-backdrop" onClick={() => setShowEditor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">새 공지 작성</div>
              <button className="header-icon-btn" onClick={() => setShowEditor(false)}>
                <Icon path={Icons.close} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">제목</label>
                <input className="input" placeholder="예: 5월 모의고사 일정 안내" />
              </div>
              <div>
                <label className="label">대상 반</label>
                <select className="select">
                  <option>전체</option>
                  <option>초등 전체</option>
                  <option>중등 전체</option>
                  <option>고등 전체</option>
                  {window.DATA.CLASSES.map(c => <option key={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">수신 대상</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['학생', '학부모'].map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" defaultChecked /> {r}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">본문</label>
                <textarea className="textarea" rows="5" placeholder="공지 내용을 입력하세요..." />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                <input type="checkbox" id="push" defaultChecked />
                <label htmlFor="push">푸시 알림 즉시 발송</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowEditor(false)}>취소</button>
              <button className="btn btn-secondary">임시저장</button>
              <button className="btn btn-primary">발행하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.AnnouncementsPage = AnnouncementsPage;
