/**
 * lib/support.ts — 고객 지원(문의하기) 공통 헬퍼
 *
 * 모든 "문의하기" 버튼은 이 헬퍼를 통해 카카오톡 채널로 연결됨.
 * URL 미설정·앱 미설치 등 실패 시 Alert 폴백.
 */

import { Alert, Linking } from 'react-native';

import { SUPPORT_URLS } from '../constants/urls';

/**
 * 카카오톡 상담 채널 열기
 * - 카카오톡 앱이 설치돼 있으면 앱으로, 아니면 웹 채널 페이지로 자동 분기됨
 * - URL 미설정 또는 열기 실패 시 안내 Alert 표시
 */
export async function openKakaoSupport(): Promise<void> {
  const url = SUPPORT_URLS.kakaoChannel;

  // 채널 URL 미설정 — 운영팀에서 채널 개설 전 상태
  if (!url) {
    Alert.alert(
      '문의 채널 준비 중',
      '카카오톡 상담 채널을 준비하고 있어요.\n조금만 기다려주세요.'
    );
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      '문의하기',
      '카카오톡 상담 채널을 열 수 없어요.\n잠시 후 다시 시도해주세요.'
    );
  }
}
