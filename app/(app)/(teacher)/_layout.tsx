import { Stack } from 'expo-router';

/**
 * 선생님 루트 레이아웃 — Stack
 *
 * (tabs)/ 가 탭 화면들을 담당하고,
 * 그 외 서브 화면(notice-create, homework-create 등)은
 * 이 Stack에 push되어 router.back()이 올바르게 동작한다.
 */
export default function TeacherRootLayout() {
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
