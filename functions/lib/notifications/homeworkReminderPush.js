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
exports.sendHomeworkReminderPush = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
const hash_1 = require("../lib/hash");
/**
 * 선생님이 미제출 학생에게 수동으로 숙제 알림을 보내는 callable 함수
 * 호출: sendHomeworkReminderPush({ hwId, studentUid })
 */
exports.sendHomeworkReminderPush = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    // 인증 확인
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const { hwId, studentUid } = request.data;
    if (!hwId || !studentUid) {
        throw new https_1.HttpsError('invalid-argument', 'hwId와 studentUid가 필요합니다.');
    }
    const db = admin.firestore();
    // 호출자 역할 검증 — 선생님 또는 admin만 허용
    const callerUid = request.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', '호출자 정보를 찾을 수 없습니다.');
    }
    const caller = callerDoc.data();
    if (caller.role !== 'teacher' && caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', '선생님만 알림을 보낼 수 있습니다.');
    }
    // 숙제 정보 조회
    const hwDoc = await db.collection('homeworks').doc(hwId).get();
    if (!hwDoc.exists) {
        throw new https_1.HttpsError('not-found', '숙제를 찾을 수 없습니다.');
    }
    const hw = hwDoc.data();
    // 선생님인 경우 담당 반 소속인지 확인 (admin은 학원 전체 접근 가능)
    if (caller.role === 'teacher') {
        const assignedClassIds = (_a = caller.assigned_class_ids) !== null && _a !== void 0 ? _a : [];
        if (!assignedClassIds.includes(hw.class_id)) {
            throw new https_1.HttpsError('permission-denied', '담당 반의 알림만 보낼 수 있습니다.');
        }
    }
    // 반 → 학원 ID 조회
    const classDoc = await db.collection('classes').doc(hw.class_id).get();
    if (!classDoc.exists) {
        throw new https_1.HttpsError('not-found', '반 정보를 찾을 수 없습니다.');
    }
    const academyId = classDoc.data().academy_id;
    // 학생 정보 조회
    const studentDoc = await db.collection('users').doc(studentUid).get();
    if (!studentDoc.exists)
        return { success: true };
    const student = studentDoc.data();
    // P1-신규(2026-05-20): 호출자가 임의 studentUid 로 타 학원/타 반 학생에게
    //   스팸 푸시를 보내는 경로 차단.
    //   - student.academy_id 가 hw.class_id 의 academy 와 일치해야 함
    //   - student.class_id 가 hw.class_id 와 일치해야 함 (같은 반 학생만)
    //   - 탈퇴(soft delete) 학생도 차단
    if (student.deleted_at) {
        throw new https_1.HttpsError('permission-denied', '탈퇴한 학생에게는 알림을 보낼 수 없습니다.');
    }
    if (student.academy_id !== academyId) {
        throw new https_1.HttpsError('permission-denied', '다른 학원 학생에게는 알림을 보낼 수 없습니다.');
    }
    if (student.class_id !== hw.class_id) {
        throw new https_1.HttpsError('permission-denied', '해당 반 학생에게만 알림을 보낼 수 있습니다.');
    }
    if (student.role !== 'student') {
        throw new https_1.HttpsError('permission-denied', '학생에게만 알림을 보낼 수 있습니다.');
    }
    const deepLink = `/(app)/(student)/homework-submit?hwId=${hwId}`;
    // 숙제 알림 OFF 설정 시 건너뜀
    if (((_b = student.notif_prefs) === null || _b === void 0 ? void 0 : _b.homework) === false)
        return { success: true };
    // 학생에게 알림 발송
    await (0, sendFcm_1.sendFcmNotification)({
        academyId,
        targetUid: studentUid,
        fcmToken: (_c = student.fcm_token) !== null && _c !== void 0 ? _c : '',
        title: strings_1.NOTIFICATION_MESSAGES.homeworkReminderManual.title(hw.title),
        body: strings_1.NOTIFICATION_MESSAGES.homeworkReminderManual.body,
        type: 'homework_due',
        deepLink,
    });
    // 학생의 학부모에게도 알림 발송 — academy_id 격리로 멀티 학원 자녀 누수 방지
    const parentsSnap = await db
        .collection('users')
        .where('academy_id', '==', academyId)
        .where('role', '==', 'parent')
        .where('children', 'array-contains', studentUid)
        .get();
    for (const parentDoc of parentsSnap.docs) {
        const parent = parentDoc.data();
        // 숙제 알림 OFF 설정 시 건너뜀
        if (((_d = parent.notif_prefs) === null || _d === void 0 ? void 0 : _d.homework) === false)
            continue;
        await (0, sendFcm_1.sendFcmNotification)({
            academyId,
            targetUid: parentDoc.id,
            fcmToken: (_e = parent.fcm_token) !== null && _e !== void 0 ? _e : '',
            title: strings_1.NOTIFICATION_MESSAGES.homeworkReminderParent.title(hw.title),
            body: strings_1.NOTIFICATION_MESSAGES.homeworkReminderParent.body(student.name),
            type: 'homework_due',
            deepLink: `/(app)/(parent)/index`,
        });
    }
    logger.info('[homeworkReminderPush] 알림 발송 완료', {
        hwId,
        studentUidHash: (0, hash_1.hashForLog)(studentUid),
    });
    return { success: true };
});
//# sourceMappingURL=homeworkReminderPush.js.map