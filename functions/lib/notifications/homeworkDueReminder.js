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
exports.sendHomeworkDueReminder = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 마감 전날 알림 스케줄러 (매일 09:00 KST)
 * 내일 마감인 숙제의 미제출 학생들에게 알림 발송
 *
 * 멱등성 보장: homework 문서의 due_reminder_sent_date 필드로 중복 발송 방지
 */
exports.sendHomeworkDueReminder = (0, scheduler_1.onSchedule)({ schedule: 'every day 00:00', timeZone: 'Asia/Seoul' }, async () => {
    var _a;
    const db = admin.firestore();
    // 내일 날짜 범위 계산 (KST 기준)
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(now.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const todayStr = now.toISOString().split('T')[0]; // 멱등성 체크용 날짜 키
    // 내일 마감인 숙제 조회
    const hwSnap = await db
        .collection('homeworks')
        .where('due_date', '>=', admin.firestore.Timestamp.fromDate(tomorrowStart))
        .where('due_date', '<=', admin.firestore.Timestamp.fromDate(tomorrowEnd))
        .get();
    if (hwSnap.empty)
        return;
    const batch = [];
    for (const hwDoc of hwSnap.docs) {
        const hw = hwDoc.data();
        // 멱등성: 이미 오늘 발송한 숙제는 건너뜀
        if (hw.due_reminder_sent_date === todayStr)
            continue;
        const classId = hw.class_id;
        const academyId = await getAcademyIdByClass(db, classId);
        if (!academyId)
            continue;
        // 해당 반 학생 목록 조회
        const studentsSnap = await db
            .collection('users')
            .where('class_id', '==', classId)
            .where('role', '==', 'student')
            .where('is_active', '==', true)
            .get();
        // 제출한 학생 uid 목록
        const submissionsSnap = await db
            .collection('homeworks')
            .doc(hwDoc.id)
            .collection('submissions')
            .get();
        const submittedUids = new Set(submissionsSnap.docs.map((d) => d.id));
        // 미제출 학생 필터링 — fcm_token 없어도 인박스 저장은 항상 진행
        for (const studentDoc of studentsSnap.docs) {
            if (submittedUids.has(studentDoc.id))
                continue;
            const student = studentDoc.data();
            batch.push({
                academyId,
                targetUid: studentDoc.id,
                fcmToken: (_a = student.fcm_token) !== null && _a !== void 0 ? _a : '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
                title: strings_1.NOTIFICATION_MESSAGES.homeworkDueReminder.title(hw.title),
                body: strings_1.NOTIFICATION_MESSAGES.homeworkDueReminder.body,
                type: 'homework_due',
                deepLink: `/(app)/(student)/homework`,
            });
        }
        // 멱등성 필드 업데이트 — 오늘 날짜 저장
        await hwDoc.ref.update({ due_reminder_sent_date: todayStr });
    }
    if (batch.length > 0) {
        await (0, sendFcm_1.sendFcmBatch)(batch);
    }
    logger.info('[homeworkDueReminder] 알림 처리 완료', { notificationCount: batch.length });
});
// 반 ID로 학원 ID 조회 헬퍼
async function getAcademyIdByClass(db, classId) {
    var _a;
    const classDoc = await db.collection('classes').doc(classId).get();
    return classDoc.exists ? (_a = classDoc.data()) === null || _a === void 0 ? void 0 : _a.academy_id : null;
}
//# sourceMappingURL=homeworkDueReminder.js.map