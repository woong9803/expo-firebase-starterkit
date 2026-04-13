import { Stack } from 'expo-router';

// 로그인 전 화면 레이아웃 — headerShown: false로 모든 헤더/버튼 완전 제거
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
