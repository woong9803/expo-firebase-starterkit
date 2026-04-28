import { Stack } from 'expo-router';

/**
 * common 화면 레이아웃 — 전 역할이 공유하는 화면들
 *
 * notice-detail, notification-inbox 등은 탭 화면에서 진입하므로
 * 아래에서 올라오는 시트(modal) 형식으로 표시한다.
 */
export default function CommonLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="notice-list" />
      <Stack.Screen name="notice-detail" />
      <Stack.Screen name="notification-inbox" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
