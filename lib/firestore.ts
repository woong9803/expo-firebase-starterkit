import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Firestore 컬렉션·문서 참조 헬퍼
 * 경로 문자열 하드코딩 방지 — 앱 전체에서 이 객체만 사용할 것
 *
 * 사용 예시:
 *   const academyRef = Collections.academy('abc123');
 *   const q = query(Collections.homeworks(), where('class_id', '==', classId));
 */
export const Collections = {
  // ── 학원 ──────────────────────────────────
  academies: () => collection(db, 'academies'),
  academy: (academyId: string) => doc(db, 'academies', academyId),

  // ── 사용자 ────────────────────────────────
  users: () => collection(db, 'users'),
  user: (uid: string) => doc(db, 'users', uid),

  // ── 반 ────────────────────────────────────
  classes: () => collection(db, 'classes'),
  class: (classId: string) => doc(db, 'classes', classId),

  // ── 숙제 ──────────────────────────────────
  homeworks: () => collection(db, 'homeworks'),
  homework: (hwId: string) => doc(db, 'homeworks', hwId),

  // ── 제출물 (homeworks 하위 컬렉션) ────────
  submissions: (hwId: string) =>
    collection(db, 'homeworks', hwId, 'submissions'),
  submission: (hwId: string, studentUid: string) =>
    doc(db, 'homeworks', hwId, 'submissions', studentUid),

  // ── 출결 (문서 ID: {classId}_{YYYY-MM-DD}) ─
  attendances: () => collection(db, 'attendances'),
  attendance: (classId: string, date: string) =>
    doc(db, 'attendances', `${classId}_${date}`),
  // 출결 records 하위 컬렉션 (studentUid → AttendanceRecord)
  attendanceRecords: (classId: string, date: string) =>
    collection(db, 'attendances', `${classId}_${date}`, 'records'),

  // ── 공지사항 ──────────────────────────────
  notices: () => collection(db, 'notices'),
  notice: (noticeId: string) => doc(db, 'notices', noticeId),

  // ── 알림 ──────────────────────────────────
  notifications: () => collection(db, 'notifications'),
  notification: (notifId: string) => doc(db, 'notifications', notifId),

  // ── 앱 설정 (단일 문서 v1) ─────────────────
  appConfig: () => doc(db, 'appConfig', 'v1'),
};
