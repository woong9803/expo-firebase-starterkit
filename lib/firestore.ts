/**
 * lib/firestore.ts — Firestore 컬렉션·문서 참조 헬퍼 (RN Firebase)
 *
 * 경로 문자열 하드코딩 방지 — 앱 전체에서 이 객체만 사용할 것.
 *
 * 사용 예시:
 *   const academyRef = Collections.academy('abc123');
 *   const snap = await academyRef.get();
 *   const list = await Collections.homeworks().where('class_id', '==', cid).get();
 */
import { db } from './firebase';

export const Collections = {
  // ── 학원 ──────────────────────────────────
  academies: () => db.collection('academies'),
  academy: (academyId: string) => db.collection('academies').doc(academyId),

  // ── 사용자 ────────────────────────────────
  users: () => db.collection('users'),
  user: (uid: string) => db.collection('users').doc(uid),

  // ── 반 ────────────────────────────────────
  classes: () => db.collection('classes'),
  class: (classId: string) => db.collection('classes').doc(classId),

  // ── 숙제 ──────────────────────────────────
  homeworks: () => db.collection('homeworks'),
  homework: (hwId: string) => db.collection('homeworks').doc(hwId),

  // ── 제출물 (homeworks 하위 컬렉션) ────────
  submissions: (hwId: string) =>
    db.collection('homeworks').doc(hwId).collection('submissions'),
  submission: (hwId: string, studentUid: string) =>
    db.collection('homeworks').doc(hwId).collection('submissions').doc(studentUid),

  // ── 출결 (문서 ID: {classId}_{YYYY-MM-DD}) ─
  attendances: () => db.collection('attendances'),
  attendance: (classId: string, date: string) =>
    db.collection('attendances').doc(`${classId}_${date}`),
  // 출결 records 하위 컬렉션 (studentUid → AttendanceRecord)
  attendanceRecords: (classId: string, date: string) =>
    db.collection('attendances').doc(`${classId}_${date}`).collection('records'),

  // ── 공지사항 ──────────────────────────────
  notices: () => db.collection('notices'),
  notice: (noticeId: string) => db.collection('notices').doc(noticeId),

  // ── 알림 ──────────────────────────────────
  notifications: () => db.collection('notifications'),
  notification: (notifId: string) => db.collection('notifications').doc(notifId),

  // ── 영상 ──────────────────────────────────
  videos: () => db.collection('videos'),
  video: (videoId: string) => db.collection('videos').doc(videoId),

  // ── 앱 설정 (단일 문서 v1) ─────────────────
  appConfig: () => db.collection('appConfig').doc('v1'),
};
