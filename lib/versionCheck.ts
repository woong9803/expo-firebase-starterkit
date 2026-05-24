/**
 * lib/versionCheck.ts — 강제/권장 업데이트 체크 유틸
 *
 * Firestore app_config/version 문서를 조회해 현재 앱 버전과 비교한다.
 * - min_version 미만: 강제 업데이트 (닫기 불가)
 * - latest_version 미만: 권장 업데이트 (닫기 가능)
 */

import firestore from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

// Firestore app_config/version 문서 구조
interface VersionConfig {
  min_version: string;       // 이 버전 미만이면 강제 업데이트
  latest_version: string;    // 이 버전 미만이면 권장 업데이트
  store_url_ios: string;     // iOS App Store URL
  store_url_android: string; // Android Play Store URL
}

// checkVersion 반환 타입
export interface VersionCheckResult {
  needsForceUpdate: boolean;
  needsRecommendUpdate: boolean;
  storeUrl: string;
}

/**
 * 버전 문자열을 숫자 배열로 파싱한다 (예: "1.2.3" → [1, 2, 3])
 */
function parseVersion(version: string): number[] {
  return version.split('.').map((v) => parseInt(v, 10) || 0);
}

/**
 * v1 < v2이면 -1, v1 > v2이면 1, 같으면 0 반환
 * major → minor → patch 순으로 비교
 */
function compareVersions(v1: string, v2: string): number {
  const a = parseVersion(v1);
  const b = parseVersion(v2);
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  return 0;
}

/**
 * Firestore에서 버전 설정을 조회한다
 */
async function getVersionConfig(): Promise<VersionConfig | null> {
  try {
    const snap = await firestore().collection('app_config').doc('version').get();
    if (!snap.exists()) return null;
    return snap.data() as VersionConfig;
  } catch (e) {
    // 네트워크 오류 등 — 업데이트 체크 실패 시 앱 진입 막지 않음
    console.warn('[versionCheck] 버전 설정 조회 실패:', e);
    return null;
  }
}

/**
 * 현재 앱 버전과 Firestore 버전 설정을 비교해 업데이트 필요 여부를 반환한다
 *
 * @param currentVersion 현재 앱 버전 (app.config.ts의 version 값)
 */
export async function checkVersion(currentVersion: string): Promise<VersionCheckResult> {
  const config = await getVersionConfig();

  // Firestore 문서 없거나 조회 실패 → 업데이트 불필요로 처리
  if (!config) {
    return { needsForceUpdate: false, needsRecommendUpdate: false, storeUrl: '' };
  }

  // 플랫폼별 스토어 URL 선택
  const storeUrl =
    Platform.OS === 'ios' ? config.store_url_ios : config.store_url_android;

  // 현재 버전이 min_version 미만이면 강제 업데이트
  const needsForceUpdate = compareVersions(currentVersion, config.min_version) < 0;

  // 강제 업데이트가 아닌 경우에만 권장 업데이트 체크
  const needsRecommendUpdate =
    !needsForceUpdate && compareVersions(currentVersion, config.latest_version) < 0;

  return { needsForceUpdate, needsRecommendUpdate, storeUrl };
}
