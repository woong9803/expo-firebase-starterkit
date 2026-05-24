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
exports.onAttendanceReasonChanged = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 학부모 결석 사유 등록 → 담당 선생님 + 어드민(원장) 알림 트리거
 *
 * 트리거 경로: attendances/{attendanceId}/records/{studentUid}
 *   attendanceId 형식: `${classId}_{YYYY-MM-DD}` (lib/firestore.ts 의 Collections.attendanceRecords 참고)
 *
 * 발송 조건:
 *   - reason_source === 'parent' (학부모가 직접 등록한 사유만 발송)
 *     → 선생님·어드민이 명렬표에서 직접 입력한 사유는 알림 X
 *   - reason 필드가 새로 채워지거나 변경되었을 때
 *   - 같은 학원의 담당 선생님(들) + 모든 admin 에게 발송
 *
 * 멱등성:
 *   - reason 값이 동일하면 무시 (중복 호출 방지)
 *   - 다른 필드만 변경된 경우(status 등)도 무시
 */
exports.onAttendanceReasonChanged = (0, firestore_1.onDocumentWritten)('attendances/{attendanceId}/records/{studentUid}', async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data()) !== null && _b !== void 0 ? _b : null;
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after.data()) !== null && _d !== void 0 ? _d : null;
    // 삭제 케이스 무시
    if (!after)
        return;
    // ── 학부모 등록 케이스만 발송 ──
    // 선생님·어드민이 입력한 사유(reason_source 필드 없음)는 트리거 무시
    if (after.reason_source !== 'parent')
        return;
    const beforeReason = before === null || before === void 0 ? void 0 : before.reason;
    const afterReason = after.reason;
    // reason이 비어있으면 발송하지 않음 (선생님이 status만 입력한 경우 등)
    if (!afterReason || afterReason.trim() === '')
        return;
    // reason 값이 동일하면 무시 (다른 필드만 바뀐 경우)
    if (beforeReason === afterReason)
        return;
    const attendanceId = event.params.attendanceId;
    const studentUid = event.params.studentUid;
    // attendanceId = `${classId}_${YYYY-MM-DD}` 패턴 — 마지막 '_' 기준 분리
    // (classId 자체에 '_' 가 들어갈 수 있으므로 lastIndexOf 사용)
    const sepIdx = attendanceId.lastIndexOf('_');
    if (sepIdx < 0) {
        logger.warn('[attendanceReasonAlert] attendanceId 형식 오류', { attendanceId });
        return;
    }
    const classId = attendanceId.substring(0, sepIdx);
    const db = admin.firestore();
    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 reason 값으로의 중복 발송을 막기 위해 reason_notified_for 필드로 추적.
    // 학부모가 사유를 수정하면(다른 값) 새 알림이 발송된다.
    const recordRef = event.data.after.ref;
    const shouldProcess = await db.runTransaction(async (tx) => {
        const snap = await tx.get(recordRef);
        if (!snap.exists)
            return false;
        const cur = snap.data();
        if (cur.reason_notified_for === cur.reason)
            return false; // 같은 값 재발송 차단
        tx.update(recordRef, { reason_notified_for: cur.reason });
        return true;
    });
    if (!shouldProcess) {
        logger.info('[attendanceReasonAlert] 중복 호출 — 알림 발송 건너뜀', { attendanceId, studentUid });
        return;
    }
    try {
        // 부모 attendance 문서에서 academy_id 조회 (Pro 플랜 체크용)
        const attendanceDoc = await db.collection('attendances').doc(attendanceId).get();
        const academyId = (_e = attendanceDoc.data()) === null || _e === void 0 ? void 0 : _e.academy_id;
        if (!academyId) {
            logger.warn('[attendanceReasonAlert] academy_id 없음 — 발송 중단', { attendanceId });
            return;
        }
        // 학생/반 이름 조회 (알림 본문 구성용)
        const [studentSnap, classSnap] = await Promise.all([
            db.collection('users').doc(studentUid).get(),
            db.collection('classes').doc(classId).get(),
        ]);
        const studentName = (_g = (_f = studentSnap.data()) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : '학생';
        const className = (_j = (_h = classSnap.data()) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : '반';
        // 발송 대상 조회 — 담당 선생님 + 모든 admin (둘 다 같은 학원)
        const [teachersSnap, adminsSnap] = await Promise.all([
            db.collection('users')
                .where('academy_id', '==', academyId)
                .where('role', '==', 'teacher')
                .where('assigned_class_ids', 'array-contains', classId)
                .get(),
            db.collection('users')
                .where('academy_id', '==', academyId)
                .where('role', '==', 'admin')
                .get(),
        ]);
        if (teachersSnap.empty && adminsSnap.empty) {
            logger.info('[attendanceReasonAlert] 발송 대상 없음', { classId, academyId });
            return;
        }
        const title = strings_1.NOTIFICATION_MESSAGES.attendanceReasonForTeacher.title;
        const body = strings_1.NOTIFICATION_MESSAGES.attendanceReasonForTeacher.body(className, studentName, afterReason);
        // 선생님은 본인 출결 탭, 어드민은 본인 출결 탭으로 분기
        const targets = [
            ...teachersSnap.docs.map(d => ({
                doc: d,
                deepLink: '/(app)/(teacher)/(tabs)/attendance',
            })),
            ...adminsSnap.docs.map(d => ({
                doc: d,
                deepLink: '/(app)/(admin)/(tabs)/attendance',
            })),
        ];
        // 각 대상에게 발송 (notif_prefs.attendance === false 면 건너뜀, 탈퇴 유저 제외)
        let sentCount = 0;
        for (const { doc, deepLink } of targets) {
            const u = doc.data();
            if (u.deleted_at)
                continue;
            if (((_k = u.notif_prefs) === null || _k === void 0 ? void 0 : _k.attendance) === false)
                continue;
            await (0, sendFcm_1.sendFcmNotification)({
                academyId,
                targetUid: doc.id,
                fcmToken: (_l = u.fcm_token) !== null && _l !== void 0 ? _l : '',
                title,
                body,
                type: 'attendance_reason',
                deepLink,
            });
            sentCount += 1;
        }
        logger.info('[attendanceReasonAlert] 발송 완료', {
            attendanceId,
            classId,
            studentUid,
            teacherCount: teachersSnap.size,
            adminCount: adminsSnap.size,
            sentCount,
        });
    }
    catch (e) {
        logger.error('[attendanceReasonAlert] 처리 실패', e);
    }
});
//# sourceMappingURL=attendanceReasonAlert.js.map