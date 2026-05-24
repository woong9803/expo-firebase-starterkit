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
exports.onHomeworkCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-functions/v2/firestore");
const sendFcm_1 = require("./sendFcm");
const strings_1 = require("../strings");
/**
 * 숙제 신규 등록 알림 트리거
 * 선생님(또는 admin)이 새 숙제를 등록하면 해당 반의 학생 + 그 학생들의 학부모 모두에게 알림 발송
 *
 * 알림 본문 예시 (양식 B):
 *   제목: "새 숙제가 등록됐어요"
 *   본문: "수학반 · 기출문제 1단원 · 8/30(금)까지"
 */
exports.onHomeworkCreated = (0, firestore_1.onDocumentCreated)('homeworks/{homeworkId}', async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const homework = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!homework)
        return;
    const homeworkId = event.params.homeworkId;
    const classId = homework.class_id;
    const homeworkTitle = (_b = homework.title) !== null && _b !== void 0 ? _b : '';
    const dueDate = homework.due_date;
    if (!classId || !dueDate) {
        logger.warn('[homeworkCreated] class_id 또는 due_date 누락', { homeworkId });
        return;
    }
    const db = admin.firestore();
    // ── 멱등성 가드 (Eventarc at-least-once 정책으로 인한 중복 호출 방지) ──
    // 같은 homeworkId 이벤트가 2회 이상 트리거돼도 알림은 1회만 발송되도록
    // notification_sent 플래그를 트랜잭션으로 선점한다.
    const hwRef = db.collection('homeworks').doc(homeworkId);
    const shouldProcess = await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(hwRef);
        if (!snap.exists)
            return false;
        if (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.notification_sent) === true)
            return false;
        tx.update(hwRef, { notification_sent: true });
        return true;
    });
    if (!shouldProcess) {
        logger.info('[homeworkCreated] 중복 호출 — 알림 발송 건너뜀', { homeworkId });
        return;
    }
    // ─── 1) 반(class) 문서 조회 — academy_id + 반 이름 획득 ───────────────
    const classSnap = await db.collection('classes').doc(classId).get();
    if (!classSnap.exists) {
        logger.warn('[homeworkCreated] class 문서 없음', { classId });
        return;
    }
    const classData = classSnap.data();
    const academyId = classData.academy_id;
    const className = (_c = classData.name) !== null && _c !== void 0 ? _c : '';
    // ─── 2) 알림 본문 마감일 라벨 생성 — "M/D(요일)" ──────────────────────
    const dueLabel = formatDueLabel(dueDate.toDate());
    // ─── 3) 해당 반 학생들 조회 (활성 사용자만) ──────────────────────────
    const studentsSnap = await db
        .collection('users')
        .where('academy_id', '==', academyId)
        .where('class_id', '==', classId)
        .where('role', '==', 'student')
        .where('is_active', '==', true)
        .get();
    const studentUids = studentsSnap.docs.map((d) => d.id);
    // ─── 4) 학부모 조회 — children 배열에 위 학생 uid 가 포함된 학부모 ────
    // Firestore array-contains-any 는 최대 30개 제한 — 30명 단위로 청크 분할
    const parentsByStudent = new Map();
    if (studentUids.length > 0) {
        const CHUNK = 30;
        for (let i = 0; i < studentUids.length; i += CHUNK) {
            const chunk = studentUids.slice(i, i + CHUNK);
            const parentSnap = await db
                .collection('users')
                .where('academy_id', '==', academyId)
                .where('role', '==', 'parent')
                .where('is_active', '==', true)
                .where('children', 'array-contains-any', chunk)
                .get();
            for (const pDoc of parentSnap.docs) {
                const pData = pDoc.data();
                const pChildren = (_d = pData.children) !== null && _d !== void 0 ? _d : [];
                for (const sUid of pChildren) {
                    if (!chunk.includes(sUid))
                        continue;
                    const arr = (_e = parentsByStudent.get(sUid)) !== null && _e !== void 0 ? _e : [];
                    arr.push(Object.assign({ uid: pDoc.id }, pData));
                    parentsByStudent.set(sUid, arr);
                }
            }
        }
    }
    // ─── 5) 알림 batch 구성 — 학생 + 학부모 ───────────────────────────────
    const batch = [];
    const title = strings_1.NOTIFICATION_MESSAGES.homeworkCreated.title;
    const body = strings_1.NOTIFICATION_MESSAGES.homeworkCreated.body(className, homeworkTitle, dueLabel);
    // 학생용 딥링크 — 학생 숙제 탭
    const studentDeepLink = '/(app)/(student)/(tabs)/homework';
    // 학부모용 딥링크 — 학부모 숙제 탭
    const parentDeepLink = '/(app)/(parent)/(tabs)/homework';
    // 동일 학부모가 같은 반에 자녀 2명 이상인 경우 같은 알림이 자녀 수만큼 중복 발송되는 문제 방지
    // — `attendanceReasonAlert` 의 수신자 중복 제거 패턴과 동일하게 학부모 uid Set 으로 1회만 push
    const notifiedParentUids = new Set();
    for (const sDoc of studentsSnap.docs) {
        const student = sDoc.data();
        // 학생 알림 OFF 설정 시 건너뜀 (homework 카테고리 또는 전체 OFF)
        if (((_f = student.notif_prefs) === null || _f === void 0 ? void 0 : _f.homework) === false)
            continue;
        batch.push({
            academyId,
            targetUid: sDoc.id,
            fcmToken: (_g = student.fcm_token) !== null && _g !== void 0 ? _g : '',
            title,
            body,
            type: 'homework_created',
            deepLink: studentDeepLink,
        });
        // 그 학생의 학부모들도 알림 — 동일 학부모는 1회만
        const parents = (_h = parentsByStudent.get(sDoc.id)) !== null && _h !== void 0 ? _h : [];
        for (const parent of parents) {
            if (((_j = parent.notif_prefs) === null || _j === void 0 ? void 0 : _j.homework) === false)
                continue;
            if (notifiedParentUids.has(parent.uid))
                continue; // 이미 push 한 학부모 skip
            notifiedParentUids.add(parent.uid);
            batch.push({
                academyId,
                targetUid: parent.uid,
                fcmToken: (_k = parent.fcm_token) !== null && _k !== void 0 ? _k : '',
                title,
                body,
                type: 'homework_created',
                deepLink: parentDeepLink,
            });
        }
    }
    if (batch.length > 0) {
        await (0, sendFcm_1.sendFcmBatch)(batch);
    }
    logger.info('[homeworkCreated] 알림 처리 완료', {
        homeworkId,
        classId,
        studentCount: studentsSnap.size,
        notificationCount: batch.length,
    });
});
// ─── 유틸리티 ──────────────────────────────────────────────────────────
/**
 * 마감일을 "M/D(요일)" 형식으로 포맷
 * 예: 2026-08-30 → "8/30(금)"
 * 한국 시간대 기준 요일 계산
 */
function formatDueLabel(date) {
    // Asia/Seoul 시간대로 보정 — UTC + 9시간
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const m = kst.getUTCMonth() + 1;
    const d = kst.getUTCDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[kst.getUTCDay()];
    return `${m}/${d}(${dayName})`;
}
//# sourceMappingURL=homeworkCreated.js.map