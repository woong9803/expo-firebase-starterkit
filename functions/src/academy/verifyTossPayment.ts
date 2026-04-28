/**
 * functions/src/academy/verifyTossPayment.ts
 *
 * 토스페이먼츠 결제 검증 onCall 함수
 *
 * 흐름:
 * 1. 클라이언트가 결제 완료 후 paymentKey·orderId·amount 전달
 * 2. 토스페이먼츠 서버 API로 결제 검증 (시크릿 키는 functions/.env에만 저장)
 * 3. 검증 성공 시 academies.plan = 'pro', plan_expires_at 업데이트
 * 4. payments 컬렉션에 결제 내역 저장
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';
import { checkRateLimit } from '../lib/rateLimit';

// 결제 금액 → 플랜 등급 맵 (변조 방지용 서버 검증)
const VALID_AMOUNTS: Record<number, string> = {
  29000:  'starter',   // 30명 이하
  59000:  'standard',  // 30~100명
  99000:  'pro',       // 100명 이상 (무제한)
};

export const verifyTossPayment = onCall(async (request) => {
  // ── 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const uid = request.auth.uid;

  // ── Rate Limit (uid 기반) ─────────────────────
  // P2-7 (2026-04-23): 결제 시도 반복 호출 방어
  //   10분 윈도우에 10회 — 정상 재시도(네트워크 실패/결제 취소 후 재결제) 커버 +
  //   토스 API 남용·비용 폭주 차단. orderId 중복 방지(P2-6) 와 이중 방어선
  await checkRateLimit({
    key: `verifyTossPayment_uid_${uid}`,
    windowMs: 10 * 60 * 1000,
    maxAttempts: 10,
    label: 'verifyTossPayment.uid',
    message: '결제 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
  });

  const { paymentKey, orderId, amount } = request.data as {
    paymentKey: string;
    orderId: string;
    amount: number;
  };

  // ── 입력값 기본 검증
  if (!paymentKey || !orderId || !amount) {
    throw new HttpsError('invalid-argument', '결제 정보가 올바르지 않습니다.');
  }

  // ── 금액 서버 검증 (클라이언트 변조 차단)
  if (!VALID_AMOUNTS[amount]) {
    throw new HttpsError('invalid-argument', '허용되지 않은 결제 금액입니다.');
  }

  // ── 호출자의 academy_id 조회
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', '사용자 정보를 찾을 수 없습니다.');
  }
  const academyId = userDoc.data()?.academy_id as string | undefined;
  if (!academyId) {
    throw new HttpsError('failed-precondition', '학원 정보가 없습니다.');
  }

  // ── 토스페이먼츠 서버 API 결제 검증
  // 시크릿 키는 반드시 functions/.env 에서만 관리 (클라이언트 절대 금지)
  const secretKey = process.env.TOSS_SECRET_KEY ?? '';
  if (!secretKey) {
    console.error('[verifyTossPayment] TOSS_SECRET_KEY 환경변수 미설정');
    throw new HttpsError('internal', '결제 검증 설정 오류입니다.');
  }

  // Basic 인증: base64(secretKey:)
  const encoded = Buffer.from(`${secretKey}:`).toString('base64');

  let tossData: {
    paymentKey: string;
    orderId: string;
    totalAmount: number;
    status: string;
    approvedAt: string;
  };

  try {
    const response = await axios.post(
      'https://api.tosspayments.com/v1/payments/confirm',
      { paymentKey, orderId, amount },
      {
        headers: {
          Authorization: `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );
    tossData = response.data;
  } catch (e: unknown) {
    const msg = axios.isAxiosError(e)
      ? e.response?.data?.message ?? e.message
      : '알 수 없는 오류';
    console.error('[verifyTossPayment] 토스페이먼츠 검증 실패:', msg);
    throw new HttpsError('aborted', `결제 검증 실패: ${msg}`);
  }

  // ── 응답 유효성 재확인
  if (
    tossData.paymentKey !== paymentKey ||
    tossData.orderId    !== orderId    ||
    tossData.totalAmount !== amount
  ) {
    throw new HttpsError('aborted', '결제 정보가 일치하지 않습니다.');
  }

  // ── Firestore 트랜잭션: 플랜 업데이트 + 결제 내역 저장
  const now = admin.firestore.Timestamp.now();
  const planExpiresAt = new Date(now.toMillis() + 30 * 24 * 60 * 60 * 1000); // 30일 후

  await db.runTransaction(async (tx) => {
    // P2-6 (2026-04-23): orderId 중복 처리 방지
    //   토스 자체는 멱등이지만 재시도·경합 시 Firestore 쪽에 중복 payments 문서 +
    //   이중 plan_expires_at 연장이 발생할 수 있음. 트랜잭션 내 read 로 동시성 차단
    //   (쿼리 read 는 트랜잭션 내 write 이전에 배치해야 Firestore 제약 준수)
    const dupeSnap = await tx.get(
      db.collection('payments').where('order_id', '==', orderId).limit(1)
    );
    if (!dupeSnap.empty) {
      throw new HttpsError('already-exists', '이미 처리된 주문입니다.');
    }

    const academyRef = db.collection('academies').doc(academyId);
    const paymentRef = db.collection('payments').doc();

    const newPlan = VALID_AMOUNTS[amount];

    // 플랜 업데이트 (결제 금액에 따라 starter / standard / pro)
    tx.update(academyRef, {
      plan: newPlan,
      plan_expires_at: admin.firestore.Timestamp.fromDate(planExpiresAt),
    });

    // 결제 내역 저장
    tx.set(paymentRef, {
      academy_id: academyId,
      order_id: orderId,
      payment_key: paymentKey,
      amount,
      plan: newPlan,
      plan_months: 1,
      status: 'success',
      paid_at: now,
    });
  });

  console.log(`[verifyTossPayment] 학원 ${academyId} ${VALID_AMOUNTS[amount]} 플랜 활성화 완료`);
  return { success: true, planExpiresAt: planExpiresAt.toISOString() };
});
