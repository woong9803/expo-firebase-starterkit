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
exports.validateOnboardingCode = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const rateLimit_1 = require("../lib/rateLimit");
const hash_1 = require("../lib/hash");
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분
const MAX_PER_UID = 5;
const MAX_PER_IP = 20;
exports.validateOnboardingCode = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다');
    }
    const uid = request.auth.uid;
    // ── 입력 검증 ─────────────────────────────────
    const { code, type } = request.data;
    if (typeof code !== 'string' || typeof type !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'code와 type이 필요합니다');
    }
    // 6자리 대문자 영숫자만 허용 — 형식 다르면 조회 자체 불필요
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        throw new https_1.HttpsError('invalid-argument', '코드 형식이 올바르지 않습니다');
    }
    if (type !== 'academy' && type !== 'invite' && type !== 'link') {
        throw new https_1.HttpsError('invalid-argument', '유효하지 않은 코드 타입입니다');
    }
    const codeType = type;
    const clientIp = (0, rateLimit_1.getClientIp)(request.rawRequest);
    // ── Rate Limit (uid + IP 이중) ────────────────
    // uid 기반 — 정상 사용자 실수 보호 (10분/5회)
    await (0, rateLimit_1.checkRateLimit)({
        key: `uid_${uid}_${codeType}`,
        windowMs: RATE_WINDOW_MS,
        maxAttempts: MAX_PER_UID,
        label: 'validateOnboardingCode.uid',
    });
    // IP 기반 — uid 로테이션 공격 대응 (10분/20회)
    if (clientIp !== 'unknown') {
        await (0, rateLimit_1.checkRateLimit)({
            key: `ip_${clientIp}_${codeType}`,
            windowMs: RATE_WINDOW_MS,
            maxAttempts: MAX_PER_IP,
            label: 'validateOnboardingCode.ip',
        });
    }
    // ── 코드별 조회 ────────────────────────────────
    const db = admin.firestore();
    if (codeType === 'academy') {
        const snap = await db
            .collection('academies')
            .where('academy_code', '==', code)
            .limit(1)
            .get();
        if (snap.empty) {
            // code 는 평문 기록 금지 — 해시만 남겨 운영 디버깅은 되되 원본 노출 차단
            logger.info('[validateOnboardingCode] 학원코드 없음', {
                uidHash: (0, hash_1.hashForLog)(uid),
                codeHash: (0, hash_1.hashForLog)(code),
            });
            throw new https_1.HttpsError('not-found', '존재하지 않는 학원코드입니다');
        }
        const doc = snap.docs[0];
        const academy = doc.data();
        // 선생님 가입 차단 — security.md 정책:
        //  - pending: "선생님 초대 불가" (승인 완료 후에만 합류 허용)
        //  - rejected/그 외: 비활성 학원 → 가입 자체 차단
        if (academy.status === 'pending') {
            logger.info('[validateOnboardingCode] pending 학원 선생님 가입 차단', {
                uidHash: (0, hash_1.hashForLog)(uid),
                academyIdHash: (0, hash_1.hashForLog)(doc.id),
            });
            throw new https_1.HttpsError('failed-precondition', '아직 승인되지 않은 학원이에요. 원장님의 학원 승인 완료 후 가입할 수 있어요.');
        }
        if (academy.status !== 'active') {
            logger.info('[validateOnboardingCode] 비활성 학원 가입 차단', {
                uidHash: (0, hash_1.hashForLog)(uid),
                academyIdHash: (0, hash_1.hashForLog)(doc.id),
                status: academy.status,
            });
            throw new https_1.HttpsError('failed-precondition', '운영이 중단된 학원이에요. 원장님께 문의해주세요.');
        }
        return {
            academy_id: doc.id,
            name: academy.name,
            status: academy.status,
        };
    }
    if (codeType === 'invite') {
        const snap = await db
            .collection('classes')
            .where('invite_code', '==', code)
            .limit(1)
            .get();
        if (snap.empty) {
            logger.info('[validateOnboardingCode] 반코드 없음', {
                uidHash: (0, hash_1.hashForLog)(uid),
                codeHash: (0, hash_1.hashForLog)(code),
            });
            throw new https_1.HttpsError('not-found', '존재하지 않는 반 코드입니다');
        }
        const doc = snap.docs[0];
        const cls = doc.data();
        // 학원 상태 체크 — rejected/비활성 학원의 반 코드는 학생 자가 가입 차단
        // pending 은 허용 (승인 전 학생 등록은 createStudentAccount 의 3명 한도로 별도 통제)
        if (cls.academy_id) {
            const academySnap = await db.collection('academies').doc(cls.academy_id).get();
            const academyStatus = (_a = academySnap.data()) === null || _a === void 0 ? void 0 : _a.status;
            if (academyStatus !== 'active' && academyStatus !== 'pending') {
                logger.info('[validateOnboardingCode] 비활성 학원 반코드 차단', {
                    uidHash: (0, hash_1.hashForLog)(uid),
                    academyIdHash: (0, hash_1.hashForLog)(cls.academy_id),
                    status: academyStatus,
                });
                throw new https_1.HttpsError('failed-precondition', '운영이 중단된 학원의 반이에요. 선생님께 문의해주세요.');
            }
        }
        return {
            class_id: doc.id,
            academy_id: cls.academy_id,
            name: cls.name,
        };
    }
    // link — 자녀 연동코드
    const snap = await db
        .collection('users')
        .where('link_code', '==', code)
        .where('role', '==', 'student')
        .limit(1)
        .get();
    if (snap.empty) {
        logger.info('[validateOnboardingCode] 연동코드 없음', {
            uidHash: (0, hash_1.hashForLog)(uid),
            codeHash: (0, hash_1.hashForLog)(code),
        });
        throw new https_1.HttpsError('not-found', '존재하지 않는 연동코드입니다');
    }
    const doc = snap.docs[0];
    const student = doc.data();
    // 탈퇴 처리된 학생은 연동 차단
    if (student.deleted_at) {
        throw new https_1.HttpsError('not-found', '탈퇴한 계정입니다');
    }
    // 학원 상태 체크 — rejected/비활성 학원 학생의 연동 차단
    if (student.academy_id) {
        const academySnap = await db.collection('academies').doc(student.academy_id).get();
        const academyStatus = (_b = academySnap.data()) === null || _b === void 0 ? void 0 : _b.status;
        if (academyStatus !== 'active' && academyStatus !== 'pending') {
            logger.info('[validateOnboardingCode] 비활성 학원 연동코드 차단', {
                uidHash: (0, hash_1.hashForLog)(uid),
                academyIdHash: (0, hash_1.hashForLog)(student.academy_id),
                status: academyStatus,
            });
            throw new https_1.HttpsError('failed-precondition', '운영이 중단된 학원이에요. 자녀의 학원으로 문의해주세요.');
        }
    }
    return {
        student_uid: doc.id,
        name: student.name,
        academy_id: student.academy_id,
    };
});
//# sourceMappingURL=validateOnboardingCode.js.map