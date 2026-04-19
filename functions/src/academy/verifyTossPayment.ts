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
