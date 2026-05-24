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
exports.checkRateLimit = checkRateLimit;
exports.getClientIp = getClientIp;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const hash_1 = require("./hash");
async function checkRateLimit(opts) {
    const { key, windowMs, maxAttempts, message, label } = opts;
    const ref = admin.firestore().collection('rateLimits').doc(key);
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = admin.firestore.Timestamp.now();
        if (!snap.exists) {
            tx.set(ref, {
                attempts: 1,
                window_start: now,
                last_attempt: now,
            });
            return;
        }
        const data = snap.data();
        const elapsedMs = now.toMillis() - data.window_start.toMillis();
        // 윈도우 만료 → 카운터 리셋
        if (elapsedMs > windowMs) {
            tx.update(ref, {
                attempts: 1,
                window_start: now,
                last_attempt: now,
            });
            return;
        }
        // 한도 초과 → 차단
        if (data.attempts >= maxAttempts) {
            const retryAfterSec = Math.ceil((windowMs - elapsedMs) / 1000);
            // key 는 uid·IP 가 섞여 있어 PII 노출 위험 → 해시 기록으로 대체
            //   attempts/retryAfter 는 수치라 운영 지표로 유지
            logger.warn('[rateLimit] 차단', {
                label: label !== null && label !== void 0 ? label : 'unknown',
                keyHash: (0, hash_1.hashForLog)(key),
                attempts: data.attempts,
                retryAfterSec,
            });
            throw new https_1.HttpsError('resource-exhausted', message !== null && message !== void 0 ? message : `너무 많은 시도입니다. ${retryAfterSec}초 후 다시 시도해주세요.`);
        }
        tx.update(ref, {
            attempts: data.attempts + 1,
            last_attempt: now,
        });
    });
}
/**
 * onCall 요청에서 클라이언트 IP 추출
 *
 * Cloud Run/Firebase Functions 환경에서는 Google Front End(GFE)가
 * X-Forwarded-For 헤더의 **마지막** 값에 실제 클라이언트 IP를 추가한다.
 * 첫 번째 값은 클라이언트가 임의로 조작 가능하므로 신뢰하면 안 됨.
 *
 * 우선순위:
 *  1. X-Forwarded-For 의 마지막 항목 (GFE 가 추가한 신뢰 가능 IP)
 *  2. rawRequest.ip (Express 가 파싱한 값 — fallback)
 *  3. 'unknown' (IP 기반 제한 생략 신호)
 *
 * 잘못된 첫 번째 값을 쓰면 공격자가 매 요청마다 다른 IP 헤더를 주입해
 * IP 기반 rate limit 을 완전히 우회할 수 있다.
 */
function getClientIp(rawRequest) {
    var _a, _b;
    const forwarded = (_a = rawRequest.headers) === null || _a === void 0 ? void 0 : _a['x-forwarded-for'];
    const forwardedRaw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    const trustedIp = forwardedRaw === null || forwardedRaw === void 0 ? void 0 : forwardedRaw.split(',').map((s) => s.trim()).filter(Boolean).pop();
    return (_b = trustedIp !== null && trustedIp !== void 0 ? trustedIp : rawRequest.ip) !== null && _b !== void 0 ? _b : 'unknown';
}
//# sourceMappingURL=rateLimit.js.map