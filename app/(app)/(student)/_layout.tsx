import { Stack } from 'expo-router';

/**
 * 학생 루트 레이아웃 — Stack
 *
 * (tabs)/ 가 탭 화면들을 담당하고,
 * 그 외 서브 화면(homework-submit, streak 등)은
 * 이 Stack에 push되어 router.back()이 올바르게 동작한다.
 */
export default function StudentRootLayout() {
  // gestureEnabled: 좌→우 스와이프로 뒤로가기 활성 (iOS 기본값이지만 명시)
  // fullScreenGestureEnabled: 화면 가장자리뿐 아니라 화면 어디서든 스와이프 가능
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    />
  );
}
