import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';
export type AcademyPlan = 'free' | 'pro' | 'trial';
export type AcademyStatus = 'pending' | 'active' | 'rejected';
export type AcademyType = '학원' | '교습소' | '개인과외';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  academy_id: string;
  class_id: string | null;        // 학생 전용 — 소속 반 ID
  link_code: string | null;       // 학생 전용 — 학부모 연동코드 (6자리)
  children: string[];             // 학부모 전용 — 자녀 uid 배열
  is_active: boolean;
  birth_date: string | null;      // 법정 출석부 대응 (YYYY-MM-DD)
  guardian_phone: string | null;  // 법정 출석부 대응
  enrollment_date: Timestamp | null; // 법정 출석부 대응
  phone_number: string;
  phone_verified: boolean;
  deleted_at: Timestamp | null;   // 탈퇴 처리 시 기록
  created_at: Timestamp;
}

export interface Academy {
  id: string;
  name: string;
  plan: AcademyPlan;
  trial_ends_at: Timestamp | null;
  status: AcademyStatus;
  academy_type: AcademyType;
  submitted_at: Timestamp;
  approved_at: Timestamp | null;
  reject_reason: string | null;
  owner_name: string;
  owner_phone: string;
  address: string;
  created_at: Timestamp;
}

export interface Class {
  id: string;
  name: string;
  academy_id: string;
  head_teacher_id: string;
  invite_code: string; // 6자리 영숫자
}

export interface Homework {
  id: string;
  title: string;
  content: string;
  class_id: string;
  due_date: Timestamp;
  created_by: string; // 선생님 uid
}

// homeworks/{homeworkId}/submissions/{studentUid}
export interface Submission {
  image_urls: string[];                  // Storage URL 배열 (최대 5장)
  status: 'submitted' | 'checked';
  is_late: boolean;                      // 마감 초과 제출 시 true
  feedback: '👍' | '💧' | null;         // 선생님 원터치 피드백
  submitted_at: Timestamp;
}

// attendances/{classId_date}/records/{studentUid}
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'onLeave';

export interface AttendanceRecord {
  status: AttendanceStatus;
  reason: string | null; // 학부모가 입력한 결석 사유
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  is_important: boolean;
  academy_id: string;
  read_by: string[];   // 읽은 uid 배열
  created_at: Timestamp;
  created_by: string;  // 작성자 uid
}

// Notification은 브라우저 내장 타입과 충돌 — AppNotification으로 명명
export interface AppNotification {
  id: string;
  target_uid: string;
  type: 'homework_feedback' | 'homework_due' | 'attendance' | 'notice';
  title: string;
  body: string;
  is_read: boolean;
  created_at: Timestamp;
}

export interface AppConfig {
  min_version_ios: string;
  min_version_android: string;
  latest_version: string;
  force_update_message: string;
}