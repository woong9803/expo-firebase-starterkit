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
exports.cleanupDeletedUsers = void 0;
exports.purgeDeletedUser = purgeDeletedUser;
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const hash_1 = require("../lib/hash");
/**
 * 단일 유저 완전 삭제 로직 (스케줄러·즉시 삭제 공용)
 *
 * 처리 순서:
 * 1. Firebase Auth 계정 삭제 (이미 없으면 무시)
 * 2. 학생인 경우 — homeworks/{hwId}/submissions/{uid} 서브컬렉션 삭제
 * 3. Storage 파일 삭제 (homeworks/{uid}/ 경로)
 * 4. Firestore users/{uid} 문서 삭제
 *
 * PIPA 삭제권 — deleteUser(immediate: true) 흐름에서 30일 대기 없이 즉시 호출됨
 */
async function purgeDeletedUser(db, uid, role) {
    // 1. Firebase Auth 계정 삭제 — 이미 삭제된 경우(auth/user-not-found)는 무시
    try {
        await admin.auth().deleteUser(uid);
    }
    catch (authErr) {
        if (authErr.code !== 'auth/user-not-found') {
            throw authErr;
        }
    }
    // 2. 학생 — 제출 이력 서브컬렉션 삭제
    if (role === 'student') {
        await deleteStudentSubmissions(db, uid);
    }
    // 3. Storage 파일 삭제 (개인정보 파기)
    await deleteUserStorageFiles(uid);
    // 4. Firestore users/{uid} 문서 삭제
    await db.collection('users').doc(uid).delete();
    logger.info('[purgeDeletedUser] 유저 완전 삭제 완료', {
        uidHash: (0, hash_1.hashForLog)(uid),
        role,
    });
}
/**
 * 탈퇴 유저 완전 삭제 스케줄러 (매일 03:00 KST 실행)
 *
 * deleted_at 기준 30일 초과된 유저를 완전히 삭제한다:
 * 1. Firebase Auth 계정 삭제
 * 2. Firestore users/{uid} 문서 삭제
 * 3. 학생인 경우 — homeworks/submissions/{uid} 서브컬렉션 삭제
 * 4. Firebase Storage — 유저 관련 파일 삭제 (homeworks/{uid}/ 경로)
 *
 * 멱등성 보장: deleted_at 필드가 있는 문서만 처리
 *             이미 Auth에서 삭제된 계정은 오류 무시하고 Firestore만 정리
 */
exports.cleanupDeletedUsers = (0, scheduler_1.onSchedule)({ schedule: '0 18 * * *', timeZone: 'UTC' }, // 매일 18:00 UTC = 03:00 KST
async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    // deleted_at 기준 30일 초과된 유저 조회
    const thirtyDaysAgo = new Date(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoTs = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);
    const deletedUsersSnap = await db
        .collection('users')
        .where('deleted_at', '<=', thirtyDaysAgoTs)
        .get();
    if (deletedUsersSnap.empty) {
        logger.info('[cleanupDeletedUsers] 삭제 대상 유저 없음');
        return;
    }
    logger.info('[cleanupDeletedUsers] 완전 삭제 시작', { count: deletedUsersSnap.size });
    for (const userDoc of deletedUsersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        try {
            await purgeDeletedUser(db, uid, userData.role);
        }
        catch (e) {
            // 개별 유저 삭제 실패 시 다음 유저로 계속 진행 (전체 실패 방지)
            logger.error('[cleanupDeletedUsers] 유저 삭제 실패', {
                uidHash: (0, hash_1.hashForLog)(uid),
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
});
/**
 * Firebase Storage에서 유저 관련 파일을 삭제한다
 * 숙제 사진 경로: homeworks/{uid}/ 하위 전체
 * 파일이 없거나 접근 실패 시 오류를 무시하고 계속 진행 (멱등성)
 */
async function deleteUserStorageFiles(uid) {
    try {
        const bucket = admin.storage().bucket();
        // homeworks/{uid}/ 경로의 모든 파일 삭제
        const [files] = await bucket.getFiles({ prefix: `homeworks/${uid}/` });
        if (files.length === 0)
            return;
        await Promise.all(files.map((file) => file.delete().catch(() => { })));
        logger.info('[cleanupDeletedUsers] Storage 파일 삭제 완료', {
            uidHash: (0, hash_1.hashForLog)(uid),
            count: files.length,
        });
    }
    catch (e) {
        // Storage 삭제 실패는 치명적이지 않음 — 로깅 후 계속 진행
        logger.warn('[cleanupDeletedUsers] Storage 파일 삭제 실패', {
            uidHash: (0, hash_1.hashForLog)(uid),
            error: e instanceof Error ? e.message : String(e),
        });
    }
}
/**
 * 학생 탈퇴 시 본인이 제출한 모든 숙제 제출물 서브컬렉션을 삭제한다
 * homeworks/{hwId}/submissions/{studentUid} 구조
 */
async function deleteStudentSubmissions(db, studentUid) {
    // 모든 숙제 문서를 조회한 뒤 해당 학생의 submission 서브컬렉션 삭제
    const hwSnap = await db.collection('homeworks').get();
    if (hwSnap.empty)
        return;
    // batch 인스턴스는 commit 후 재사용 불가 — 중간 커밋 시 새 인스턴스로 재할당
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;
    for (const hwDoc of hwSnap.docs) {
        const submissionRef = db
            .collection('homeworks')
            .doc(hwDoc.id)
            .collection('submissions')
            .doc(studentUid);
        const submissionSnap = await submissionRef.get();
        if (!submissionSnap.exists)
            continue;
        batch.delete(submissionRef);
        batchCount++;
        // batch 500개 제한 초과 시 중간 커밋 후 새 batch 인스턴스 할당
        // (커밋된 batch는 재사용 시 INVALID_ARGUMENT 발생)
        if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
}
//# sourceMappingURL=cleanupDeletedUsers.js.map