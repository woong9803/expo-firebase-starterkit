// ============================================================
// Layout: Sidebar + Header
// ============================================================

const Sidebar = ({ currentPage, onNavigate }) => {
  const mainNav = [
    { id: 'dashboard', label: '홈 대시보드', icon: Icons.home },
    { id: 'students', label: '학생 관리', icon: Icons.users },
    { id: 'attendance', label: '출결 관리', icon: Icons.calendar },
    { id: 'teachers', label: '선생님 관리', icon: Icons.teacher },
    { id: 'announcements', label: '공지사항', icon: Icons.megaphone, badge: 2 },
  ];
  const bottomNav = [
    { id: 'billing', label: '구독 / 결제', icon: Icons.card },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">한</div>
        <div>
          <div className="sidebar-brand-text">한빛수학학원</div>
          <div className="sidebar-brand-sub">관리자 콘솔</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {mainNav.map(item => (
          <a
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon path={item.icon} size={17} />
            <span>{item.label}</span>
            {item.badge && <span className="badge">{item.badge}</span>}
          </a>
        ))}

        <div className="nav-section-label">Account</div>
        {bottomNav.map(item => (
          <a
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon path={item.icon} size={17} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">원</div>
        <div className="sidebar-footer-info">
          <div className="sidebar-footer-name">원용기 원장</div>
          <div className="sidebar-footer-role">한빛수학학원 · 원장</div>
        </div>
      </div>
    </aside>
  );
};

const PAGE_TITLES = {
  dashboard: { title: '홈 대시보드', sub: '오늘 학원의 전반적인 현황을 확인하세요' },
  students: { title: '학생 관리', sub: '등록된 학생과 반을 관리합니다' },
  attendance: { title: '출결 관리', sub: '날짜별·반별 출결을 확인하고 출석부를 내보냅니다' },
  teachers: { title: '선생님 관리', sub: '소속 선생님 계정과 담당 반을 관리합니다' },
  announcements: { title: '공지사항', sub: '학생·학부모 대상 공지를 발행하고 읽음 현황을 확인합니다' },
  billing: { title: '구독 / 결제', sub: '플랜을 선택하고 결제 내역을 조회합니다' },
};

const Header = ({ page, onTweaksToggle }) => {
  const info = PAGE_TITLES[page] || PAGE_TITLES.dashboard;
  return (
    <header className="header">
      <div>
        <div className="header-title">{info.title}</div>
        <div className="header-sub">{info.sub}</div>
      </div>
      <div className="header-search">
        <Icon path={Icons.search} size={15} />
        <input placeholder="학생, 반, 선생님 검색… (⌘K)" />
      </div>
      <div className="header-actions">
        <button className="header-icon-btn" title="테마 변경" onClick={onTweaksToggle}>
          <Icon path={Icons.palette} size={17} />
        </button>
        <button className="header-icon-btn">
          <Icon path={Icons.bell} size={17} />
          <span className="dot" />
        </button>
        <button className="header-icon-btn">
          <Icon path={Icons.settings} size={17} />
        </button>
      </div>
    </header>
  );
};

window.Sidebar = Sidebar;
window.Header = Header;
