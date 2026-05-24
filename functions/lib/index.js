"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyUploadMimeType = exports.enforceClassLimitForPending = exports.verifyTossPayment = exports.deactivateExpiredAcademies = exports.onAttendanceReasonChanged = exports.sendAttendanceAlertPush = exports.sendHomeworkReminderPush = exports.resendNoticeToUnread = exports.onNoticeCreated = exports.sendUnsubmittedAlert = exports.onHomeworkFeedback = exports.onHomeworkSubmitted = exports.onHomeworkCreated = exports.onSubmissionCreated = exports.resetPasswordByPhone = exports.validateOnboardingCode = exports.refreshMyClaim = exports.syncUserRoleClaim = exports.cleanupDeletedUsers = exports.deleteUser = exports.restoreStudent = exports.createStudentAccount = exports.kakaoLogin = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
// Firebase Admin SDK 초기화 — Cloud Functions 환경에서 자동 인증
admin.initializeApp();
// 전역 옵션 — Cloud Run CPU 쿼터 초과 방지
//   - maxInstances: 10  → 함수당 최대 10개 인스턴스로 제한 (지역 CPU 쿼터 보호)
//   - memory: '256MiB'  → 기본 256MB 로 다운그레이드 (대부분의 onCall 에 충분)
//   - concurrency: 80   → 인스턴스 1개당 동시 요청 80건 처리 (기본값 유지)
//   - region: asia-northeast3 (서울) — PIPA 국외 이전 회피 및 한국 사용자 latency 최소화
//
// 2026-04-23 사고 회고:
//   8개 함수 동시 update 시 신규 revision healthcheck 단계에서
//   "Quota exceeded for total allowable CPU per project per region" 발생.
//   maxInstances 제한으로 동시 활성 CPU 총량을 제어해 재발 방지.
(0, v2_1.setGlobalOptions)({
    maxInstances: 10,
    memory: '256MiB',
    region: 'asia-northeast3',
});
// 인증 관련 함수 export
var kakaoLogin_1 = require("./auth/kakaoLogin");
Object.defineProperty(exports, "kakaoLogin", { enumerable: true, get: function () { return kakaoLogin_1.kakaoLogin; } });
var createStudentAccount_1 = require("./auth/createStudentAccount");
Object.defineProperty(exports, "createStudentAccount", { enumerable: true, get: function () { return createStudentAccount_1.createStudentAccount; } });
var restoreStudent_1 = require("./auth/restoreStudent");
Object.defineProperty(exports, "restoreStudent", { enumerable: true, get: function () { return restoreStudent_1.restoreStudent; } });
var deleteUser_1 = require("./auth/deleteUser");
Object.defineProperty(exports, "deleteUser", { enumerable: true, get: function () { return deleteUser_1.deleteUser; } });
var cleanupDeletedUsers_1 = require("./auth/cleanupDeletedUsers");
Object.defineProperty(exports, "cleanupDeletedUsers", { enumerable: true, get: function () { return cleanupDeletedUsers_1.cleanupDeletedUsers; } });
var syncUserRoleClaim_1 = require("./auth/syncUserRoleClaim");
Object.defineProperty(exports, "syncUserRoleClaim", { enumerable: true, get: function () { return syncUserRoleClaim_1.syncUserRoleClaim; } });
Object.defineProperty(exports, "refreshMyClaim", { enumerable: true, get: function () { return syncUserRoleClaim_1.refreshMyClaim; } });
var validateOnboardingCode_1 = require("./auth/validateOnboardingCode");
Object.defineProperty(exports, "validateOnboardingCode", { enumerable: true, get: function () { return validateOnboardingCode_1.validateOnboardingCode; } });
var resetPasswordByPhone_1 = require("./auth/resetPasswordByPhone");
Object.defineProperty(exports, "resetPasswordByPhone", { enumerable: true, get: function () { return resetPasswordByPhone_1.resetPasswordByPhone; } });
// backfillPhoneLookups: 1회성 마이그레이션 함수 — 운영 환경 공격 표면 축소를 위해 export 제외
// 재실행이 필요하면 임시로 export 후 배포, 완료 후 다시 제거할 것
// export { backfillPhoneLookups } from './auth/backfillPhoneLookups';
// 숙제 관련 함수 export
var verifySubmissionLate_1 = require("./homework/verifySubmissionLate");
Object.defineProperty(exports, "onSubmissionCreated", { enumerable: true, get: function () { return verifySubmissionLate_1.onSubmissionCreated; } });
// 알림 관련 함수 export
var homeworkCreated_1 = require("./notifications/homeworkCreated");
Object.defineProperty(exports, "onHomeworkCreated", { enumerable: true, get: function () { return homeworkCreated_1.onHomeworkCreated; } });
var homeworkSubmitted_1 = require("./notifications/homeworkSubmitted");
Object.defineProperty(exports, "onHomeworkSubmitted", { enumerable: true, get: function () { return homeworkSubmitted_1.onHomeworkSubmitted; } });
var homeworkFeedback_1 = require("./notifications/homeworkFeedback");
Object.defineProperty(exports, "onHomeworkFeedback", { enumerable: true, get: function () { return homeworkFeedback_1.onHomeworkFeedback; } });
var unsubmittedAlert_1 = require("./notifications/unsubmittedAlert");
Object.defineProperty(exports, "sendUnsubmittedAlert", { enumerable: true, get: function () { return unsubmittedAlert_1.sendUnsubmittedAlert; } });
var noticeAlert_1 = require("./notifications/noticeAlert");
Object.defineProperty(exports, "onNoticeCreated", { enumerable: true, get: function () { return noticeAlert_1.onNoticeCreated; } });
var resendNoticeToUnread_1 = require("./notifications/resendNoticeToUnread");
Object.defineProperty(exports, "resendNoticeToUnread", { enumerable: true, get: function () { return resendNoticeToUnread_1.resendNoticeToUnread; } });
var homeworkReminderPush_1 = require("./notifications/homeworkReminderPush");
Object.defineProperty(exports, "sendHomeworkReminderPush", { enumerable: true, get: function () { return homeworkReminderPush_1.sendHomeworkReminderPush; } });
var attendanceAlertPush_1 = require("./notifications/attendanceAlertPush");
Object.defineProperty(exports, "sendAttendanceAlertPush", { enumerable: true, get: function () { return attendanceAlertPush_1.sendAttendanceAlertPush; } });
var attendanceReasonAlert_1 = require("./notifications/attendanceReasonAlert");
Object.defineProperty(exports, "onAttendanceReasonChanged", { enumerable: true, get: function () { return attendanceReasonAlert_1.onAttendanceReasonChanged; } });
// 학원 관리 함수 export
var deactivateExpiredAcademies_1 = require("./academy/deactivateExpiredAcademies");
Object.defineProperty(exports, "deactivateExpiredAcademies", { enumerable: true, get: function () { return deactivateExpiredAcademies_1.deactivateExpiredAcademies; } });
var verifyTossPayment_1 = require("./academy/verifyTossPayment");
Object.defineProperty(exports, "verifyTossPayment", { enumerable: true, get: function () { return verifyTossPayment_1.verifyTossPayment; } });
var enforceClassLimit_1 = require("./academy/enforceClassLimit");
Object.defineProperty(exports, "enforceClassLimitForPending", { enumerable: true, get: function () { return enforceClassLimit_1.enforceClassLimitForPending; } });
// Storage 관련 함수 export
var verifyUploadMimeType_1 = require("./storage/verifyUploadMimeType");
Object.defineProperty(exports, "verifyUploadMimeType", { enumerable: true, get: function () { return verifyUploadMimeType_1.verifyUploadMimeType; } });
//# sourceMappingURL=index.js.map