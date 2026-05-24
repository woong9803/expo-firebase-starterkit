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
exports.anonymizeTeacherData = anonymizeTeacherData;
const logger = __importStar(require("firebase-functions/logger"));
const hash_1 = require("../lib/hash");
/**
 * 탈퇴한 선생님의 작성 데이터를 익명 처리한다
 *
 * 대상:
 * - homeworks.created_by === uid → 'deleted_user'로 교체
 * - notices.created_by   === uid → 'deleted_user'로 교체
 *
 * batch를 사용하여 다중 쓰기를 원자적으로 처리
 * 500개 제한 초과 시 청크로 나눠 처리
 */
async function anonymizeTeacherData(db, uid) {
    await anonymizeCollection(db, 'homeworks', uid);
    await anonymizeCollection(db, 'notices', uid);
    logger.info('[anonymizeTeacherData] 선생님 데이터 익명화 완료', {
        uidHash: (0, hash_1.hashForLog)(uid),
    });
}
/**
 * 특정 컬렉션에서 created_by === uid 인 문서를 'deleted_user'로 일괄 업데이트
 */
async function anonymizeCollection(db, collectionName, uid) {
    const snap = await db
        .collection(collectionName)
        .where('created_by', '==', uid)
        .get();
    if (snap.empty)
        return;
    // batch 500개 제한 대응 — 청크로 나눠 처리
    const BATCH_SIZE = 500;
    const chunks = [];
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        chunks.push(snap.docs.slice(i, i + BATCH_SIZE));
    }
    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((doc) => {
            batch.update(doc.ref, { created_by: 'deleted_user' });
        });
        await batch.commit();
    }
}
//# sourceMappingURL=anonymizeTeacherData.js.map