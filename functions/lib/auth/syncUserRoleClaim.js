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
exports.refreshMyClaim = exports.syncUserRoleClaim = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
/**
 * Firestore users/{uid} 문서가 생성·변경될 때
 * role 필드를 Firebase Auth Custom Claim으로 자동 동기화.
 *
 * Custom Claim이 있어야 Cloud Function에서 권한 체크 가능.
 */
exports.syncUserRoleClaim = (0, firestore_1.onDocumentWritten)('users/{uid}', async (event) => {
    var _a, _b;
    const uid = event.params.uid;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    // 문서가 삭제된 경우 클레임 제거
    if (!(after === null || after === void 0 ? void 0 : after.exists)) {
        await admin.auth().setCustomUserClaims(uid, {});
        return;
    }
    const data = after.data();
    if (!(data === null || data === void 0 ? void 0 : data.role))
        return;
    // role + academy_id를 Custom Claim으로 설정
    await admin.auth().setCustomUserClaims(uid, {
        role: data.role,
        academy_id: (_b = data.academy_id) !== null && _b !== void 0 ? _b : null,
    });
});
/**
 * 현재 로그인한 사용자가 Firestore의 최신 role을 Custom Claim에 반영 요청.
 * 기존에 가입한 유저(Custom Claim 미설정 상태)가 호출하면 즉시 동기화됨.
 * 클라이언트는 응답 후 getIdToken(true)로 토큰 갱신 필요.
 */
exports.refreshMyClaim = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다');
    }
    const uid = request.auth.uid;
    const snap = await admin.firestore().collection('users').doc(uid).get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', '사용자 정보를 찾을 수 없습니다');
    }
    const data = snap.data();
    if (!data.role) {
        throw new https_1.HttpsError('failed-precondition', 'role이 설정되지 않은 계정입니다');
    }
    await admin.auth().setCustomUserClaims(uid, {
        role: data.role,
        academy_id: (_a = data.academy_id) !== null && _a !== void 0 ? _a : null,
    });
    return { role: data.role };
});
//# sourceMappingURL=syncUserRoleClaim.js.map