import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// RN Firebase 의 Timestamp 별칭 — 기존 코드 호환을 위해 유지
export type Timestamp = FirebaseFirestoreTypes.Timestamp;

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';
export type AcademyPlan = 'free' | 'starter' | 'standard' | 'pro' | 'trial';
export type AcademyStatus = 'pending' | 'active' | 'rejected' | 'deactivated';
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
  school_name: string | null;    // 학생 전용 — 재학 중인 학교명
  address: string | null;        // 수강생 관리 대장 대응 — 거주지 주소 (모든 역할 공통, 회원가입 시 입력)
  tuition_fee: number | null;    // 학생 전용 — 월 수강료 (원 단위). 비어있으면 반 default_tuition_fee 사용
  guardian_phone: string | null;  // 법정 출석부 대응
  // ── PIPA 제22조: 만 14세 미만 학생 가입 시 법정대리인 동의 기록 (학생 전용) ──
  guardian_consent_at: Timestamp | null;  // 동의 시각 — 14세 이상이거나 미수집 시 null
  guardian_consent_by: string | null;     // 동의를 확인한 사용자 uid (학부모/선생님) — 미수집 시 null
  enrollment_date: Timestamp | null; // 법정 출석부 대응
  withdrawal_date?: Timestamp | null; // 학생 전용 — 퇴원 처리 시점 자동 기록, 재원 복구 시 null
  phone_number: string;
  phone_verified: boolean;
  fcm_token?: string;               // Expo Push 토큰 (필드명은 호환 유지) — 없으면 알림 발송 안 함
  notif_prefs?: {                   // 알림 종류별 수신 설정 (없으면 전체 ON)
    homework?: boolean;             // 숙제 마감·미제출 알림 (학생·학부모)
    feedback?: boolean;             // 피드백 알림 (학생·학부모)
    attendance?: boolean;           // 출결 알림 (학부모)
    notice?: boolean;               // 공지 알림 (전체)
  };
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
  owner_uid: string;          // 학원 생성자 uid — Rules에서 생성 주체 검증 + uid당 1개 제한
  plan: AcademyPlan;
  trial_ends_at: Timestamp | null;
  plan_expires_at?: Timestamp | null;  // pro 플랜 만료일 (verifyTossPayment에서 설정)
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
  default_tuition_fee?: number | null; // 반 기본 수강료 (원). 학생 배정·이동 시 학생 tuition_fee가 비어있으면 자동 채움
  student_count?: number;  // 캐시된 학생 수 (Firestore 저장 시 업데이트)
  present_count?: number;  // 오늘 출석 수 (실시간 계산, 선택적)
  // pending 학원 반 1개 제한 트리거(enforceClassLimitForPending)가 동시에 만들어진 두 문서의
  // 우선순위를 결정하는 데 사용 — 가장 오래된 1개를 살리고 나머지를 삭제
  created_at: Timestamp;
  // ★ head_teacher_id 제거 — 담당반은 users/{uid}.assigned_class_ids[] 로 관리
}

export interface Homework {
  id: string;
  title: string;
  content: string;
  class_id: string;
  due_date: Timestamp;
  created_by: string; // 선생님 uid
  // 멱등성 마커 — onHomeworkCreated 트리거가 1회만 발송하도록 사용
  // Eventarc at-least-once 정책으로 인한 중복 호출 방지용
  notification_sent?: boolean;
}

// homeworks/{homeworkId}/submissions/{studentUid}
export interface Submission {
  image_urls: string[];                  // Storage URL 배열 (최대 5장)
  status: 'submitted' | 'checked';
  is_late: boolean;                      // 마감 초과 제출 시 true
  feedback: '👍' | '💧' | null;         // 선생님 원터치 피드백
  feedback_comment?: string;             // 💧 선택 시 선생님이 남기는 텍스트 코멘트
  submitted_at: Timestamp;
  is_retry?: boolean;                    // 다시풀기 후 재제출 여부 — 학생이 💧 받고 재제출하면 true, 새 검사 전까지 유지
  // 멱등성 마커 — onHomeworkFeedback 트리거가 같은 피드백 값으로 재발송하지 않도록 사용
  feedback_notified_for?: '👍' | '💧' | null;
  // 멱등성 마커 — onSubmissionCreated 트리거의 streak 갱신이 1회만 적용되도록 사용
  streak_processed?: boolean;
}

// attendances/{classId_date}/records/{studentUid}
export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface AttendanceRecord {
  status: AttendanceStatus;
  reason: string | null; // 학부모/선생님이 입력한 결석 사유
  // 사유를 누가 입력했는지 — 'parent' 일 때만 트리거가 선생님·어드민에게 알림 발송
  // 선생님·어드민이 직접 입력한 경우엔 미지정(undefined) → 알림 발송 X
  reason_source?: 'parent';
  // 멱등성 마커 — onAttendanceReasonChanged 트리거가 같은 사유 값으로 재발송하지 않도록 사용
  reason_notified_for?: string | null;
}

// 공지 첨부파일 — 이미지·일반 파일 공통 메타
export interface NoticeAttachment {
  url: string;                   // Firebase Storage 다운로드 URL
  name: string;                  // 원본 파일명 (예: "수업안내.pdf")
  kind: 'image' | 'file';        // UI 분기용 (이미지면 썸네일, 파일이면 아이콘)
  size: number;                  // 바이트 단위
  mime: string;                  // MIME 타입 (예: 'application/pdf')
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
  attachments?: NoticeAttachment[]; // 첨부파일 목록 (없으면 빈 배열 또는 미저장)
  created_at: Timestamp;
  created_by: string;           // 작성자 uid
  // 멱등성 마커 — onNoticeCreated 트리거가 1회만 발송하도록 사용
  // Eventarc at-least-once 정책으로 인한 중복 호출 방지용
  notification_sent?: boolean;
  // 미확인자 재알림(resendNoticeToUnread) 쿨다운 추적
  last_resent_at?: Timestamp;
  last_resent_count?: number;
}

// Notification은 브라우저 내장 타입과 충돌 — AppNotification으로 명명
export interface AppNotification {
  id: string;
  target_uid: string;
  type:
    | 'homework_created'   // 신규 숙제 출제 — 학생/학부모 푸시
    | 'homework_feedback'  // 선생님 검사 결과 (👍/💧)
    | 'homework_due'       // 마감 임박 미제출 알림
    | 'attendance'         // 출결 변경
    | 'notice';            // 공지사항
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

// payments/{paymentId} — 토스페이먼츠 결제 내역
export interface Payment {
  id: string;
  academy_id: string;
  order_id: string;           // 결제 요청 시 생성한 주문번호 (uuid)
  payment_key: string;        // 토스페이먼츠 paymentKey
  amount: number;             // 결제 금액 (원)
  plan: AcademyPlan;          // 결제한 플랜
  plan_months: number;        // 결제 개월 수 (기본 1개월)
  status: 'success' | 'canceled';
  paid_at: Timestamp;
  receipt_url?: string;       // 토스페이먼츠 영수증 URL (verifyTossPayment에서 채워주면 노출)
}

// videos/{videoId} — 선생님이 반에 등록한 YouTube 영상
export interface Video {
  id: string;
  title: string;            // 영상 제목
  youtube_url: string;      // YouTube 원본 URL (예: https://youtu.be/xxxxx)
  video_id: string;         // YouTube videoId (파싱된 값, 썸네일·재생에 사용)
  class_id: string;         // 대상 반 ID
  academy_id: string;       // 학원 ID (보안 규칙 필터링용)
  created_by: string;       // 등록한 선생님 uid
  created_at: Timestamp;
}