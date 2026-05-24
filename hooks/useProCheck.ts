/**
 * hooks/useProCheck.ts — 스탠다드+ 기능 게이트 훅
 *
 * PRD 가격 정책상 다음 기능은 모두 스탠다드/프로 전용:
 *  - 수업 영상 등록·시청
 *  - 미제출 자동 알림
 *  - 공지 읽음 확인
 *
 * → 무료(free)·체험판(trial)·스타터(starter)는 모두 차단되며,
 *   ProUpgradeSheet 로 업그레이드 안내를 표시한다.
 *
 * 훅 이름은 과거 호환을 위해 useProCheck 로 유지하지만 실제 기준은 'standard | pro' 다.
 */

import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';

interface ProCheckResult {
  /** standard 또는 pro 플랜이면 true (trial·starter·free 는 false) */
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
  // PRD 685줄 플랜표 기준: 영상·자동알림·읽음확인은 standard 이상에서만 허용
  // trial 은 체험판이지만 영상 등 핵심 유료 기능은 차단 (가격 검증 단계 정책)
  const isPro = isLoaded && (academy.plan === 'standard' || academy.plan === 'pro');

  return {
    isPro,
    isLoaded,
    upgradeSheetVisible,
    showUpgradeSheet: () => setUpgradeSheetVisible(true),
    hideUpgradeSheet: () => setUpgradeSheetVisible(false),
  };
}
