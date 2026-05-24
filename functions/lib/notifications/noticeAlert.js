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
exports.onNoticeCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 공지 등록 알림 트리거
 * 새 공지가 생성되면 target_roles, target_class_ids 기준으로 대상 사용자에게 알림 발송
 */
exports.onNoticeCreated = (0, firestore_1.onDocumentCreated)('notices/{noticeId}', async (event) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const notice = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!notice)
        return;
    const noticeId = event.params.noticeId;
    const academyId = notice.academy_id;
    const targetRoles = (_b = notice.target_roles) !== null && _b !== void 0 ? _b : []; // 빈 배열 = 모두
    const targetClassIds = (_c = notice.target_class_ids) !== null && _c !== void 0 ? _c : []; // 빈 배열 = 전체 반
    const db = admin.firestore();
    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 noticeId 이벤트가 2회 이상 트리거돼도 알림은 1회만 발송되도록
    // notification_sent 플래그를 트랜잭션으로 선점한다.
    // 알림 발송 중 실패하더라도 중복 발송보다 누락이 덜 치명적이라는 판단.
    const noticeRef = db.collection('notices').doc(noticeId);
    const shouldProcess = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(noticeRef);
        if (!snap.exists)
            return false;
        if (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.notification_sent) === true)
            return false;
        tx.update(noticeRef, { notification_sent: true });
        return true;
    });
    if (!shouldProcess) {
        logger.info('[noticeAlert] 중복 호출 — 알림 발송 건너뜀', { noticeId });
        return;
    }
    // 해당 학원의 사용자 조회
    let query = db
        .collection('users')
        .where('academy_id', '==', academyId)
        .where('is_active', '==', true);
    // 역할 필터 (빈 배열이면 전체 역할 대상)
    if (targetRoles.length > 0) {
        query = query.where('role', 'in', targetRoles);
    }
    const usersSnap = await query.get();
    if (usersSnap.empty)
        return;
    const batch = [];
    // notice-detail 화면은 useLocalSearchParams 로 noticeId 키를 읽음
    // (id 로 보내면 화면이 noticeId 가드에 걸려 무한 로딩 발생)
    const deepLink = `/(app)/common/notice-detail?noticeId=${noticeId}`;
    for (const userDoc of usersSnap.docs) {
        const user = userDoc.data();
        // fcm_token 없어도 인박스 저장은 항상 진행 (continue 제거)
        // 반 필터: target_class_ids가 있으면 해당 반 소속만 포함
        // 학생: class_id가 target_class_ids에 포함되는지 확인
        // 선생님/학부모: assigned_class_ids 또는 자녀 class_id 기준
        if (targetClassIds.length > 0) {
            const userClassId = (_d = user.class_id) !== null && _d !== void 0 ? _d : null;
            const assignedClassIds = (_e = user.assigned_class_ids) !== null && _e !== void 0 ? _e : [];
            const isInTargetClass = (userClassId && targetClassIds.includes(userClassId)) ||
                assignedClassIds.some((id) => targetClassIds.includes(id));
            if (!isInTargetClass)
                continue;
        }
        // 공지 알림 OFF 설정 시 건너뜀
        if (((_f = user.notif_prefs) === null || _f === void 0 ? void 0 : _f.notice) === false)
            continue;
        batch.push({
            academyId,
            targetUid: userDoc.id,
            fcmToken: (_g = user.fcm_token) !== null && _g !== void 0 ? _g : '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
            title: strings_1.NOTIFICATION_MESSAGES.noticeAlert.title(notice.title),
            body: strings_1.NOTIFICATION_MESSAGES.noticeAlert.body,
            type: 'notice',
            deepLink,
        });
    }
    if (batch.length > 0) {
        await (0, sendFcm_1.sendFcmBatch)(batch);
    }
    logger.info('[noticeAlert] 알림 처리 완료', {
        noticeId,
        notificationCount: batch.length,
    });
});
//# sourceMappingURL=noticeAlert.js.map