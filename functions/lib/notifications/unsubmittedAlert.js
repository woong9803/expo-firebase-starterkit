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
exports.sendUnsubmittedAlert = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 미제출 학부모 알림 스케줄러 (매시간 정각 실행)
 * 마감시간이 지난 숙제 중 아직 알림을 보내지 않은 숙제의 미제출 학생 학부모에게 알림 발송
 *
 * 멱등성 보장: homework 문서의 unsubmitted_alert_sent_date 필드로 중복 발송 방지
 */
exports.sendUnsubmittedAlert = (0, scheduler_1.onSchedule)({ schedule: '0 * * * *', timeZone: 'Asia/Seoul' }, // 매시간 정각 실행
async () => {
    var _a, _b, _c;
    const db = admin.firestore();
    // 현재 시각 기준으로 마감시간이 지난 숙제 범위 계산
    const now = new Date();
    // 조회 범위: 오늘 00:00 ~ 현재 시각 (마감시간이 지난 숙제만)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); // 현재 시각까지만 → 마감 지난 숙제만 조회
    const todayStr = now.toISOString().split('T')[0]; // 멱등성 체크용 날짜 키
    // 마감시간이 현재 이전인 숙제 조회 (오늘 내에서 이미 마감된 것만)
    const hwSnap = await db
        .collection('homeworks')
        .where('due_date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .where('due_date', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
        .get();
    if (hwSnap.empty)
        return;
    const batch = [];
    // 발송 완료 후 멱등성 필드를 업데이트할 숙제 문서 목록
    const docsToMark = [];
    // 학원별 standard/pro 플랜 허용 여부 캐시 — 같은 학원에 여러 숙제가 있을 때 N+1 방지
    const planAllowedCache = new Map();
    for (const hwDoc of hwSnap.docs) {
        const hw = hwDoc.data();
        // 멱등성: 이미 오늘 발송한 숙제는 건너뜀
        if (hw.unsubmitted_alert_sent_date === todayStr)
            continue;
        const classId = hw.class_id;
        const academyId = await getAcademyIdByClass(db, classId);
        if (!academyId)
            continue;
        // 미제출 자동 알림은 PRD 685 줄 기준 standard/pro 전용
        // → trial·starter·free 학원의 숙제는 알림 발송 건너뜀 (Rules 우회 시 방어 심화)
        const planAllowed = await isStandardOrProAllowed(db, academyId, planAllowedCache);
        if (!planAllowed)
            continue;
        // 해당 반 학생 목록 조회
        const studentsSnap = await db
            .collection('users')
            .where('class_id', '==', classId)
            .where('role', '==', 'student')
            .where('is_active', '==', true)
            .get();
        // 이미 제출한 학생 uid 목록
        const submissionsSnap = await db
            .collection('homeworks')
            .doc(hwDoc.id)
            .collection('submissions')
            .get();
        const submittedUids = new Set(submissionsSnap.docs.map((d) => d.id));
        // 미제출 학생 필터링 → 각 학생의 학부모에게 알림
        for (const studentDoc of studentsSnap.docs) {
            if (submittedUids.has(studentDoc.id))
                continue;
            const student = studentDoc.data();
            // 해당 학생의 학부모 조회 — academy_id 격리로 멀티 학원 자녀 누수 방지
            const parentsSnap = await db
                .collection('users')
                .where('academy_id', '==', academyId)
                .where('role', '==', 'parent')
                .where('children', 'array-contains', studentDoc.id)
                .get();
            // fcm_token 없어도 인박스 저장은 항상 진행
            for (const parentDoc of parentsSnap.docs) {
                const parent = parentDoc.data();
                // 숙제 알림 OFF 설정 시 건너뜀
                if (((_a = parent.notif_prefs) === null || _a === void 0 ? void 0 : _a.homework) === false)
                    continue;
                batch.push({
                    academyId,
                    targetUid: parentDoc.id,
                    fcmToken: (_b = parent.fcm_token) !== null && _b !== void 0 ? _b : '', // 토큰 없으면 FCM 건너뜀, 인박스는 저장
                    title: strings_1.NOTIFICATION_MESSAGES.unsubmittedAlert.title(hw.title),
                    body: strings_1.NOTIFICATION_MESSAGES.unsubmittedAlert.body((_c = student.name) !== null && _c !== void 0 ? _c : '자녀'),
                    type: 'homework_due',
                    deepLink: `/(app)/(parent)/index`,
                });
            }
        }
        // 발송 대상에 포함된 숙제 → 나중에 멱등성 필드 업데이트
        docsToMark.push(hwDoc.ref);
    }
    if (batch.length > 0) {
        await (0, sendFcm_1.sendFcmBatch)(batch);
    }
    // sendFcmBatch 성공 후 멱등성 필드 업데이트 — 실패 시 재시도 가능
    for (const ref of docsToMark) {
        await ref.update({ unsubmitted_alert_sent_date: todayStr });
    }
    logger.info('[unsubmittedAlert] 알림 처리 완료', { notificationCount: batch.length });
});
// 반 ID로 학원 ID 조회 헬퍼
async function getAcademyIdByClass(db, classId) {
    var _a;
    const classDoc = await db.collection('classes').doc(classId).get();
    return classDoc.exists ? (_a = classDoc.data()) === null || _a === void 0 ? void 0 : _a.academy_id : null;
}
/**
 * 학원이 미제출 자동 알림 기능을 사용할 수 있는 플랜인지 확인 (standard/pro 만 허용).
 *
 * - PRD 685 줄: 미제출 자동 알림은 standard 이상 전용
 * - 만료 체크: plan_expires_at 가 미래여야 통과
 * - 캐시: 같은 학원의 여러 숙제 처리 시 academies 문서 중복 조회 방지
 */
async function isStandardOrProAllowed(db, academyId, cache) {
    var _a;
    if (cache.has(academyId))
        return cache.get(academyId);
    const snap = await db.collection('academies').doc(academyId).get();
    if (!snap.exists) {
        cache.set(academyId, false);
        return false;
    }
    const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    const plan = data.plan;
    const expiresAt = data.plan_expires_at;
    const notExpired = !expiresAt || expiresAt.toMillis() > Date.now();
    const allowed = (plan === 'standard' || plan === 'pro') && notExpired;
    cache.set(academyId, allowed);
    return allowed;
}
//# sourceMappingURL=unsubmittedAlert.js.map