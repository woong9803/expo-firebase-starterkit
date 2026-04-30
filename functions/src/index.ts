import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';

// Firebase Admin SDK 초기화 — Cloud Functions 환경에서 자동 인증
admin.initializeApp();

// 전역 옵션 — Cloud Run CPU 쿼터 초과 방지
//   - maxInstances: 10  → 함수당 최대 10개 인스턴스로 제한
//                        (us-central1 지역 CPU 쿼터 보호)
//   - memory: '256MiB'  → 기본 256MB 로 다운그레이드 (대부분의 onCall 에 충분)
//   - concurrency: 80   → 인스턴스 1개당 동시 요청 80건 처리 (기본값 유지)
//
// 2026-04-23 사고 회고:
//   8개 함수 동시 update 시 신규 revision healthcheck 단계에서
//   "Quota exceeded for total allowable CPU per project per region" 발생.
//   maxInstances 제한으로 동시 활성 CPU 총량을 제어해 재발 방지.
setGlobalOptions({
  maxInstances: 10,
  memory: '256MiB',
  region: 'us-central1',
});

// 인증 관련 함수 export
export { kakaoLogin } from './auth/kakaoLogin';
export { createStudentAccount } from './auth/createStudentAccount';
export { deleteUser } from './auth/deleteUser';
export { cleanupDeletedUsers } from './auth/cleanupDeletedUsers';
export { syncUserRoleClaim, refreshMyClaim } from './auth/syncUserRoleClaim';
export { validateOnboardingCode } from './auth/validateOnboardingCode';
// backfillPhoneLookups: 1회성 마이그레이션 함수 — 운영 환경 공격 표면 축소를 위해 export 제외
// 재실행이 필요하면 임시로 export 후 배포, 완료 후 다시 제거할 것
// export { backfillPhoneLookups } from './auth/backfillPhoneLookups';

// 숙제 관련 함수 export
export { onSubmissionCreated } from './homework/verifySubmissionLate';

// 알림 관련 함수 export
export { onHomeworkCreated } from './notifications/homeworkCreated';
export { onHomeworkFeedback } from './notifications/homeworkFeedback';
export { sendUnsubmittedAlert } from './notifications/unsubmittedAlert';
export { onNoticeCreated } from './notifications/noticeAlert';
export { sendHomeworkReminderPush } from './notifications/homeworkReminderPush';
export { sendAttendanceAlertPush } from './notifications/attendanceAlertPush';

// 학원 관리 함수 export
export { deactivateExpiredAcademies } from './academy/deactivateExpiredAcademies';
export { verifyTossPayment } from './academy/verifyTossPayment';
export { enforceClassLimitForPending } from './academy/enforceClassLimit';

// Storage 관련 함수 export
export { verifyUploadMimeType } from './storage/verifyUploadMimeType';
