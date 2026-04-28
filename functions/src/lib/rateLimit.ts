import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { hashForLog } from './hash';

/**
 * 공용 Rate Limit 헬퍼
 *
 * Firestore `rateLimits/{key}` 문서 기반 카운터.
 * 윈도우 방식:
 *  - 첫 시도: window_start = now, attempts = 1
 *  - 윈도우 내 재시도: attempts++
 *  - 윈도우 만료 시: 카운터 리셋
 *  - attempts >= maxAttempts: 차단 + 남은 대기 시간 반환
 *
 * 사용처:
 *  - validateOnboardingCode (uid/IP 기반 코드 brute force 방어)
 *  - createStudentAccount (staff 계정 대량 생성 방어)
 *  - kakaoLogin (IP 기반 로그인 시도 제한)
 *  - verifyTossPayment (uid 기반 결제 재시도 제한)
 */

export interface RateLimitOptions {
  /** 카운터 식별자 — uid/IP·기능명을 조합해 고유하게 구성 */
  key: string;
  /** 윈도우 길이 (밀리초). 이 시간 지나면 카운터 자동 리셋 */
  windowMs: number;
  /** 윈도우 내 허용 최대 시도 횟수 */
  maxAttempts: number;
  /** 차단 시 클라이언트에 반환할 메시지 (기본: 한국어 안내) */
  message?: string;
  /** 차단 로그용 기능 라벨 (모니터링에서 기능별 차단 빈도 추적) */
  label?: string;
}

export async function checkRateLimit(opts: RateLimitOptions): Promise<void> {
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

    const data = snap.data() as {
      attempts: number;
      window_start: admin.firestore.Timestamp;
    };
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
        label: label ?? 'unknown',
        keyHash: hashForLog(key),
        attempts: data.attempts,
        retryAfterSec,
      });
      throw new HttpsError(
        'resource-exhausted',
        message ?? `너무 많은 시도입니다. ${retryAfterSec}초 후 다시 시도해주세요.`
      );
    }

    tx.update(ref, {
      attempts: data.attempts + 1,
      last_attempt: now,
    });
  });
}

/**
 * onCall 요청에서 클라이언트 IP 추출
 * - request.rawRequest.ip (Express가 파싱한 값)
 * - x-forwarded-for (프록시 경유 시 원본 IP)
 * - 둘 다 없으면 'unknown' (IP 기반 제한 생략 신호)
 */
export function getClientIp(rawRequest: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = rawRequest.headers?.['x-forwarded-for'];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return rawRequest.ip ?? forwardedStr ?? 'unknown';
}
