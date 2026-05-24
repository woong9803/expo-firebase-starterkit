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
exports.onHomeworkSubmitted = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
const hash_1 = require("../lib/hash");
/**
 * 학생이 숙제를 신규 제출하면 해당 학생의 학부모에게 알림 발송
 *
 * 트리거: homeworks/{hwId}/submissions/{studentUid} 문서 생성 시
 * 대상: 학부모만 (학생 본인은 제출 직후라 알림 불필요, 선생님은 별도 검사 단계에서 처리)
 * 재제출(update)은 알림 대상 아님 — onDocumentCreated 사용으로 자동 제외
 *
 * 멱등성:
 *  - Eventarc at-least-once 정책에 따른 중복 호출 방지를 위해
 *    submission 문서에 submitted_notified 플래그를 트랜잭션으로 선점
 */
exports.onHomeworkSubmitted = (0, firestore_1.onDocumentCreated)('homeworks/{hwId}/submissions/{studentUid}', async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const submission = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!submission)
        return;
    const { hwId, studentUid } = event.params;
    const db = admin.firestore();
    // ── 멱등성 가드 ──────────────────────────────────────────
    const subRef = event.data.ref;
    const shouldProcess = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(subRef);
        if (!snap.exists)
            return false;
        if (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.submitted_notified) === true)
            return false;
        tx.update(subRef, { submitted_notified: true });
        return true;
    });
    if (!shouldProcess) {
        logger.info('[homeworkSubmitted] 중복 호출 — 알림 발송 건너뜀', {
            hwId,
            studentUidHash: (0, hash_1.hashForLog)(studentUid),
        });
        return;
    }
    // ── 숙제 / 반 / 학생 정보 조회 ──────────────────────────
    const [hwSnap, studentSnap] = await Promise.all([
        db.collection('homeworks').doc(hwId).get(),
        db.collection('users').doc(studentUid).get(),
    ]);
    if (!hwSnap.exists || !studentSnap.exists) {
        logger.warn('[homeworkSubmitted] 숙제 또는 학생 문서 없음', { hwId });
        return;
    }
    const hw = hwSnap.data();
    const student = studentSnap.data();
    const studentName = (_b = student.name) !== null && _b !== void 0 ? _b : '자녀';
    const homeworkTitle = (_c = hw.title) !== null && _c !== void 0 ? _c : '';
    // 반 이름·academy_id 조회
    const classId = hw.class_id;
    if (!classId)
        return;
    const classSnap = await db.collection('classes').doc(classId).get();
    if (!classSnap.exists)
        return;
    const classData = classSnap.data();
    const academyId = classData.academy_id;
    const className = (_d = classData.name) !== null && _d !== void 0 ? _d : '';
    // ── 학부모 조회 — 자녀로 studentUid 를 둔 학부모 ──────
    // P2-신규-A(2026-05-20): academy_id 필터 추가 — 멀티 학원 자녀(학원 이동 후
    //   children 잔존) 케이스에서 타 학원 학부모에게 알림 누수 차단
    const parentsSnap = await db
        .collection('users')
        .where('academy_id', '==', academyId)
        .where('role', '==', 'parent')
        .where('children', 'array-contains', studentUid)
        .get();
    if (parentsSnap.empty) {
        logger.info('[homeworkSubmitted] 학부모 없음 — 알림 발송 종료', {
            studentUidHash: (0, hash_1.hashForLog)(studentUid),
        });
        return;
    }
    const title = strings_1.NOTIFICATION_MESSAGES.homeworkSubmittedParent.title(studentName);
    const body = strings_1.NOTIFICATION_MESSAGES.homeworkSubmittedParent.body(className, homeworkTitle);
    const deepLink = '/(app)/(parent)/(tabs)/homework';
    // 학부모 알림 발송 — homework 카테고리 OFF 학부모는 건너뜀
    let sent = 0;
    for (const parentDoc of parentsSnap.docs) {
        const parent = parentDoc.data();
        if (((_e = parent.notif_prefs) === null || _e === void 0 ? void 0 : _e.homework) === false)
            continue;
        await (0, sendFcm_1.sendFcmNotification)({
            academyId,
            targetUid: parentDoc.id,
            fcmToken: (_f = parent.fcm_token) !== null && _f !== void 0 ? _f : '',
            title,
            body,
            type: 'homework_submitted',
            deepLink,
        });
        sent += 1;
    }
    logger.info('[homeworkSubmitted] 알림 발송 완료', {
        hwId,
        studentUidHash: (0, hash_1.hashForLog)(studentUid),
        parentCount: parentsSnap.size,
        sentCount: sent,
    });
});
//# sourceMappingURL=homeworkSubmitted.js.map