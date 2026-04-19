# Handoff: 학원 관리자 콘솔 (Academy Admin Console)

## Overview
학원 원장님 전용 admin 패널. 학원 운영 전반을 원장 1인이 관리할 수 있는 데스크톱 웹 콘솔입니다. 홈 대시보드, 학생 관리, 출결 관리, 선생님 관리, 공지사항, 구독/결제의 6개 주요 섹션으로 구성됩니다.

**대상 사용자:** 학원 원장 (admin 권한, 로그인 필수)
**플랫폼:** 데스크톱 웹 (1280px+ 최적화)
**언어:** 한국어

## About the Design Files
이 번들에 포함된 HTML/JSX/CSS 파일은 **디자인 레퍼런스**입니다 — 의도된 룩앤필과 동작을 보여주는 HTML 프로토타입으로, 프로덕션 코드를 그대로 복사해 쓰는 것이 아닙니다. 작업 목표는 **대상 코드베이스의 기존 환경(React, Vue, Next.js 등)에서 이 HTML 디자인을 재현**하는 것입니다. 기존 환경이 없다면 프로젝트에 가장 적합한 프레임워크를 선택해 구현하면 됩니다.

파일들은 React + Babel(inline JSX)로 작성되어 있어 프로덕션 번들링 구조가 아닙니다. 컴포넌트 분해, 상태 관리 패턴, 데이터 fetch, 타입 시스템 등은 대상 코드베이스의 컨벤션을 따르세요.

## Fidelity
**High-fidelity (hifi)** — 최종 컬러/타이포/스페이싱/인터랙션이 픽셀 단위로 정의되어 있습니다. 개발자는 대상 코드베이스의 기존 라이브러리와 패턴으로 UI를 픽셀 퍼펙트하게 재현해야 합니다.

## Design Tokens

### Typography
- **Font family:** Pretendard (https://cdn.jsdelivr.net/gh/orioncactus/pretendard)
  - Fallback: `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif`
- **Mono:** SF Mono / Menlo / Monaco / Consolas
- **Letter-spacing:** body `-0.01em`, headings `-0.025em`
- **Base size:** 14px
- **Scale:**
  - xs: 11px (uppercase labels)
  - sm: 12–12.5px (secondary, badges)
  - base: 13–14px (body, inputs)
  - md: 14.5–16px (card titles, modal titles)
  - lg: 17px (header title)
  - xl: 22px (page title)
  - 2xl: 26–28px (KPI numbers, plan price)

### Colors (Slate Blue — default theme)
```
--bg-page: #f6f7f9
--bg-surface: #ffffff
--bg-subtle: #f1f3f6
--bg-hover: #eef1f5
--bg-sidebar: #0f1523
--bg-sidebar-hover: #1a2234
--bg-sidebar-active: #243049

--border: #e4e7ec
--border-strong: #d0d5dd
--border-sidebar: #1e2636

--text-primary: #0f172a
--text-secondary: #475569
--text-tertiary: #94a3b8
--text-inverse: #f8fafc
--text-sidebar: #cbd5e1
--text-sidebar-muted: #64748b

--accent: #3b5bdb
--accent-hover: #2e4bc3
--accent-soft: #eef2ff

--success: #0ea371 / soft: #e6f7ef
--warning: #d97706 / soft: #fef3e0
--danger:  #dc2626 / soft: #fee4e4
--info:    #0284c7 / soft: #e0f2fe
```

### 추가 테마 (Tweaks로 전환 가능)
- **Warm Sand:** accent `#b5733a`, bg-page `#faf7f2`, sidebar `#2a2320`
- **Forest Green:** accent `#2e7d5b`, bg-page `#f3f7f4`, sidebar `#0d2019`
- **Midnight (dark):** accent `#6583f0`, bg-page `#0b0f19`, surface `#141a27`
(전체 값은 `styles.css`의 `[data-theme="..."]` 블록 참조)

### Spacing / Radius / Shadow
- **Radius:** sm 6px / md 8px / lg 12px / xl 16px / pill 999px
- **Shadows:**
  - xs: `0 1px 2px rgba(16,24,40,0.04)`
  - sm: `0 1px 3px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.04)`
  - md: `0 4px 8px -2px rgba(16,24,40,0.08), 0 2px 4px -2px rgba(16,24,40,0.04)`
  - lg: `0 12px 20px -4px rgba(16,24,40,0.1), 0 4px 8px -2px rgba(16,24,40,0.06)`
- **Common padding:** 카드 body 22px, card-header 18px 22px 16px, table cell 13px 16px

## Layout Skeleton
```
┌────────────┬───────────────────────────────────────────┐
│            │ Header (62px, sticky)                     │
│            ├───────────────────────────────────────────┤
│ Sidebar    │                                           │
│ 240px      │ Content (padding: 28px 36px 48px)         │
│ sticky     │                                           │
│ 100vh      │                                           │
│            │                                           │
└────────────┴───────────────────────────────────────────┘
```
- Grid: `grid-template-columns: 240px 1fr`
- Sidebar: dark surface (`--bg-sidebar`), white text, 로고 + 브랜드 + nav + 유저 푸터
- Header: 페이지 타이틀/서브타이틀 + 중앙 검색바(max 380px) + 우측 아이콘 버튼들(팔레트/벨/설정)

## Screens / Views

### 1) 홈 대시보드 (`dashboard`)
**Purpose:** 오늘 하루 학원 운영 현황을 한눈에 파악

**Layout:**
- Page header: "안녕하세요, 원용기 원장님" + 우측 `리포트 다운로드` / `공지 작성` 버튼
- KPI 4-grid: 오늘 출석 / 오늘 지각 / 오늘 결석 / 이번달 출석률
  - 각 카드: 라벨(12.5px, tertiary) · 값(28px, 700) · 서브(13px) · 우측 40x40 아이콘 배지
  - 이번달 출석률 카드에만 "지난달 대비 +1.2%p" delta 표시 (어제 대비 비교는 제거됨)
- 차트 행 (grid 1.5fr 1fr):
  - 최근 7일 출석률 추이 — SVG 라인 차트 (560x180), gradient area fill, 포인트마다 % 라벨
  - 반별 이번달 출석률 — 상위 8개 반, 가로 바 그래프 (95%↑ success / 90%↑ accent / 그 외 warning)
- 오늘 반별 출결 현황 테이블 — 반 이름/담당/상태 뱃지/출·지·결 숫자

**Components:** `StatCard`, `WeekTrendChart` (SVG), `ClassRateBars`, `TodayByClassRow`

### 2) 학생 관리 (`students`)
**Purpose:** 학생 목록 조회·검색·필터, 등록, 반 관리

**Layout:**
- Page header: 총 학생/반 카운트 + `반 생성` / `학생 등록` 버튼
- 필터 바: pill-tab (전체/재원/휴원/퇴원) + 이름 검색 + 반 select + `상세 필터` 버튼
- 학생 테이블: 체크박스 / 학생(아바타+이름+ID) / 소속 반 / 학교 / 학부모 연락처 / 등록일 / 이번달 출석률(인라인 바) / 상태 뱃지 / 더보기
  - 페이지당 20명, 하단 페이지네이션
- 반 목록 그리드 (3열): 각 카드는 grade badge / 반 이름 / 담당·강의실 / 시간표·학생 수
  - hover 시 border/shadow 강화

**Modals:**
- `학생 등록`: 이름/학년/학교/배정 반/학부모 성함·연락처/메모
- `반 생성`: 반 이름/학년/강의실/담당 선생님/수업 시간/정원

**Status badges:**
- 재원 → success, 휴원 → warning, 퇴원 → neutral

### 3) 출결 관리 (`attendance`)
**Purpose:** 날짜·반별 출결 확인, 결석 사유 검토, 엑셀 출석부 다운로드

**Layout:**
- Page header: 날짜 표시 + `날짜 선택` / `월별 출석부 (Excel)` 버튼
- Summary 4-grid: 총 대상 / 출석 / 지각 / 결석 (각 카드에 좌측 3px border 액센트: success/warning/danger)
- 2컬럼 (1fr 1fr):
  - **반별 오늘 출결** 리스트 — 반 카드 클릭 시 accent-soft 배경 + accent 좌측 3px 테두리. 출결률 바(success/warning/danger 스택)
  - **결석 사유 확인** 테이블 — 학생 / 상태 뱃지 / 사유 / 제출 시각
- 이번달 출석 캘린더 — 7x5 히트맵 (accent 컬러 opacity로 밀도 표현), 오늘 날짜는 2px 검정 테두리

### 4) 선생님 관리 (`teachers`)
**Purpose:** 선생님 계정 관리, 담당 반 확인, 학원 가입코드 공유

**Layout:** grid `1fr 320px`
- **좌측 — 소속 선생님 테이블:** 선생님(아바타+이름+이메일) / 담당 반(neutral badges) / 담당 학생 수 / 연락처 / 합류일 / 상태(활성 success · 대기 warning) / 더보기
- **우측 상단 — 가입코드 카드:** 그라디언트 배경(`linear-gradient(135deg, var(--accent), #5a7af0)`), 화이트 텍스트. 코드 박스(`HANBIT-MX7K9`) + `복사` 버튼
- **우측 하단 — 이번주 선생님 활동 피드:** 출결 입력 / 공지 발행 / 학생 추가 / 결석 승인 등 항목 리스트

**Modal:** 가입코드 공유 모달 — 대시드 박스 안에 코드, 복사 / 이메일 전송 / 재발급 버튼

### 5) 공지사항 (`announcements`)
**Purpose:** 공지 작성/수정/삭제, 읽음 현황 확인

**Layout:** grid `360px 1fr`
- **좌측 — 공지 리스트:**
  - 탭(전체/발행됨/예약/임시저장) + 항목 리스트
  - 선택된 항목은 accent-soft 배경 + 좌측 3px 테두리
  - 각 항목: 제목(2줄 clamp) + 날짜 + 본문 preview + 대상 뱃지 + 읽음 %
- **우측 — 공지 상세:**
  - 대상/역할 뱃지 → 제목(22px, 700) → 메타
  - 본문
  - 읽음 현황: 프로그레스 바 + 3카드(읽음/미확인/푸시 발송)
  - 하단 액션: 수정 / 미확인자 재알림 / 삭제(우측)

**Modal:** 새 공지 작성 — 제목/대상 반/수신 대상(학생·학부모 체크박스)/본문 textarea/푸시 즉시 발송 체크박스. `취소` / `임시저장` / `발행하기`

### 6) 구독 / 결제 (`billing`)
**Purpose:** 플랜 확인·변경, 결제 내역 조회

**Layout:**
- **현재 플랜 카드** — 그라디언트 배경(surface → accent-soft), 좌측: 플랜명 + 가격 + 다음 결제일/카드. 우측: 학생 수 progress bar + `결제 수단 변경` / `플랜 업그레이드`
- **요금제 선택** 3-grid (Basic / Pro / Enterprise)
  - Pro는 `MOST POPULAR` 리본 (좌상단, accent 배경)
  - 선택 시 2px accent 테두리 + md shadow
  - 현재 플랜은 `badge-accent` + 버튼 disabled("사용 중")
- **결제 내역 테이블:** 결제일 / 내역 / 결제 수단 / 영수증(mono) / 금액(우측 tabular-nums) / 상태

**Modal:** 플랜 변경 결제 — 변경 예정 플랜 요약 / 카드 번호·유효기간·CVC·소유주 / 일할 계산 안내 / 결제 버튼에 금액 표시

## Interactions & Behavior

### Navigation
- Sidebar 클릭 → `page` 상태 변경 → `localStorage.hanbit_page`에 저장
- 페이지 refresh 시 마지막 페이지로 복원
- 각 nav item: hover `bg-sidebar-hover`, active `bg-sidebar-active` + white text
- 공지사항 nav item에 뱃지 2 표시

### Theme switching (Tweaks)
- 헤더 팔레트 아이콘 클릭 → 우측 하단 `.tweaks-panel` 토글
- 테마 선택 시 `document.documentElement.setAttribute('data-theme', theme)` → CSS 변수 재매핑
- 호스트로 `{type: '__edit_mode_set_keys', edits: {theme}}` postMessage (프로덕션에선 유저 preferences API로 대체)

### Modals
- Backdrop `rgba(15,23,42,0.5)` + fadeIn 0.15s
- Modal slideUp 0.2s (translateY 12px → 0, opacity)
- Backdrop 클릭 시 닫힘 / 내부 클릭은 stopPropagation
- 각 모달은 `.modal-header` (제목 + close icon) / `.modal-body` / `.modal-footer` (액션 버튼들, bg-subtle 배경) 구조

### Tables
- tbody row hover → `--bg-hover`
- 테이블 헤더: 11.5px uppercase, tracking 0.04em, bg-subtle 배경
- Progress bars 전환 `transition: width .4s`

### Buttons
- Primary: accent 배경, hover accent-hover
- Secondary: surface + border-strong, hover bg-hover
- Ghost: 투명, hover bg-hover
- Danger: border-only, hover danger-soft 배경
- Sizes: default(13px, padding 8x14), sm(12px, padding 5x10)

### Form focus
- Input focus: border accent + `box-shadow: 0 0 0 3px var(--accent-soft)` (focus ring)

### Search/Filter (학생 관리)
- pill tabs → `filter` state (all/active/paused/withdrawn)
- 이름 검색 → `search` state, `.includes()` 매칭
- 반 select → `classFilter` state
- 필터 조합은 AND. 프로덕션에선 서버 쿼리/URL query param 사용 권장

### Chart (WeekTrendChart)
- Inline SVG 560x180 viewBox, responsive 100% width
- 그리드라인 5개 (80–100% 범위), 마지막만 solid / 나머지 dashed
- Path: polyline + gradient area fill
- 포인트마다 원 + day 라벨 + % 값 라벨

## State Management

### Local state (prototype)
```js
// App level
const [page, setPage] = useState(localStorage.getItem('hanbit_page') || 'dashboard');
const [theme, setTheme] = useState('slate');
const [tweaksOpen, setTweaksOpen] = useState(false);
const [modal, setModal] = useState(null); // 'student' | 'class' | null

// Students page
const [filter, setFilter] = useState('all');
const [search, setSearch] = useState('');
const [classFilter, setClassFilter] = useState('all');

// Attendance page
const [selectedClass, setSelectedClass] = useState(null);

// Announcements page
const [selected, setSelected] = useState(firstAnnouncementId);
const [showEditor, setShowEditor] = useState(false);

// Billing page
const [selectedPlan, setSelectedPlan] = useState('pro');
const [showPayment, setShowPayment] = useState(false);
```

### 프로덕션 구현 시 필요한 API
- **Auth**: 원장 로그인 (필수)
- **Dashboard**: `GET /attendance/today`, `GET /attendance/week-trend`, `GET /attendance/class-rates?month=`
- **Students**: CRUD `/students`, `/classes`; filtering + pagination
- **Attendance**: `GET /attendance?date=&classId=`, `POST /attendance/export?month=` (Excel)
- **Teachers**: CRUD `/teachers`, `GET /join-code`, `POST /join-code/regenerate`
- **Announcements**: CRUD `/announcements`; `GET /announcements/:id/read-status`; `POST /announcements/:id/remind`
- **Billing**: `GET /subscription`, `PUT /subscription/plan`, `GET /payments`, `POST /payments/card`

## Assets
- **Font**: Pretendard (CDN) — 프로덕션은 self-host 권장 (https://github.com/orioncactus/pretendard)
- **Icons**: Lucide-style, inline SVG (components/icons.jsx). 프로덕션은 `lucide-react` 라이브러리 사용 추천 — 이름이 동일하거나 유사 (home, users, calendar, bell 등)
- **Images**: 없음. 학생·선생님 아바타는 이니셜 + HSL 배경 컬러로 생성

## Files
구현 참고용으로 이 폴더에 포함된 파일들:
- `학원 관리자 콘솔.html` — 엔트리 HTML
- `styles.css` — 전역 CSS 변수, 컴포넌트 스타일, 테마 정의
- `components/icons.jsx` — Lucide-style SVG 아이콘 맵
- `components/data.jsx` — 목업 데이터 (학생/반/선생님/공지/결제)
- `components/layout.jsx` — Sidebar + Header
- `components/page_dashboard.jsx` — 홈 대시보드 + 차트
- `components/page_students.jsx` — 학생 관리
- `components/page_attendance.jsx` — 출결 관리
- `components/page_teachers.jsx` — 선생님 관리
- `components/page_announcements.jsx` — 공지사항
- `components/page_billing.jsx` — 구독/결제
- `components/app.jsx` — 루트, 라우팅, 테마, 모달

## Implementation Notes
1. **컴포넌트 라이브러리**: 기존 코드베이스에 Radix/shadcn/Ant Design 등이 있다면 그걸로 대체. 없다면 shadcn/ui 권장.
2. **테마 시스템**: CSS custom property + `data-theme` attribute 방식이 가장 이식성 좋음. Tailwind라면 `@layer base`에서 정의.
3. **차트**: 대시보드 7일 추이 차트는 프로덕션에선 Recharts/Tremor/Chart.js로 대체 가능. 단, 현재 디자인은 라벨/포인트 위치가 커스텀이므로 설정 필요.
4. **i18n**: 모든 UI 텍스트가 한국어 하드코딩. 다국어 필요시 `next-intl` 등으로 추출.
5. **반응형**: 현재는 데스크톱 전용 (사이드바 240px 고정). 모바일 지원 필요시 sidebar를 sheet/drawer로 전환.
6. **접근성**: 모달에 focus trap / Esc 키 닫기 / aria 속성 미구현 — 프로덕션에선 Radix Dialog 등 사용 권장.
7. **테이블**: 현재는 100% HTML table. 가상 스크롤/정렬/선택 등 필요시 TanStack Table 추천.
