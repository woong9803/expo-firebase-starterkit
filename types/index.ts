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
  assigned_class_ids: string[];   // 선생님 전용 — 직접 선택한 담당반 ID 목록 (없으면 빈 배열)
  link_code: string | null;       // 학생 전용 — 학부모 연동코드 (6자리)
  children: string[];             // 학부모 전용 — 자녀 uid 배열
  is_active: boolean;
  birth_date: string | null;      // 법정 출석부 대응 (YYYY-MM-DD)
  guardian_phone: string | null;  // 법정 출석부 대응
  enrollment_date: Timestamp | null; // 법정 출석부 대응
  phone_number: string;
  phone_verified: boolean;
  fcm_token?: string;               // 푸시 알림용 FCM 토큰 (없으면 알림 발송 안 함)
  streak?: number;                 // 학생 전용 — 연속 제출 일수 (없으면 0)
  teacher_feedback?: {             // 선생님/원장님이 학생에게 직접 남기는 메모
    text: string;
    author_name: string;
    created_at: Timestamp;
  };
  deleted_at: Timestamp | null;   // 탈퇴 처리 시 기록
  created_at: Timestamp;
}

export interface Academy {
  id: string;
  name: string;
  academy_code: string;       // 선생님 가입 시 입력하는 학원코드 (6자리 영숫자)
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
  invite_code: string; // 6자리 영숫자
  subject?: string;        // 교습과목 (예: 수학, 영어) — 법정 출석부 '교습과목 및 수강반' 컬럼에 사용
  student_count?: number;  // 캐시된 학생 수 (Firestore 저장 시 업데이트)
  present_count?: number;  // 오늘 출석 수 (실시간 계산, 선택적)
  // ★ head_teacher_id 제거 — 담당반은 users/{uid}.assigned_class_ids[] 로 관리
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
  feedback_comment?: string;             // 💧 선택 시 선생님이 남기는 텍스트 코멘트
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
  read_by: string[];            // 읽은 uid 배열
  target_class_ids: string[];   // 공지 대상 반 ID 배열. 빈 배열 = 전체 반
  target_roles: string[];       // 공지 수신 역할 배열. 빈 배열 = 모두 ['student','parent']
  created_at: Timestamp;
  created_by: string;           // 작성자 uid
}

// Notification은 브라우저 내장 타입과 충돌 — AppNotification으로 명명
export interface AppNotification {
  id: string;
  target_uid: string;
  type: 'homework_feedback' | 'homework_due' | 'attendance' | 'notice';
  title: string;
  body: string;
  is_read: boolean;
  deep_link?: string;   // 알림 클릭 시 이동할 화면 경로 (예: '/(app)/(student)/homework-submit?hwId=xxx')
  created_at: Timestamp;
}

export interface AppConfig {
  min_version_ios: string;
  min_version_android: string;
  latest_version: string;
  force_update_message: string;
}