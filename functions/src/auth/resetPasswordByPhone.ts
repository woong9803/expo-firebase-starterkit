import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { checkRateLimit, getClientIp } from '../lib/rateLimit';
import { hashForLog } from '../lib/hash';

/**
 * 휴대폰 OTP 기반 비밀번호 재설정 (onCall)
 *
 * 보안 흐름:
 *  1. 클라이언트가 등록된 번호로 휴대폰 OTP 인증 완료 → phone-auth 로 sign-in 된 상태
 *  2. 이 상태에서 이 함수를 호출 → request.auth.token.phone_number 와 입력 phoneNumber 매칭
 *  3. phone_lookups/{phoneNumber} 로 진짜 uid(이메일/소셜 가입자) 조회
 *  4. Admin SDK 로 그 uid 의 비밀번호 갱신
 *  5. phone OTP sign-in 으로 생성된 임시 phone-only user 정리
 *
 * 클라이언트의 updatePassword() 는 phone-auth user 의 비번만 바꿀 수 있고
 * 진짜 이메일/비번 user 의 비번은 못 바꾸기 때문에 서버에서 Admin SDK 로만 가능.
 *
 * Rate Limit:
 *  - 번호 기준 10분 / 5회 (정상 사용자 실수 보호)
 *  - IP 기준 10분 / 20회 (자동화 공격 방어)
 */

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_PHONE = 5;
const MAX_PER_IP = 20;

export const resetPasswordByPhone = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        '본인 확인이 필요해요. 휴대폰 인증을 먼저 진행해주세요.'
      );
    }

    const authUid = request.auth.uid;
    const tokenPhone = (request.auth.token as { phone_number?: string })
      .phone_number;

    // ── 입력 검증 ─────────────────────────────────
    const { phoneNumber, newPassword } = request.data as {
      phoneNumber?: unknown;
      newPassword?: unknown;
    };

    if (typeof phoneNumber !== 'string' || typeof newPassword !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'phoneNumber 와 newPassword 가 필요해요.'
      );
    }

    // E.164 형식의 한국 번호만 허용
    if (!/^\+82\d{9,10}$/.test(phoneNumber)) {
      throw new HttpsError(
        'invalid-argument',
        '올바른 휴대폰 번호 형식이 아니에요.'
      );
    }

    if (newPassword.length < 8) {
      throw new HttpsError(
        'invalid-argument',
        '비밀번호는 8자 이상이어야 해요.'
      );
    }

    // ── 토큰 phone 과 입력 phone 일치 검증 ──────────
    // 다른 번호로 인증한 뒤 임의 번호로 요청을 위조하는 시도 차단
    if (!tokenPhone || tokenPhone !== phoneNumber) {
      logger.warn('[resetPasswordByPhone] 토큰 phone 불일치', {
        authUidHash: hashForLog(authUid),
        tokenPhoneHash: tokenPhone ? hashForLog(tokenPhone) : null,
        inputPhoneHash: hashForLog(phoneNumber),
      });
      throw new HttpsError(
        'permission-denied',
        '인증된 휴대폰 번호와 달라요. 처음부터 다시 시도해주세요.'
      );
    }

    // ── Rate Limit (번호 + IP 이중) ───────────────
    const clientIp = getClientIp(request.rawRequest);

    await checkRateLimit({
      key: `phone_${phoneNumber}_resetPw`,
      windowMs: RATE_WINDOW_MS,
      maxAttempts: MAX_PER_PHONE,
      label: 'resetPasswordByPhone.phone',
    });
    if (clientIp !== 'unknown') {
      await checkRateLimit({
        key: `ip_${clientIp}_resetPw`,
        windowMs: RATE_WINDOW_MS,
        maxAttempts: MAX_PER_IP,
        label: 'resetPasswordByPhone.ip',
      });
    }

    const db = admin.firestore();

    // ── phone_lookups 에서 진짜 uid 조회 ──────────
    const lookupSnap = await db
      .collection('phone_lookups')
      .doc(phoneNumber)
      .get();

    if (!lookupSnap.exists) {
      throw new HttpsError(
        'not-found',
        '해당 번호로 가입된 계정을 찾을 수 없어요.'
      );
    }

    const realUid = lookupSnap.data()?.uid as string | undefined;
    if (!realUid) {
      throw new HttpsError(
        'not-found',
        '계정 정보가 손상됐어요. 고객센터로 문의해주세요.'
      );
    }

    // ── 진짜 user 문서 상태 검증 ───────────────────
    const userSnap = await db.collection('users').doc(realUid).get();
    if (!userSnap.exists) {
      throw new HttpsError(
        'not-found',
        '계정 정보를 찾을 수 없어요. 고객센터로 문의해주세요.'
      );
    }
    const userData = userSnap.data()!;
    if (userData.deleted_at) {
      throw new HttpsError(
        'failed-precondition',
        '탈퇴된 계정이에요. 새로 가입해주세요.'
      );
    }

    // ── Firebase Auth 비밀번호 갱신 ───────────────
    try {
      await admin.auth().updateUser(realUid, { password: newPassword });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      logger.error('[resetPasswordByPhone] updateUser 실패', {
        uidHash: hashForLog(realUid),
        code: err.code,
      });
      if (err.code === 'auth/weak-password') {
        throw new HttpsError(
          'invalid-argument',
          '비밀번호가 너무 약해요. 더 복잡한 비밀번호를 사용해주세요.'
        );
      }
      throw new HttpsError(
        'internal',
        '비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요.'
      );
    }

    // ── 임시 phone-only user 정리 ───────────────────
    // phone OTP sign-in 으로 새로 생성된 phone-auth user 는 진짜 user(realUid)와 별개.
    // 그대로 두면 Firebase Auth 에 빈 user 가 쌓이므로 정리.
    // (authUid === realUid 인 경우는 user 가 phone-auth 만으로 가입한 경우 — 정리 불필요)
    if (authUid !== realUid) {
      try {
        await admin.auth().deleteUser(authUid);
        logger.info('[resetPasswordByPhone] 임시 phone user 정리 완료', {
          tempUidHash: hashForLog(authUid),
          realUidHash: hashForLog(realUid),
        });
      } catch (e) {
        // 정리 실패해도 비번 갱신 자체는 성공 — 로그만 남기고 진행
        logger.warn('[resetPasswordByPhone] 임시 phone user 정리 실패(무시)', {
          tempUidHash: hashForLog(authUid),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.info('[resetPasswordByPhone] 비밀번호 재설정 완료', {
      uidHash: hashForLog(realUid),
    });

    return { success: true };
  }
);
