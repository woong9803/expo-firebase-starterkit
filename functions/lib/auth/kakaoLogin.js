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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kakaoLogin = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const axios_1 = __importDefault(require("axios"));
const rateLimit_1 = require("../lib/rateLimit");
const hash_1 = require("../lib/hash");
/**
 * 카카오 로그인 — 액세스 토큰을 Firebase Custom Token으로 교환
 *
 * 클라이언트 흐름:
 * 1. react-native-kakao-login으로 카카오 accessToken 획득
 * 2. 이 함수에 accessToken 전달
 * 3. 반환된 customToken으로 Firebase signInWithCustomToken() 호출
 *
 * 보안 고려사항:
 * - 이 함수는 **로그인 전** 호출되므로 request.auth 검증은 불가
 * - 대신 카카오 토큰의 앱 ID를 우리 앱 ID와 대조해 타 앱 토큰 재사용을 차단
 * - KAKAO_ADMIN_KEY, KAKAO_APP_ID는 절대 클라이언트에 포함 금지 (Functions .env 전용)
 */
exports.kakaoLogin = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const { accessToken } = request.data;
    // ── 1단계: 입력 검증 ─────────────────────────────
    // 타입과 길이를 검증해 잘못된 입력을 조기 차단
    if (typeof accessToken !== 'string' ||
        accessToken.length < 10 ||
        accessToken.length > 2048) {
        throw new https_1.HttpsError('invalid-argument', 'accessToken이 유효하지 않습니다');
    }
    // ── Rate Limit (IP 기반) ──────────────────────
    // P2-7 (2026-04-23): 로그인 전 호출이라 uid 없음 → IP 기반만 적용
    //   10분 윈도우에 30회 — 정상 사용자 로그인 재시도(실패 토큰/네트워크 재시도)에
    //   여유를 주되 자동화 토큰 대량 시도는 차단
    const clientIp = (0, rateLimit_1.getClientIp)(request.rawRequest);
    if (clientIp !== 'unknown') {
        await (0, rateLimit_1.checkRateLimit)({
            key: `kakaoLogin_ip_${clientIp}`,
            windowMs: 10 * 60 * 1000,
            maxAttempts: 30,
            label: 'kakaoLogin.ip',
        });
    }
    // 서버 설정 확인 — 카카오 앱 ID가 없으면 검증 불가하므로 즉시 실패
    const expectedAppId = process.env.KAKAO_APP_ID;
    if (!expectedAppId) {
        logger.error('[kakaoLogin] KAKAO_APP_ID 환경변수 누락 — 배포 설정 확인 필요');
        throw new https_1.HttpsError('failed-precondition', '서버 설정 오류');
    }
    try {
        // ── 2단계: 토큰 정보 조회 (앱 ID·만료 검증) ─────
        // access_token_info 엔드포인트로 이 토큰이 우리 앱에서 발급됐는지 확인
        const tokenInfoRes = await axios_1.default.get('https://kapi.kakao.com/v1/user/access_token_info', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000,
        });
        const tokenInfo = tokenInfoRes.data;
        // 타 앱에서 발급된 토큰 차단 — 토큰 재사용·계정 탈취 공격의 핵심 방어선
        if (String(tokenInfo.app_id) !== String(expectedAppId)) {
            logger.warn('[kakaoLogin] 타 앱 토큰 차단', {
                expected: expectedAppId,
                actual: tokenInfo.app_id,
            });
            throw new https_1.HttpsError('permission-denied', '다른 앱에서 발급된 토큰입니다');
        }
        // 만료 임박 토큰 거부 — 서버 처리 중 만료되면 후속 API 실패
        if (tokenInfo.expires_in < 60) {
            throw new https_1.HttpsError('unauthenticated', '토큰이 곧 만료됩니다. 다시 로그인해주세요');
        }
        // ── 3단계: 사용자 정보 조회 ──────────────────────
        const kakaoRes = await axios_1.default.get('https://kapi.kakao.com/v2/user/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            },
            timeout: 5000,
        });
        const kakaoUser = kakaoRes.data;
        // token_info의 id와 user_info의 id 일치 확인 — 정상 흐름에선 항상 같음
        // 불일치 시 응답 변조 가능성이 있으므로 거부
        if (tokenInfo.id !== kakaoUser.id) {
            logger.error('[kakaoLogin] 토큰/사용자 ID 불일치', {
                tokenIdHash: (0, hash_1.hashForLog)(String(tokenInfo.id)),
                userIdHash: (0, hash_1.hashForLog)(String(kakaoUser.id)),
            });
            throw new https_1.HttpsError('unauthenticated', '토큰 정보가 일치하지 않습니다');
        }
        // ── 4단계: Firebase Custom Token 발급 ──────────
        // 카카오 uid를 Firebase uid로 사용 (카카오 uid는 숫자 → 문자열 변환)
        const uid = `kakao:${kakaoUser.id}`;
        // 카카오 사용자 프로필 (닉네임·이메일) — 클라이언트로 그대로 전달해
        // Firestore users 문서 생성 시 사용. signInWithCustomToken 은 displayName/email 을
        // 자동으로 채우지 않으므로 우리가 별도로 넘겨야 한다.
        const kakaoName = (_c = (_b = (_a = kakaoUser.kakao_account) === null || _a === void 0 ? void 0 : _a.profile) === null || _b === void 0 ? void 0 : _b.nickname) !== null && _c !== void 0 ? _c : '';
        const kakaoEmail = (_e = (_d = kakaoUser.kakao_account) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '';
        const customToken = await admin.auth().createCustomToken(uid, {
            provider: 'kakao',
            kakaoId: kakaoUser.id,
        });
        logger.info('[kakaoLogin] 발급 성공', { uidHash: (0, hash_1.hashForLog)(uid) });
        return {
            customToken,
            kakaoUser: { name: kakaoName, email: kakaoEmail },
        };
    }
    catch (error) {
        // 이미 HttpsError면 그대로 전달 (검증 실패 메시지 보존)
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const err = error;
        // 구조화 로깅 — 공격 시도 추적 가능, 단 accessToken은 절대 기록하지 않음
        logger.error('[kakaoLogin] 카카오 API 오류', {
            status: (_f = err.response) === null || _f === void 0 ? void 0 : _f.status,
            code: err.code,
            message: err.message,
        });
        if (((_g = err.response) === null || _g === void 0 ? void 0 : _g.status) === 401) {
            throw new https_1.HttpsError('unauthenticated', '유효하지 않은 카카오 토큰입니다');
        }
        throw new https_1.HttpsError('internal', '카카오 로그인 처리 중 오류가 발생했습니다');
    }
});
//# sourceMappingURL=kakaoLogin.js.map