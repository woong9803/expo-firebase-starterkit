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
exports.deleteUser = void 0;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const https_1 = require("firebase-functions/v2/https");
const anonymizeTeacherData_1 = require("./anonymizeTeacherData");
const cleanupDeletedUsers_1 = require("./cleanupDeletedUsers");
const hash_1 = require("../lib/hash");
/**
 * 사용자 탈퇴 처리 (onCall)
 *
 * 요청 데이터:
 * - immediate?: boolean — true면 즉시 완전 삭제 (PIPA 삭제권), 기본 false(30일 소프트 삭제)
 *
 * 처리 순서 (공통):
 * 1. 호출자 uid 검증
 * 2. 역할이 teacher인 경우 작성 숙제·공지를 익명 처리
 *
 * 분기:
 * - immediate=false (기본): users/{uid}.deleted_at 기록 → cleanupDeletedUsers 가 30일 후 완전 삭제
 * - immediate=true: 소프트 삭제 후 곧바로 purgeDeletedUser 실행 (Auth·Firestore·Storage 전부 삭제)
 *
 * 반환:
 * - { success: true, immediate: boolean }
 */
exports.deleteUser = (0, https_1.onCall)({ region: 'asia-northeast3' }, async (request) => {
    var _a;
    // 인증되지 않은 호출 차단
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', '로그인이 필요합니다');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    // immediate 파라미터 검증 — boolean 또는 undefined 만 허용
    const { immediate } = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    if (immediate !== undefined && typeof immediate !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'immediate 값은 boolean이어야 합니다');
    }
    const isImmediate = immediate === true;
    // 사용자 문서 조회 — 역할 확인용
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
        throw new https_1.HttpsError('not-found', '사용자 정보를 찾을 수 없어요');
    }
    const userData = userSnap.data();
    // 이미 탈퇴 처리된 경우 — immediate 면 purge 만 재시도, 아니면 중복 차단
    if (userData.deleted_at && !isImmediate) {
        throw new https_1.HttpsError('already-exists', '이미 탈퇴 처리된 계정이에요');
    }
    // 소프트 삭제 — deleted_at 기록 (immediate 면 직후 purge)
    // 이미 deleted_at 이 있는 경우(immediate 재시도)는 그대로 진행
    if (!userData.deleted_at) {
        await db.collection('users').doc(uid).update({
            deleted_at: admin.firestore.Timestamp.now(),
        });
    }
    // 선생님인 경우 작성 숙제·공지 익명 처리 (소프트·즉시 공통)
    if (userData.role === 'teacher') {
        try {
            await (0, anonymizeTeacherData_1.anonymizeTeacherData)(db, uid);
        }
        catch (e) {
            // 익명화 실패는 탈퇴 자체를 막지 않음 — 오류 로깅 후 계속 진행
            logger.error('[deleteUser] 선생님 데이터 익명화 실패', {
                uidHash: (0, hash_1.hashForLog)(uid),
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
    // PIPA 삭제권 — immediate 면 30일 대기 없이 즉시 완전 삭제
    if (isImmediate) {
        try {
            await (0, cleanupDeletedUsers_1.purgeDeletedUser)(db, uid, userData.role);
        }
        catch (e) {
            logger.error('[deleteUser] 즉시 완전 삭제 실패', {
                uidHash: (0, hash_1.hashForLog)(uid),
                error: e instanceof Error ? e.message : String(e),
            });
            // 즉시 삭제 실패 시 deleted_at 은 이미 기록됨 → 30일 후 스케줄러가 처리하므로 사용자에게는 별도 오류
            throw new https_1.HttpsError('internal', '즉시 삭제 처리 중 일부 오류가 발생했어요. 30일 이내에 자동으로 완전 삭제될 예정이에요.');
        }
        logger.info('[deleteUser] 사용자 즉시 완전 삭제 완료', {
            uidHash: (0, hash_1.hashForLog)(uid),
            role: userData.role,
        });
    }
    else {
        logger.info('[deleteUser] 사용자 소프트 삭제 완료', {
            uidHash: (0, hash_1.hashForLog)(uid),
            role: userData.role,
        });
    }
    return { success: true, immediate: isImmediate };
});
//# sourceMappingURL=deleteUser.js.map