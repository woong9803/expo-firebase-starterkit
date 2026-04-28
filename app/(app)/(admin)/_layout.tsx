import { Stack } from 'expo-router';

/**
 * admin 루트 레이아웃 — Stack
 *
 * (tabs)/ 가 탭 화면들을 담당하고,
 * 서브 화면들은 presentation: 'modal' 로 아래에서 올라오는 시트로 표시된다.
 */
export default function AdminRootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
