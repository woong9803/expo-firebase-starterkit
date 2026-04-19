/**
 * web/src/pages/SubscriptionManagement.tsx — 구독/결제 관리 페이지
 *
 * 흐름:
 * 1. 현재 플랜 표시 (free / trial / pro)
 * 2. 요금제 선택 → 토스페이먼츠 결제창 호출
 * 3. 결제 성공 콜백: URL 쿼리 파라미터(paymentKey·orderId·amount) → verifyTossPayment CF 호출
 * 4. 결제 내역 테이블 (payments 컬렉션)
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { app, db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';
import type { Payment } from '../../../types/index';

// ── 요금제 정보 (PRD 기준)
const PLANS = [
  {
    id: 'basic' as const,
    label: '베이직',
    limitLabel: '30명 이하',
    limitMin: 0,
    limitMax: 30,
    amount: 29000,
    popular: false,
    features: ['학생 30명 이하', '출결 관리', '숙제 관리', '공지사항'],
  },
  {
    id: 'standard' as const,
    label: '스탠다드',
    limitLabel: '30~100명',
    limitMin: 31,
    limitMax: 100,
    amount: 59000,
    popular: true,
    features: ['학생 100명 이하', '베이직 전체 기능', '공지 무제한', '엑셀 다운로드'],
  },
  {
    id: 'pro' as const,
    label: '프로',
    limitLabel: '100명 이상',
    limitMin: 101,
    limitMax: 9999,
    amount: 99000,
    popular: false,
    features: ['학생 수 제한 없음', '스탠다드 전체 기능', '선생님 계정 무제한', '전담 상담사'],
  },
] as const;

export default function SubscriptionManagement() {
  const { user, academy } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  // 선택된 플랜 (모달용)
  const [selectedPlanId, setSelectedPlanId] = useState<'basic' | 'standard' | 'pro'>('standard');
  const [showPayModal, setShowPayModal] = useState(false);

  // 결제 처리 상태
  const [payingAmount, setPayingAmount] = useState<number | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [verifyError, setVerifyError] = useState('');

  // ── URL 쿼리 파라미터 감지 (토스 결제 성공 콜백)
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (!paymentKey || !orderId || !amount) return;

    // 쿼리 파라미터 즉시 제거 (새로고침 중복 방지)
    setSearchParams({}, { replace: true });
    handleVerify(paymentKey, orderId, Number(amount));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 결제 검증 Cloud Function 호출
  const handleVerify = async (paymentKey: string, orderId: string, amount: number) => {
    setVerifyStatus('verifying');
    try {
      const functions = getFunctions(app, 'us-central1');
      const verify = httpsCallable(functions, 'verifyTossPayment');
      await verify({ paymentKey, orderId, amount });
      setVerifyStatus('success');
    } catch (e: unknown) {
      console.error('[SubscriptionManagement] 결제 검증 실패:', e);
      setVerifyError(e instanceof Error ? e.message : strings.common.error);
      setVerifyStatus('error');
    }
  };

  // ── 학생 수 조회
  useEffect(() => {
    if (!user?.academy_id) return;
    getDocs(
      query(
        collection(db, 'users'),
        where('academy_id', '==', user.academy_id),
        where('role', '==', 'student'),
        where('is_active', '==', true)
      )
    ).then((snap) => {
      setStudentCount(snap.docs.filter((d) => !d.data().deleted_at).length);
    });
  }, [user?.academy_id]);

  // ── 결제 내역 실시간 구독
  useEffect(() => {
    if (!user?.academy_id) return;

    const q = query(
      collection(db, 'payments'),
      where('academy_id', '==', user.academy_id),
      orderBy('paid_at', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)));
      setIsLoadingPayments(false);
    });

    return () => unsub();
  }, [user?.academy_id]);

  // ── 토스페이먼츠 결제 요청
  const handlePay = async (amount: number) => {
    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY as string;
    if (!clientKey || clientKey === 'test_ck_placeholder') {
      alert('토스페이먼츠 클라이언트 키를 .env.local에 설정해주세요.');
      return;
    }

    setPayingAmount(amount);
    setShowPayModal(false);
    try {
      const tossPayments = await loadTossPayments(clientKey);
      const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const planLabel = PLANS.find((p) => p.amount === amount)?.label ?? 'pro';

      await tossPayments.requestPayment('카드', {
        amount,
        orderId,
        orderName: `EduOnePass ${planLabel} 플랜 1개월`,
        customerName: academy?.owner_name ?? user?.name ?? '관리자',
        successUrl: `${window.location.origin}/subscription?paymentKey={PAYMENT_KEY}&orderId={ORDER_ID}&amount={AMOUNT}`,
        failUrl: `${window.location.origin}/subscription?payFail=1`,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'USER_CANCEL') {
        console.error('[SubscriptionManagement] 결제 요청 실패:', e);
      }
    } finally {
      setPayingAmount(null);
    }
  };

  const formatDate = (ts: Payment['paid_at'] | undefined) => {
    if (!ts) return '-';
    const d = ts.toDate();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const isPaid = academy?.plan && academy.plan !== 'free';
  const isPro = academy?.plan === 'pro';
  const currentPlanLabel =
    academy?.plan === 'pro' ? '프로' :
    academy?.plan === 'standard' ? '스탠다드' :
    academy?.plan === 'starter' ? '스타터' :
    academy?.plan === 'trial' ? '체험판' : 'Free';

  // 현재 플랜에 해당하는 PLANS 항목 (pro = 스탠다드로 매핑, free = 스타터)
  // 학생 수 기반으로 해당하는 플랜 자동 감지
  const currentPlan = studentCount != null
    ? PLANS.find((p) => studentCount >= p.limitMin && studentCount <= p.limitMax) ?? PLANS[0]
    : (isPro ? PLANS[1] : PLANS[0]);
  // progress bar용 학생 한도 (프로 티어는 실제 학생 수 기준)
  const planLimit = currentPlan.limitMax === 9999
    ? Math.max(studentCount ?? 100, 100)
    : currentPlan.limitMax;
  const usagePct = studentCount != null ? Math.min(100, Math.round((studentCount / planLimit) * 100)) : 0;

  const payFail = searchParams.get('payFail') === '1';
  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            구독 / 결제
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
            현재 플랜 정보와 결제 내역을 확인하세요
          </div>
        </div>
      </div>

      {/* ── 상태 배너 */}
      {verifyStatus === 'verifying' && (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <LoadingSpinner /> 결제 확인 중입니다. 잠시만 기다려주세요...
        </div>
      )}
      {verifyStatus === 'success' && (
        <div className="card" style={{ background: 'var(--success-soft)', borderColor: '#86EFAC', color: '#166534', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckIcon /> 결제가 완료되었습니다! 플랜이 활성화되었어요.
        </div>
      )}
      {verifyStatus === 'error' && (
        <div className="card" style={{ background: 'var(--danger-soft)', borderColor: '#FCA5A5', color: '#991B1B', fontSize: 13, fontWeight: 500 }}>
          결제 검증 중 오류가 발생했습니다: {verifyError}
        </div>
      )}
      {payFail && (
        <div className="card" style={{ background: 'var(--danger-soft)', borderColor: '#FCA5A5', color: '#991B1B', fontSize: 13, fontWeight: 500 }}>
          결제가 취소되었거나 실패했습니다.
        </div>
      )}

      {/* ── 현재 플랜 카드 (gradient) */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--accent-soft) 100%)',
        padding: '24px 28px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          {/* 좌측: 플랜 정보 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>현재 플랜</span>
              {isPaid && <span className="badge-success"><DotIcon /> 활성</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                {currentPlanLabel} 플랜
              </div>
              {currentPlan && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  ₩{currentPlan.amount.toLocaleString()} / 월
                </div>
              )}
            </div>
            {isPro && academy?.plan_expires_at && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10 }}>
                다음 결제일: <b style={{ color: 'var(--text-primary)' }}>{formatDate(academy.plan_expires_at as Payment['paid_at'])}</b>
              </div>
            )}
          </div>

          {/* 우측: 학생 수 progress + 버튼 */}
          <div style={{ minWidth: 260, flex: '0 1 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>학생 수</span>
              <span>
                <b style={{ color: 'var(--text-primary)' }}>{studentCount ?? '-'}</b>
                {' '}/ {currentPlan.limitMax === 9999 ? '무제한' : `${currentPlan.limitMax}명`}
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${usagePct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            {studentCount != null && currentPlan.limitMax !== 9999 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {currentPlan.limitMax - studentCount}명 더 등록 가능 · 한도의 {usagePct}% 사용 중
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-secondary btn-sm">결제 수단 변경</button>
              <button
                className="btn-primary btn-sm"
                onClick={() => { setSelectedPlanId('pro'); setShowPayModal(true); }}
              >
                플랜 업그레이드
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 요금제 선택 */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          요금제 선택
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {PLANS.map((plan) => {
            // 학생 수 기반 현재 플랜과 일치 여부
            const isCurrent = plan.id === currentPlan.id;
            const isSelected = selectedPlanId === plan.id;
            const isPaying = payingAmount === plan.amount;

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                style={{
                  background: 'var(--bg-surface)',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 12,
                  position: 'relative',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  overflow: 'visible',
                }}
              >
                {/* MOST POPULAR 리본 */}
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: -10, left: 22,
                    background: 'var(--accent)', color: 'white',
                    padding: '3px 10px', borderRadius: 4,
                    fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    MOST POPULAR
                  </div>
                )}

                <div style={{ padding: '24px 24px 20px' }}>
                  {/* 플랜명 + 현재 플랜 뱃지 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{plan.label}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                        학생 {plan.limitLabel}
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="badge-accent">현재 플랜</span>
                    )}
                  </div>

                  {/* 가격 */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 16 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                      ₩{plan.amount.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>/ 월</span>
                  </div>

                  {/* features */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    {plan.features.map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <CheckSmallIcon />
                        <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* 버튼 */}
                  <button
                    className={isCurrent ? 'btn-secondary' : 'btn-primary'}
                    disabled={isCurrent || isPaying || verifyStatus === 'verifying'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrent) {
                        setSelectedPlanId(plan.id as 'basic' | 'standard' | 'pro');
                        setShowPayModal(true);
                      }
                    }}
                    style={{ width: '100%', marginTop: 20, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {isPaying ? <LoadingSpinner /> : isCurrent ? '사용 중' : `${plan.label}로 변경`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 결제 내역 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>결제 내역</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>최근 결제 내역</div>
          </div>
          <button className="btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DownloadIcon /> 영수증 다운로드
          </button>
        </div>
        {isLoadingPayments ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {strings.common.loading}
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {strings.subscription.noPayments}
          </div>
        ) : (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>결제일</th>
                <th>내역</th>
                <th>결제 수단</th>
                <th>영수증</th>
                <th style={{ textAlign: 'right' }}>금액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="table-row">
                  <td style={{ color: 'var(--text-secondary)' }}>{formatDate(p.paid_at)}</td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    EduOnePass {p.plan === 'pro' ? '프로' : p.plan === 'standard' ? '스탠다드' : p.plan === 'starter' ? '스타터' : p.plan} 플랜 월 구독
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>-</td>
                  <td style={{ fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {p.order_id?.slice(0, 16) ?? '-'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                    ₩{p.amount.toLocaleString()}
                  </td>
                  <td>
                    {p.status === 'success' ? (
                      <span className="badge-success">완료</span>
                    ) : (
                      <span className="badge-danger">취소됨</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 플랜 변경 결제 모달 */}
      {showPayModal && (
        <PayModal
          plan={selectedPlan}
          onClose={() => setShowPayModal(false)}
          onPay={handlePay}
          isPaying={payingAmount === selectedPlan.amount}
        />
      )}
    </div>
  );
}

// ─── 플랜 변경 모달 ────────────────────────────────────────────────────────────

interface PayModalProps {
  plan: typeof PLANS[number];
  onClose: () => void;
  onPay: (amount: number) => void;
  isPaying: boolean;
}

function PayModal({ plan, onClose, onPay, isPaying }: PayModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            플랜 변경 — 결제
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 변경 예정 플랜 요약 */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-subtle)', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>변경 예정 플랜</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {plan.label} 플랜
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                ₩{plan.amount.toLocaleString()} <span style={{ fontSize: 12.5, fontWeight: 400, color: 'var(--text-secondary)' }}>/월</span>
              </div>
            </div>
          </div>

          {/* 카드 번호 */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              카드 번호
            </label>
            <input
              className="input-field"
              placeholder="1234 5678 9012 3456"
              style={{ fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace' }}
            />
          </div>

          {/* 유효기간 + CVC */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                유효기간
              </label>
              <input
                className="input-field"
                placeholder="MM / YY"
                style={{ fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                CVC
              </label>
              <input
                className="input-field"
                placeholder="•••"
                style={{ fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace' }}
              />
            </div>
          </div>

          {/* 카드 소유주 */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              카드 소유주
            </label>
            <input className="input-field" placeholder="이름을 입력하세요" />
          </div>

          {/* 일할 계산 안내 */}
          <div style={{
            padding: '12px 14px',
            background: 'var(--accent-soft)',
            borderRadius: 8,
            fontSize: 12.5,
            color: 'var(--accent)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <SparkleIcon />
            <div>변경 즉시 일할 계산되어 청구되며, 이전 플랜의 잔여 금액은 자동 차감됩니다.</div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button
            className="btn-primary"
            onClick={() => onPay(plan.amount)}
            disabled={isPaying}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isPaying ? <LoadingSpinner /> : `₩${plan.amount.toLocaleString()} 결제하기`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 아이콘 ──────────────────────────────────────────────────────────────────

function DotIcon() {
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 2 }} />;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
