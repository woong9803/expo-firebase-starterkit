import * as admin from 'firebase-admin';

// Firebase Admin SDK 초기화 — Cloud Functions 환경에서 자동 인증
admin.initializeApp();

// 인증 관련 함수 export
export { kakaoLogin } from './auth/kakaoLogin';
export { createStudentAccount } from './auth/createStudentAccount';

// 알림 관련 함수 export
export { onHomeworkFeedback } from './notifications/homeworkFeedback';
export { sendUnsubmittedAlert } from './notifications/unsubmittedAlert';
export { onNoticeCreated } from './notifications/noticeAlert';
export { sendHomeworkReminderPush } from './notifications/homeworkReminderPush';
export { sendAttendanceAlertPush } from './notifications/attendanceAlertPush';
