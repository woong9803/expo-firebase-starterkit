// ============================================================
// Student Modal (Add)
// ============================================================

const StudentModal = ({ onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title">학생 등록</div>
        <button className="header-icon-btn" onClick={onClose}>
          <Icon path={Icons.close} />
        </button>
      </div>
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">이름</label>
            <input className="input" placeholder="예: 김하린" />
          </div>
          <div>
            <label className="label">학년</label>
            <select className="select">
              <option>선택</option>
              <option>초5</option><option>초6</option>
              <option>중1</option><option>중2</option><option>중3</option>
              <option>고1</option><option>고2</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">학교</label>
          <input className="input" placeholder="예: 한빛초등학교" />
        </div>
        <div>
          <label className="label">배정 반</label>
          <select className="select">
            <option>반을 선택하세요</option>
            {window.DATA.CLASSES.map(c => <option key={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">학부모 성함</label>
            <input className="input" placeholder="예: 김민수" />
          </div>
          <div>
            <label className="label">학부모 연락처</label>
            <input className="input mono" placeholder="010-0000-0000" />
          </div>
        </div>
        <div>
          <label className="label">메모 (선택)</label>
          <textarea className="textarea" rows="3" placeholder="특이사항이나 참고 내용을 입력하세요..." />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary">등록하기</button>
      </div>
    </div>
  </div>
);

// ============================================================
// Class Modal (Create)
// ============================================================
const ClassModal = ({ onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title">반 생성</div>
        <button className="header-icon-btn" onClick={onClose}>
          <Icon path={Icons.close} />
        </button>
      </div>
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">반 이름</label>
          <input className="input" placeholder="예: 중2 심화반 C" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">학년</label>
            <select className="select"><option>선택</option><option>초5</option><option>중1</option></select>
          </div>
          <div>
            <label className="label">강의실</label>
            <input className="input" placeholder="예: 301호" />
          </div>
        </div>
        <div>
          <label className="label">담당 선생님</label>
          <select className="select">
            {window.DATA.TEACHERS.filter(t => t.status === 'active').map(t =>
              <option key={t.id}>{t.name}</option>
            )}
          </select>
        </div>
        <div>
          <label className="label">수업 시간</label>
          <input className="input" placeholder="예: 월/수/금 19:00" />
        </div>
        <div>
          <label className="label">정원</label>
          <input className="input" type="number" placeholder="예: 20" />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary">반 생성</button>
      </div>
    </div>
  </div>
);

// ============================================================
// Tweaks Panel
// ============================================================

const THEMES = [
  { id: 'slate', name: 'Slate Blue', swatch: '#3b5bdb', sub: '차분한 프로페셔널' },
  { id: 'sand', name: 'Warm Sand', swatch: '#b5733a', sub: '따뜻한 크림톤' },
  { id: 'forest', name: 'Forest Green', swatch: '#2e7d5b', sub: '차분한 녹색' },
  { id: 'midnight', name: 'Midnight Dark', swatch: '#6583f0', sub: '다크 모드' },
];

const TweaksPanel = ({ open, theme, onTheme, onClose }) => (
  <div className={`tweaks-panel ${open ? 'open' : ''}`}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div className="tweaks-title">테마 · Tweaks</div>
      <button className="header-icon-btn" style={{ width: 24, height: 24 }} onClick={onClose}>
        <Icon path={Icons.close} size={13} />
      </button>
    </div>
    <div className="tweaks-themes">
      {THEMES.map(t => (
        <button key={t.id}
          className={`tweaks-theme-btn ${theme === t.id ? 'active' : ''}`}
          onClick={() => onTheme(t.id)}>
          <span className="tweaks-swatch" style={{ background: t.swatch }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span>{t.name}</span>
            <span className="small muted" style={{ fontSize: 11 }}>{t.sub}</span>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// ============================================================
// Root App
// ============================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "slate"
}/*EDITMODE-END*/;

const App = () => {
  const [page, setPage] = React.useState(() => localStorage.getItem('hanbit_page') || 'dashboard');
  const [theme, setTheme] = React.useState(TWEAK_DEFAULTS.theme);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [modal, setModal] = React.useState(null);

  React.useEffect(() => { localStorage.setItem('hanbit_page', page); }, [page]);
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // Edit-mode protocol
  React.useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleTheme = (t) => {
    setTheme(t);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { theme: t } }, '*');
  };

  const pages = {
    dashboard: <Dashboard />,
    students: <StudentsPage onOpenModal={setModal} />,
    attendance: <AttendancePage />,
    teachers: <TeachersPage />,
    announcements: <AnnouncementsPage />,
    billing: <BillingPage />,
  };

  return (
    <div className="app">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <div className="main">
        <Header page={page} onTweaksToggle={() => setTweaksOpen(o => !o)} />
        <div className="content" data-screen-label={page}>
          {pages[page]}
        </div>
      </div>

      {modal === 'student' && <StudentModal onClose={() => setModal(null)} />}
      {modal === 'class' && <ClassModal onClose={() => setModal(null)} />}

      <TweaksPanel
        open={tweaksOpen}
        theme={theme}
        onTheme={handleTheme}
        onClose={() => setTweaksOpen(false)}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
