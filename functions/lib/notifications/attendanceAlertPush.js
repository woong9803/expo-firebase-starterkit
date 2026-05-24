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
exports.sendAttendanceAlertPush = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 선생님이 출결 저장 시 학부모에게 알림을 보내는 callable 함수
 * 결석/지각 학생의 학부모에게만 발송
 * 호출: sendAttendanceAlertPush({ academyId, records: [{ uid, status, name }] })
 */
exports.sendAttendanceAlertPush = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    // 인증 확인
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const { academyId, records } = request.data;
    if (!academyId || !(records === null || records === void 0 ? void 0 : records.length))
        return { success: true };
    const db = admin.firestore();
    // 호출자 역할 및 학원 소속 검증 — 선생님/admin이고 같은 학원 소속인지 확인
    const callerUid = request.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', '호출자 정보를 찾을 수 없습니다.');
    }
    const caller = callerDoc.data();
    if (caller.role !== 'teacher' && caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', '선생님만 출결 알림을 보낼 수 있습니다.');
    }
    if (caller.academy_id !== academyId) {
        throw new https_1.HttpsError('permission-denied', '다른 학원의 출결 알림은 보낼 수 없습니다.');
    }
    // 결석 또는 지각 학생만 필터링
    const targets = records.filter((r) => r.status === 'absent' || r.status === 'late');
    if (targets.length === 0)
        return { success: true };
    for (const target of targets) {
        const { uid: studentUid, status, name: studentName } = target;
        // 해당 학생의 학부모 조회
        const parentsSnap = await db
            .collection('users')
            .where('role', '==', 'parent')
            .where('children', 'array-contains', studentUid)
            .get();
        for (const parentDoc of parentsSnap.docs) {
            const parent = parentDoc.data();
            // 출결 알림 OFF 설정 시 건너뜀
            if (((_a = parent.notif_prefs) === null || _a === void 0 ? void 0 : _a.attendance) === false)
                continue;
            await (0, sendFcm_1.sendFcmNotification)({
                academyId,
                targetUid: parentDoc.id,
                fcmToken: (_b = parent.fcm_token) !== null && _b !== void 0 ? _b : '',
                title: strings_1.NOTIFICATION_MESSAGES.attendanceAlert.title(studentName),
                body: status === 'absent'
                    ? strings_1.NOTIFICATION_MESSAGES.attendanceAlert.bodyAbsent
                    : strings_1.NOTIFICATION_MESSAGES.attendanceAlert.bodyLate,
                type: 'attendance',
                deepLink: `/(app)/(parent)/index`,
            });
        }
    }
    logger.info('[attendanceAlertPush] 알림 발송 완료', {
        academyId,
        targetCount: targets.length,
    });
    return { success: true };
});
//# sourceMappingURL=attendanceAlertPush.js.map