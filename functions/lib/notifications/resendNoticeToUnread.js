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
exports.resendNoticeToUnread = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 공지 미확인자에게 재알림 발송 (admin 전용 onCall)
 *
 * 흐름:
 *   1) 호출자 인증 + admin 역할 검증
 *   2) notice 문서 조회 → 호출자 학원과 일치 확인
 *   3) target_roles + target_class_ids 필터로 audience 산출
 *   4) read_by에 없는 사용자만 추출 (학부모는 자녀 class_id 매칭)
 *   5) 24시간 내 재발송 차단(last_resent_at 쿨다운)
 *   6) sendFcmBatch로 FCM + 인박스 저장
 *   7) notice 문서에 last_resent_at, last_resent_count 기록
 *
 * 응답: { sent: number, skipped: number }
 */
// region: 전역 옵션(asia-northeast3) 상속
exports.resendNoticeToUnread = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const callerUid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!callerUid) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요해요.');
    }
    const noticeId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.noticeId;
    if (!noticeId || typeof noticeId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'noticeId가 필요해요.');
    }
    const db = admin.firestore();
    // 1) 호출자 검증 — admin만 허용
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
        throw new https_1.HttpsError('permission-denied', '계정 정보를 찾을 수 없어요.');
    }
    const caller = callerSnap.data();
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', '관리자만 사용할 수 있어요.');
    }
    const callerAcademyId = caller.academy_id;
    if (!callerAcademyId) {
        throw new https_1.HttpsError('failed-precondition', '학원 정보가 없어요.');
    }
    // 2) 공지 문서 조회
    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeSnap = await noticeRef.get();
    if (!noticeSnap.exists) {
        throw new https_1.HttpsError('not-found', '공지를 찾을 수 없어요.');
    }
    const notice = noticeSnap.data();
    if (notice.academy_id !== callerAcademyId) {
        throw new https_1.HttpsError('permission-denied', '다른 학원의 공지에는 접근할 수 없어요.');
    }
    // 3) 24시간 쿨다운 — 무분별한 반복 발송 방지
    const lastResentAt = notice.last_resent_at;
    if (lastResentAt) {
        const diffMs = Date.now() - lastResentAt.toMillis();
        const COOLDOWN_MS = 24 * 60 * 60 * 1000;
        if (diffMs < COOLDOWN_MS) {
            const hoursLeft = Math.ceil((COOLDOWN_MS - diffMs) / (60 * 60 * 1000));
            throw new https_1.HttpsError('resource-exhausted', `재알림은 24시간에 한 번만 가능해요. (약 ${hoursLeft}시간 후 다시 시도)`);
        }
    }
    // 4) audience 산출 — target_roles + target_class_ids 적용
    const targetRoles = (_c = notice.target_roles) !== null && _c !== void 0 ? _c : [];
    const targetClassIds = (_d = notice.target_class_ids) !== null && _d !== void 0 ? _d : [];
    const readBy = (_e = notice.read_by) !== null && _e !== void 0 ? _e : [];
    const readSet = new Set(readBy);
    let usersQuery = db.collection('users')
        .where('academy_id', '==', callerAcademyId)
        .where('is_active', '==', true);
    if (targetRoles.length > 0) {
        usersQuery = usersQuery.where('role', 'in', targetRoles);
    }
    else {
        // 빈 배열이면 학생+학부모만 — 선생님/admin은 공지 수신 대상이 아님
        usersQuery = usersQuery.where('role', 'in', ['student', 'parent']);
    }
    const usersSnap = await usersQuery.get();
    if (usersSnap.empty) {
        return { sent: 0, skipped: 0 };
    }
    // 학부모 audience를 위해 자녀 class_id 맵 미리 조회 (반 필터가 있을 때만)
    let studentClassByUid = new Map();
    if (targetClassIds.length > 0) {
        const studentsSnap = await db.collection('users')
            .where('academy_id', '==', callerAcademyId)
            .where('role', '==', 'student')
            .where('is_active', '==', true)
            .get();
        studentsSnap.docs.forEach((d) => {
            var _a;
            studentClassByUid.set(d.id, ((_a = d.data().class_id) !== null && _a !== void 0 ? _a : null));
        });
    }
    // 5) 미확인자만 추출
    const noticeTitle = (_f = notice.title) !== null && _f !== void 0 ? _f : '공지';
    // notice-detail 화면은 useLocalSearchParams 로 noticeId 키를 읽음
    // (id 로 보내면 화면이 noticeId 가드에 걸려 무한 로딩 발생)
    const deepLink = `/(app)/common/notice-detail?noticeId=${noticeId}`;
    const batch = [];
    let skipped = 0;
    for (const userDoc of usersSnap.docs) {
        const u = userDoc.data();
        const uid = userDoc.id;
        // 이미 읽음 → 건너뜀
        if (readSet.has(uid))
            continue;
        // 삭제된 계정 → 건너뜀
        if (u.deleted_at)
            continue;
        // 반 필터
        if (targetClassIds.length > 0) {
            const role = u.role;
            let userClassId = null;
            if (role === 'student') {
                userClassId = ((_g = u.class_id) !== null && _g !== void 0 ? _g : null);
            }
            else if (role === 'parent') {
                // 첫 자녀 반 기준 (다자녀는 첫 자녀)
                const firstChild = ((_h = u.children) !== null && _h !== void 0 ? _h : [])[0];
                userClassId = firstChild ? ((_j = studentClassByUid.get(firstChild)) !== null && _j !== void 0 ? _j : null) : null;
            }
            if (!userClassId || !targetClassIds.includes(userClassId)) {
                skipped++;
                continue;
            }
        }
        // 공지 알림 OFF — 건너뜀
        if (((_k = u.notif_prefs) === null || _k === void 0 ? void 0 : _k.notice) === false) {
            skipped++;
            continue;
        }
        batch.push({
            academyId: callerAcademyId,
            targetUid: uid,
            fcmToken: ((_l = u.fcm_token) !== null && _l !== void 0 ? _l : ''),
            title: strings_1.NOTIFICATION_MESSAGES.noticeReminder.title(noticeTitle),
            body: strings_1.NOTIFICATION_MESSAGES.noticeReminder.body,
            type: 'notice',
            deepLink,
        });
    }
    // 6) 발송
    if (batch.length > 0) {
        await (0, sendFcm_1.sendFcmBatch)(batch);
    }
    // 7) 쿨다운 기록
    await noticeRef.update({
        last_resent_at: admin.firestore.FieldValue.serverTimestamp(),
        last_resent_count: batch.length,
    });
    logger.info('[resendNoticeToUnread] 재알림 발송 완료', {
        noticeId,
        academyId: callerAcademyId,
        sent: batch.length,
        skipped,
    });
    return { sent: batch.length, skipped };
});
//# sourceMappingURL=resendNoticeToUnread.js.map