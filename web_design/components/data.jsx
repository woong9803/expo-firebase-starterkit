// ============================================================
// Mock Data — 한빛수학학원 (중형, ~280명, 12개 반)
// ============================================================

const CLASSES = [
  { id: 'c1', name: '초등 5학년 A반', grade: '초5', teacher: '김수연', students: 18, room: '201호', schedule: '월/수/금 16:00' },
  { id: 'c2', name: '초등 5학년 B반', grade: '초5', teacher: '김수연', students: 16, room: '201호', schedule: '화/목 16:00' },
  { id: 'c3', name: '초등 6학년 A반', grade: '초6', teacher: '박지훈', students: 20, room: '202호', schedule: '월/수/금 17:30' },
  { id: 'c4', name: '초등 6학년 B반', grade: '초6', teacher: '박지훈', students: 19, room: '202호', schedule: '화/목 17:30' },
  { id: 'c5', name: '중1 심화반', grade: '중1', teacher: '이민호', students: 22, room: '301호', schedule: '월/수/금 18:30' },
  { id: 'c6', name: '중1 표준반', grade: '중1', teacher: '이민호', students: 24, room: '302호', schedule: '화/목/토 18:30' },
  { id: 'c7', name: '중2 심화반', grade: '중2', teacher: '정하늘', students: 21, room: '303호', schedule: '월/수/금 19:00' },
  { id: 'c8', name: '중2 표준반', grade: '중2', teacher: '정하늘', students: 26, room: '304호', schedule: '화/목/토 19:00' },
  { id: 'c9', name: '중3 심화반', grade: '중3', teacher: '최은정', students: 23, room: '401호', schedule: '월/수/금 20:00' },
  { id: 'c10', name: '중3 표준반', grade: '중3', teacher: '최은정', students: 28, room: '402호', schedule: '화/목/토 20:00' },
  { id: 'c11', name: '고1 내신반', grade: '고1', teacher: '윤서진', students: 32, room: '501호', schedule: '월/수/금 21:00' },
  { id: 'c12', name: '고2 수능반', grade: '고2', teacher: '윤서진', students: 34, room: '501호', schedule: '화/목/토 21:00' },
];

const TEACHERS = [
  { id: 't1', name: '김수연', email: 'suyeon.kim@hanbit.com', phone: '010-2345-6789', classes: ['c1', 'c2'], students: 34, joinedAt: '2023.03.12', status: 'active' },
  { id: 't2', name: '박지훈', email: 'jihoon.park@hanbit.com', phone: '010-3456-7890', classes: ['c3', 'c4'], students: 39, joinedAt: '2022.09.01', status: 'active' },
  { id: 't3', name: '이민호', email: 'minho.lee@hanbit.com', phone: '010-4567-8901', classes: ['c5', 'c6'], students: 46, joinedAt: '2021.07.22', status: 'active' },
  { id: 't4', name: '정하늘', email: 'haneul.jung@hanbit.com', phone: '010-5678-9012', classes: ['c7', 'c8'], students: 47, joinedAt: '2023.08.14', status: 'active' },
  { id: 't5', name: '최은정', email: 'eunjung.choi@hanbit.com', phone: '010-6789-0123', classes: ['c9', 'c10'], students: 51, joinedAt: '2020.02.03', status: 'active' },
  { id: 't6', name: '윤서진', email: 'seojin.yoon@hanbit.com', phone: '010-7890-1234', classes: ['c11', 'c12'], students: 66, joinedAt: '2024.03.05', status: 'active' },
  { id: 't7', name: '강다은', email: 'daeun.kang@hanbit.com', phone: '010-8901-2345', classes: [], students: 0, joinedAt: '2026.04.10', status: 'pending' },
];

const STUDENT_NAMES = [
  '강민재','권유나','김도현','김서아','김예준','김지우','김하린','노하윤','류시우','문예린',
  '박건우','박다은','박서준','박수빈','박지민','배서현','백민준','변소율','서지호','송하은',
  '신아윤','안도윤','양주원','오수현','유지아','윤채원','이건호','이서율','이시현','이주안',
  '이지안','임수아','장민서','장예서','전우진','정다현','정재민','조유진','주하연','진소율',
  '차시후','채민아','최우빈','최지유','하승우','한소희','현지원','홍서우','황민아','황윤서',
];

const PARENTS_PHONES = ['010-1234-5678', '010-2345-6789', '010-3456-7890', '010-4567-8901', '010-5678-9012', '010-6789-0123'];

const STATUSES = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'active', 'paused', 'withdrawn'];

const STUDENTS = Array.from({ length: 48 }, (_, i) => {
  const cls = CLASSES[i % CLASSES.length];
  const name = STUDENT_NAMES[i];
  const year = 2020 + (i % 6);
  const month = String(1 + (i * 3) % 12).padStart(2, '0');
  const day = String(1 + (i * 7) % 28).padStart(2, '0');
  return {
    id: `s${1000 + i}`,
    name,
    classId: cls.id,
    className: cls.name,
    grade: cls.grade,
    school: ['한빛초', '상록초', '동산중', '중앙중', '서일고', '광명고'][i % 6],
    parentPhone: PARENTS_PHONES[i % PARENTS_PHONES.length],
    enrolledAt: `${year}.${month}.${day}`,
    status: STATUSES[i % STATUSES.length],
    attendance: 82 + (i * 13) % 18, // 82-99%
  };
});

// Today's attendance summary (for dashboard)
const TODAY_ATTENDANCE = {
  present: 243,
  late: 18,
  absent: 19,
  total: 280,
};

// Recent 7 days attendance trend
const WEEK_TREND = [
  { day: '월', date: '4/13', present: 251, late: 14, absent: 15 },
  { day: '화', date: '4/14', present: 245, late: 16, absent: 19 },
  { day: '수', date: '4/15', present: 258, late: 11, absent: 11 },
  { day: '목', date: '4/16', present: 249, late: 17, absent: 14 },
  { day: '금', date: '4/17', present: 238, late: 22, absent: 20 },
  { day: '토', date: '4/18', present: 247, late: 15, absent: 18 },
  { day: '일', date: '4/19', present: 243, late: 18, absent: 19 },
];

// Class attendance rates this month
const CLASS_ATTENDANCE = CLASSES.map((c, i) => ({
  ...c,
  rate: 88 + ((i * 7) % 11),
}));

// Announcements
const ANNOUNCEMENTS = [
  { id: 'a1', title: '5월 모의고사 일정 안내', body: '5월 10일(토) 오전 9시부터 고2 수능반 대상 5월 모의고사를 실시합니다. 시험실 배치는 추후 공지됩니다.', target: '고2 수능반', roles: ['학생', '학부모'], createdAt: '2026.04.18', readRate: 92, readCount: 31, totalCount: 34 },
  { id: 'a2', title: '중간고사 대비 특강 개설', body: '중1~중3 대상 중간고사 대비 특강을 개설합니다. 4월 25일부터 매주 토요일 오후 2시에 진행됩니다.', target: '중등 전체', roles: ['학생', '학부모'], createdAt: '2026.04.16', readRate: 87, readCount: 126, totalCount: 144 },
  { id: 'a3', title: '어린이날 휴강 안내', body: '5월 5일(월) 어린이날은 전 수업 휴강입니다. 보강은 5월 9일(금) 동일 시간에 진행됩니다.', target: '전체', roles: ['학생', '학부모'], createdAt: '2026.04.15', readRate: 76, readCount: 213, totalCount: 280 },
  { id: 'a4', title: '초등부 학부모 상담주간', body: '4월 28일~5월 2일은 초등부 학부모 상담주간입니다. 홈페이지에서 예약 가능합니다.', target: '초등 전체', roles: ['학부모'], createdAt: '2026.04.12', readRate: 94, readCount: 68, totalCount: 72 },
  { id: 'a5', title: '주차장 공사 안내', body: '4월 22일~24일 학원 주차장 재포장 공사로 인해 학원 앞 도로변 주차는 불가합니다.', target: '전체', roles: ['학생', '학부모'], createdAt: '2026.04.10', readRate: 68, readCount: 190, totalCount: 280 },
];

// Billing
const CURRENT_PLAN = {
  name: 'Pro',
  price: 89000,
  students: 280,
  limit: 500,
  nextBilling: '2026.05.19',
  card: '신한 **** 4829',
};

const PLANS = [
  { id: 'basic', name: 'Basic', price: 39000, limit: 100, features: ['학생 관리', '출결 관리', '공지사항 5개/월'], popular: false },
  { id: 'pro', name: 'Pro', price: 89000, limit: 500, features: ['Basic 전체 기능', '공지 무제한', '엑셀 다운로드', '선생님 계정 10개'], popular: true, current: true },
  { id: 'enterprise', name: 'Enterprise', price: 189000, limit: 9999, features: ['Pro 전체 기능', '선생님 무제한', 'API 접근', '전담 상담사'], popular: false },
];

const PAYMENTS = [
  { date: '2026.04.19', desc: 'Pro 플랜 월 구독', amount: 89000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2604-0019' },
  { date: '2026.03.19', desc: 'Pro 플랜 월 구독', amount: 89000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2603-0019' },
  { date: '2026.02.19', desc: 'Pro 플랜 월 구독', amount: 89000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2602-0019' },
  { date: '2026.01.19', desc: 'Pro 플랜 월 구독', amount: 89000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2601-0019' },
  { date: '2025.12.19', desc: 'Basic → Pro 업그레이드', amount: 56000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2512-0019' },
  { date: '2025.12.19', desc: 'Basic 플랜 월 구독', amount: 39000, method: '신한 **** 4829', status: 'paid', invoice: 'INV-2512-0018' },
];

// Today's attendance by class (for attendance page)
const TODAY_BY_CLASS = CLASSES.map((c, i) => {
  const total = c.students;
  const absent = (i % 4);
  const late = ((i + 1) % 3);
  const present = total - absent - late;
  return { ...c, present, late, absent, status: i < 8 ? 'done' : (i === 8 ? 'in-progress' : 'pending') };
});

window.DATA = {
  CLASSES, TEACHERS, STUDENTS, TODAY_ATTENDANCE, WEEK_TREND,
  CLASS_ATTENDANCE, ANNOUNCEMENTS, CURRENT_PLAN, PLANS, PAYMENTS, TODAY_BY_CLASS,
};
