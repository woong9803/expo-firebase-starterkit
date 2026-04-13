/**
 * hooks/useNetworkStatus.ts
 *
 * expo-network를 이용해 네트워크 상태를 실시간으로 감지한다.
 * - isOnline: 현재 온라인 여부
 * - justReconnected: 방금 오프라인→온라인으로 전환됐는지 (토스트 표시용, 3초 후 자동 false)
 *
 * 동작 방식
 * ① 마운트 시 즉시 1회 체크
 * ② 3초마다 폴링 (expo-network에 리스너 API가 없어 polling 방식 사용)
 * ③ 앱이 백그라운드 → 포그라운드 복귀 시 즉시 재체크
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

const POLL_INTERVAL_MS = 3000;       // 폴링 주기
const RECONNECT_TOAST_MS = 3000;     // 재연결 토스트 표시 시간

interface NetworkStatus {
  isOnline: boolean;
  justReconnected: boolean; // 재연결 직후 true, RECONNECT_TOAST_MS 후 false
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline]               = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  // 직전 온라인 상태 추적 (클로저 stale 문제 방지를 위해 ref 사용)
  const prevOnlineRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkNetwork = async () => {
    try {
      const state = await Network.getNetworkStateAsync();

      // isInternetReachable가 null이면 확인 불가 — 연결된 것으로 간주
      const online =
        (state.isConnected ?? false) &&
        state.isInternetReachable !== false;

      if (!prevOnlineRef.current && online) {
        // 오프라인 → 온라인 전환 감지 → 재연결 토스트 표시
        setJustReconnected(true);

        // 이전 타이머가 있으면 취소
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setJustReconnected(false);
          toastTimerRef.current = null;
        }, RECONNECT_TOAST_MS);
      }

      prevOnlineRef.current = online;
      setIsOnline(online);
    } catch {
      // 체크 자체가 실패하면 연결된 것으로 가정 (과도한 오프라인 배너 방지)
    }
  };

  useEffect(() => {
    checkNetwork(); // 최초 즉시 체크

    const interval = setInterval(checkNetwork, POLL_INTERVAL_MS);

    // 앱 포그라운드 복귀 시 즉시 체크
    const appStateSub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') checkNetwork();
      },
    );

    return () => {
      clearInterval(interval);
      appStateSub.remove();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return { isOnline, justReconnected };
}
