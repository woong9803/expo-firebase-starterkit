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
exports.onHomeworkFeedback = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
const hash_1 = require("../lib/hash");
/**
 * 숙제 피드백 알림 트리거
 * 선생님이 제출물에 피드백(👍/💧)을 남기면 학생과 학부모에게 알림 발송
 */
exports.onHomeworkFeedback = (0, firestore_1.onDocumentUpdated)('homeworks/{hwId}/submissions/{studentUid}', async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    // 피드백 필드가 변경되지 않았으면 무시
    if (!before || !after)
        return;
    if (before.feedback === after.feedback)
        return;
    if (!after.feedback)
        return; // null로 초기화된 경우 무시
    const hwId = event.params.hwId;
    const studentUid = event.params.studentUid;
    const db = admin.firestore();
    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 피드백 값으로의 중복 발송을 막기 위해 feedback_notified_for 필드로 추적.
    // 피드백이 실제로 변경된 경우(예: 👍 → 💧)에만 새 알림이 발송된다.
    const subRef = event.data.after.ref;
    const shouldProcess = await db.runTransaction(async (tx) => {
        const snap = await tx.get(subRef);
        if (!snap.exists)
            return false;
        const cur = snap.data();
        if (cur.feedback_notified_for === cur.feedback)
            return false; // 같은 값 재발송 차단
        tx.update(subRef, { feedback_notified_for: cur.feedback });
        return true;
    });
    if (!shouldProcess) {
        logger.info('[homeworkFeedback] 중복 호출 — 알림 발송 건너뜀', { hwId, studentUid });
        return;
    }
    // 숙제 정보 조회
    const hwDoc = await db.collection('homeworks').doc(hwId).get();
    if (!hwDoc.exists)
        return;
    const hw = hwDoc.data();
    const academyId = await getAcademyIdByClass(db, hw.class_id);
    if (!academyId)
        return;
    const deepLink = `/(app)/(student)/homework-submit?hwId=${hwId}`;
    // 학생에게 알림 발송
    const studentDoc = await db.collection('users').doc(studentUid).get();
    if (studentDoc.exists) {
        const student = studentDoc.data();
        // 피드백 알림 OFF이면 학생에게만 건너뜀 — return이 아닌 조건부로 처리
        // (return하면 아래 학부모 알림까지 모두 차단됨)
        if (((_c = student.notif_prefs) === null || _c === void 0 ? void 0 : _c.feedback) !== false) {
            await (0, sendFcm_1.sendFcmNotification)({
                academyId,
                targetUid: studentUid,
                fcmToken: (_d = student.fcm_token) !== null && _d !== void 0 ? _d : '',
                title: strings_1.NOTIFICATION_MESSAGES.feedbackStudent.title(hw.title),
                body: strings_1.NOTIFICATION_MESSAGES.feedbackStudent.body(after.feedback),
                type: 'homework_feedback',
                deepLink,
            });
        }
    }
    // 학생의 학부모에게도 알림 발송 (children 배열에 studentUid가 있는 학부모 조회)
    const parentsSnap = await db
        .collection('users')
        .where('role', '==', 'parent')
        .where('children', 'array-contains', studentUid)
        .get();
    for (const parentDoc of parentsSnap.docs) {
        const parent = parentDoc.data();
        // 피드백 알림 OFF 설정 시 건너뜀
        if (((_e = parent.notif_prefs) === null || _e === void 0 ? void 0 : _e.feedback) === false)
            continue;
        await (0, sendFcm_1.sendFcmNotification)({
            academyId,
            targetUid: parentDoc.id,
            fcmToken: (_f = parent.fcm_token) !== null && _f !== void 0 ? _f : '',
            title: strings_1.NOTIFICATION_MESSAGES.feedbackParent.title(hw.title),
            body: strings_1.NOTIFICATION_MESSAGES.feedbackParent.body(after.feedback),
            type: 'homework_feedback',
            deepLink: `/(app)/(parent)/index`,
        });
    }
    logger.info('[homeworkFeedback] 피드백 알림 발송 완료', {
        hwId,
        studentUidHash: (0, hash_1.hashForLog)(studentUid),
        feedback: after.feedback,
    });
});
// 반 ID로 학원 ID 조회 헬퍼
async function getAcademyIdByClass(db, classId) {
    var _a;
    const classDoc = await db.collection('classes').doc(classId).get();
    return classDoc.exists ? (_a = classDoc.data()) === null || _a === void 0 ? void 0 : _a.academy_id : null;
}
//# sourceMappingURL=homeworkFeedback.js.map