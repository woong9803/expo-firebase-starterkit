/**
 * hooks/useStudentLimit.ts — 학원의 학생 수 한도 / 사용량 조회 훅
 *
 * 사용 위치: 학생 계정 생성 화면 (선생님 / admin)
 * 목적:
 *  - Cloud Functions(`createStudentAccount`)에서 학생 수 한도를 강제하지만,
 *    클라이언트에서 사전 안내 / 버튼 비활성화로 UX 를 보강한다.
 *  - 한도 정의는 functions 와 동일하게 유지 — domain-terms.md 기준
 *
 * 한도 정책 (academies.status / plan 기준):
 *   pending   → 3명 (파일럿 정책)
 *   free      → 30명 (보수 설정 — starter 기준)
 *   trial     → 무제한
 *   starter   → 30명
 *   standard  → 100명
 *   pro       → 무제한
 *
 * Firestore count() 쿼리는 호출 1회당 비용 1 → 화면 진입 시 1회만 수행
 */

import { useEffect, useState } from 'react';
import { Collections } from '../lib/firestore';
import { useAuthStore } from '../store/useAuthStore';

export const STUDENT_LIMIT_BY_PLAN: Record<string, number> = {
  free: 30,
  trial: Number.POSITIVE_INFINITY,
  starter: 30,
  standard: 100,
  pro: Number.POSITIVE_INFINITY,
};

export const PENDING_STUDENT_LIMIT = 3;

interface StudentLimitResult {
  /** 적용 한도 (무제한이면 Infinity) */
  limit: number;
  /** 현재 학생 수 — null 이면 아직 로딩 중 */
  count: number | null;
  /** 한도 도달 여부 — count 가 limit 이상 */
  isAtLimit: boolean;
  /** 한도까지 남은 자리 (무제한이면 Infinity) */
  remaining: number;
  /** 무제한 플랜 여부 (pro / trial) */
  isUnlimited: boolean;
  /** 사용자에게 보여줄 한도 라벨 (pending / free / starter ...) */
  limitLabel: string;
  /** 카운트 로딩 완료 여부 */
  isLoaded: boolean;
}

export function useStudentLimit(): StudentLimitResult {
  const { academy } = useAuthStore();
  const [count, setCount] = useState<number | null>(null);

  // 한도 계산 — academy 가 null 이면 보수적으로 free 기준 사용
  const status = academy?.status ?? 'pending';
  const plan = academy?.plan ?? 'free';
  const isPending = status === 'pending';
  const limit = isPending
    ? PENDING_STUDENT_LIMIT
    : (STUDENT_LIMIT_BY_PLAN[plan] ?? STUDENT_LIMIT_BY_PLAN.free);
  const limitLabel = isPending ? 'pending' : plan;
  const isUnlimited = !Number.isFinite(limit);

  // 현재 학생 수 조회 (count() 쿼리 — 단일 read 비용)
  useEffect(() => {
    if (!academy?.id) {
      setCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await Collections.users()
          .where('academy_id', '==', academy.id)
          .where('role', '==', 'student')
          .count()
          .get();
        if (!cancelled) setCount(snap.data().count);
      } catch (e) {
        // count 실패 — 한도 미알림 fallback (CF 가 최후 방어선)
        console.warn('[useStudentLimit] 학생 수 조회 실패:', e);
        if (!cancelled) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academy?.id]);

  const isLoaded = count !== null;
  const isAtLimit = isLoaded && !isUnlimited && (count as number) >= limit;
  const remaining = isUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limit - (count ?? 0));

  return {
    limit,
    count,
    isAtLimit,
    remaining,
    isUnlimited,
    limitLabel,
    isLoaded,
  };
}
