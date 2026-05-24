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
exports.enforceClassLimitForPending = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
/**
 * pending 학원의 반 개수 1개 제한 강제 적용 (서버 측 enforcement)
 *
 * security.md 정책:
 *   - 학원 status: pending  → 학생 최대 3명, 반 1개, 선생님 초대 불가, Pro 전환 불가
 *   - 학원 status: active   → 모든 제한 해제
 *
 * Firestore Rules 만으로는 같은 academy_id 의 classes 개수를 세는 것이 불가능
 * (Rules 는 list 쿼리 결과 size 를 알 수 없음). 따라서 클라이언트 UI 가 카운트
 * 체크를 하더라도 DevTools/Firestore SDK 직접 호출로 우회될 수 있다.
 *
 * 이 트리거가 서버 측 최후 방어선:
 *  1. classes 문서 onCreate 발생
 *  2. 해당 academy 상태 확인
 *  3. pending 이면 같은 academy_id 의 classes 개수 카운트
 *  4. 2개 이상이면 **방금 생성된 문서를 즉시 삭제** (= 우회 시도 차단)
 *
 * active 학원은 제한 없음 — 카운트도 하지 않고 조기 종료.
 *
 * 멱등성: 동일 문서에 대해 트리거가 재실행돼도 결과 동일
 *   (이미 삭제된 문서면 ref.delete() 가 no-op)
 */
exports.enforceClassLimitForPending = (0, firestore_1.onDocumentCreated)('classes/{classId}', async (event) => {
    var _a;
    const snap = event.data;
    if (!snap)
        return;
    const classData = snap.data();
    const academyId = classData.academy_id;
    if (!academyId) {
        logger.warn('[enforceClassLimit] academy_id 누락 — 문서 삭제', {
            classId: event.params.classId,
        });
        await snap.ref.delete();
        return;
    }
    const db = admin.firestore();
    // 학원 상태 조회
    const academySnap = await db.collection('academies').doc(academyId).get();
    if (!academySnap.exists) {
        logger.warn('[enforceClassLimit] 학원 문서 없음 — 반 문서 삭제', {
            academyId,
            classId: event.params.classId,
        });
        await snap.ref.delete();
        return;
    }
    const status = (_a = academySnap.data()) === null || _a === void 0 ? void 0 : _a.status;
    // active 학원은 반 개수 제한 없음 — 조기 종료
    if (status === 'active')
        return;
    // pending/rejected/그 외 상태에서는 1개 제한 적용
    // 같은 학원의 classes 전체를 가져와 created_at 오름차순 정렬
    // (count aggregation 만 쓰면 동시에 만들어진 두 문서의 트리거가 둘 다 카운트=2 를
    //  보고 각자 자기 자신을 삭제하는 race condition 발생 — 둘 다 사라짐)
    const allSnap = await db
        .collection('classes')
        .where('academy_id', '==', academyId)
        .get();
    // 1개 이하면 정상 — 통과
    if (allSnap.size <= 1)
        return;
    // created_at 오름차순 정렬 (없으면 doc.id 로 fallback — auto-id 는 timestamp prefix)
    // 같은 nanosecond 인 경우 doc.id 로 결정적 tiebreak — 두 트리거가 동일한 결정 도달
    const sorted = allSnap.docs.slice().sort((a, b) => {
        var _a, _b, _c, _d, _e, _f;
        const aTime = (_c = (_b = (_a = a.data().created_at) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        const bTime = (_f = (_e = (_d = b.data().created_at) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
        if (aTime !== bTime)
            return aTime - bTime;
        return a.id.localeCompare(b.id);
    });
    // 가장 오래된 1개가 자신이면 살림 — 후순위 트리거가 자기 자신을 삭제
    const oldestId = sorted[0].id;
    if (oldestId === event.params.classId) {
        logger.info('[enforceClassLimit] pending 학원 — 자신이 가장 오래된 반, 통과', { academyId, classId: event.params.classId });
        return;
    }
    // 자신이 가장 오래된 게 아님 → 정책 위반 → 자기 자신 삭제
    logger.warn('[enforceClassLimit] pending 학원 반 1개 제한 위반 — 신규 문서 삭제', {
        academyId,
        academyStatus: status,
        classId: event.params.classId,
        classCount: allSnap.size,
        oldestKeptId: oldestId,
    });
    await snap.ref.delete();
});
//# sourceMappingURL=enforceClassLimit.js.map