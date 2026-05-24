import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * phone_lookups 컬렉션 백필
 *
 * 기존 users 컬렉션의 phone_number 필드를 일괄 읽어
 * phone_lookups/{phone} 문서로 매핑을 생성한다.
 *
 * 호출 권한: admin 역할만
 * 멱등성: 같은 번호가 이미 있으면 덮어쓰지 않고 skip
 *         (먼저 가입된 사람이 우선 — first-write-wins)
 *
 * 운영 시나리오:
 *   - 1회 수동 호출로 기존 데이터 마이그레이션
 *   - 충돌(같은 번호 다른 uid) 발생 시 skip 카운트로 보고됨 → 수동 확인
 */
// region: 전역 옵션(asia-northeast3) 상속
export const backfillPhoneLookups = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const db = admin.firestore();

    // 호출자 admin 권한 확인
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'admin 만 실행 가능합니다.');
    }

    // phone_number 가 있는 모든 user 문서 조회
    const usersSnap = await db
      .collection('users')
      .where('phone_number', '!=', '')
      .get();

    let created = 0;
    let skippedExisting = 0; // 이미 매핑 있음 (먼저 가입한 다른 uid)
    let skippedInvalid = 0;  // phone_number 형식 오류
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const phone = userDoc.data().phone_number as string | undefined;
      if (!phone || typeof phone !== 'string') {
        skippedInvalid++;
        continue;
      }

      // E.164 형식 정규화 (한국 번호 한정)
      let formatted = phone.trim();
      if (!formatted.startsWith('+')) {
        formatted = `+82${formatted.replace(/^0/, '').replace(/-/g, '')}`;
      }

      // 이미 매핑이 있으면 skip — first-write-wins
      const lookupRef = db.collection('phone_lookups').doc(formatted);
      const existing = await lookupRef.get();
      if (existing.exists) {
        skippedExisting++;
        continue;
      }

      batch.set(lookupRef, {
        uid,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        backfilled: true,
      });
      batchCount++;
      created++;

      // 배치는 500 건 제한 — 끊어서 commit
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return {
      total: usersSnap.size,
      created,
      skippedExisting,
      skippedInvalid,
    };
  }
);
