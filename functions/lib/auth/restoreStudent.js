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
exports.restoreStudent = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const rateLimit_1 = require("../lib/rateLimit");
/**
 * 퇴원(is_active: false) 학생 계정을 다시 재원(is_active: true) 처리하는 onCall 함수.
 *
 * 호출 가능 역할: teacher, admin (같은 학원 소속만)
 *
 * 요청 데이터:
 * - studentUid: string — 복구할 학생 uid
 *
 * 보안 검증 순서:
 * 1. 인증 여부
 * 2. 입력 타입 검증
 * 3. Rate Limit
 * 4. 호출자 Firestore 문서 조회 + staff 역할 확인
 * 5. 대상 학생 문서 조회 + 같은 학원 소속 확인
 * 6. 학생이 현재 퇴원 상태(is_active === false)인지 확인 — 이미 활성이면 거부
 * 7. 학원 상태 (pending/active 만 허용)
 * 8. 플랜별 학생 수 한도 재검증 (다운그레이드 후 한도 초과 복구 방지)
 * 9. is_active: true + withdrawal_date: null 로 업데이트
 *
 * 왜 onCall 로 강제하는가:
 * - Rules 는 컬렉션 카운트 쿼리를 지원하지 않아 학생 수 한도를 서버에서 검증할 수 없음
 * - 따라서 복구는 onCall CF 만 가능, Rules 에서는 staff 의 is_active false→true 변경을 차단
 */
// 플랜별 학생 수 한도 (createStudentAccount 와 동일 정책)
//   pending: 3명 — 파일럿 검증 단계
//   free:    30명 — 미결제 기본
//   trial:   무제한 — 14일 체험
//   starter: 30명
//   standard: 100명
//   pro:     무제한
const STUDENT_LIMIT = {
    free: 30,
    trial: Number.MAX_SAFE_INTEGER,
    starter: 30,
    standard: 100,
    pro: Number.MAX_SAFE_INTEGER,
};
exports.restoreStudent = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    // ── 1단계: 인증 확인 ───────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다');
    }
    const callerUid = request.auth.uid;
    // ── 2단계: 입력 검증 ───────────────────────────────
    const studentUid = (_a = request.data) === null || _a === void 0 ? void 0 : _a.studentUid;
    if (typeof studentUid !== 'string' || studentUid.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', '학생 uid가 누락되었습니다');
    }
    // ── 3단계: Rate Limit ──────────────────────────────
    // 학생 등록과 동일한 한도로 일관 적용 (대량 복구로 한도 우회 시도 방지)
    await (0, rateLimit_1.checkRateLimit)({
        key: `restoreStudent_uid_${callerUid}`,
        windowMs: 60 * 60 * 1000,
        maxAttempts: 30,
        label: 'restoreStudent.uid',
        message: '학생 복구를 너무 많이 시도했습니다. 잠시 후 다시 시도해주세요.',
    });
    const db = admin.firestore();
    // ── 4단계: 호출자 검증 — staff(admin/teacher) 확인 ──
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
        throw new https_1.HttpsError('permission-denied', '사용자 정보를 찾을 수 없습니다');
    }
    const caller = callerSnap.data();
    if (caller.deleted_at) {
        throw new https_1.HttpsError('permission-denied', '탈퇴한 계정입니다');
    }
    if (caller.role !== 'admin' && caller.role !== 'teacher') {
        throw new https_1.HttpsError('permission-denied', '학생 복구 권한이 없습니다');
    }
    if (!caller.academy_id) {
        throw new https_1.HttpsError('failed-precondition', '학원 정보가 없습니다');
    }
    // ── 5단계: 대상 학생 조회 + 같은 학원 소속 확인 ──
    const studentRef = db.collection('users').doc(studentUid);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
        throw new https_1.HttpsError('not-found', '학생 계정을 찾을 수 없습니다');
    }
    const student = studentSnap.data();
    if (student.role !== 'student') {
        throw new https_1.HttpsError('failed-precondition', '학생 계정이 아닙니다');
    }
    if (student.academy_id !== caller.academy_id) {
        throw new https_1.HttpsError('permission-denied', '다른 학원 학생은 복구할 수 없습니다');
    }
    if (student.deleted_at) {
        throw new https_1.HttpsError('failed-precondition', '탈퇴 처리된 학생은 복구할 수 없습니다');
    }
    // ── 6단계: 현재 상태 확인 — 이미 활성이면 무의미한 호출 ──
    if (student.is_active === true) {
        throw new https_1.HttpsError('failed-precondition', '이미 재원 상태인 학생입니다');
    }
    // ── 7단계: 학원 상태 확인 ─────────────────────────
    const academySnap = await db.collection('academies').doc(caller.academy_id).get();
    if (!academySnap.exists) {
        throw new https_1.HttpsError('not-found', '학원을 찾을 수 없습니다');
    }
    const academy = academySnap.data();
    if (academy.status !== 'active' && academy.status !== 'pending') {
        throw new https_1.HttpsError('permission-denied', '비활성 학원에서는 학생을 복구할 수 없습니다');
    }
    // ── 8단계: 학생 수 한도 재검증 (다운그레이드 후 복구로 한도 초과 방지) ──
    let limit;
    let limitLabel;
    if (academy.status === 'pending') {
        limit = 3;
        limitLabel = '승인 전';
    }
    else {
        const plan = (_b = academy.plan) !== null && _b !== void 0 ? _b : 'free';
        limit = (_c = STUDENT_LIMIT[plan]) !== null && _c !== void 0 ? _c : STUDENT_LIMIT.free;
        limitLabel = plan;
    }
    if (Number.isFinite(limit) && limit < Number.MAX_SAFE_INTEGER) {
        // 현재 활성(is_active: true) 학생 수 카운트 — 복구 후 한 명 늘어나므로 >= limit 이면 차단
        const activeCountSnap = await db
            .collection('users')
            .where('academy_id', '==', caller.academy_id)
            .where('role', '==', 'student')
            .where('is_active', '==', true)
            .count()
            .get();
        if (activeCountSnap.data().count >= limit) {
            throw new https_1.HttpsError('failed-precondition', academy.status === 'pending'
                ? `승인 전 학원은 학생 최대 ${limit}명까지만 활성화할 수 있습니다`
                : `${limitLabel} 플랜은 학생 최대 ${limit}명까지만 활성화할 수 있습니다. 상위 플랜으로 업그레이드해주세요.`);
        }
    }
    // ── 9단계: 복구 처리 (is_active: true + withdrawal_date: null) ──
    await studentRef.update({
        is_active: true,
        withdrawal_date: null,
    });
    logger.info('[restoreStudent] 학생 복구 완료', {
        callerUid,
        studentUid,
        academyId: caller.academy_id,
    });
    return { success: true };
});
//# sourceMappingURL=restoreStudent.js.map