/**
 * hooks/useProCheck.ts — Pro 플랜 체크 훅
 *
 * 현재 학원의 플랜을 확인하여 Pro/trial 여부를 반환.
 * 무료 플랜이면 ProUpgradeSheet를 표시할 수 있도록 상태를 제공한다.
 *
 * trial도 Pro로 취급 (실제 기능 제한 없음).
 */

import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';

interface ProCheckResult {
  /** Pro 또는 trial 플랜이면 true */
  isPro: boolean;
  /** academy 데이터가 로드되었으면 true (null이면 false) */
  isLoaded: boolean;
  /** 업그레이드 시트 표시 여부 */
  upgradeSheetVisible: boolean;
  /** 업그레이드 시트 열기 */
  showUpgradeSheet: () => void;
  /** 업그레이드 시트 닫기 */
  hideUpgradeSheet: () => void;
}

export function useProCheck(): ProCheckResult {
  const { academy } = useAuthStore();
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);

  // academy가 아직 로드되지 않은 경우(null)에는 판단 보류
  // null이면 isLoading 상태 — 업그레이드 시트 트리거 금지
  const isLoaded = academy !== null;
  const isPro = isLoaded && (academy.plan === 'pro' || academy.plan === 'trial');

  return {
    isPro,
    isLoaded,
    upgradeSheetVisible,
    showUpgradeSheet: () => setUpgradeSheetVisible(true),
    hideUpgradeSheet: () => setUpgradeSheetVisible(false),
  };
}
