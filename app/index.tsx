import { ActivityIndicator, View } from 'react-native';

// 앱 진입점 — _layout.tsx의 인증 상태 감지 후 자동으로 적절한 화면으로 이동
// 이 화면은 잠깐만 보이고 login 또는 (app)으로 리다이렉트됨
export default function IndexScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#4F46E5" />
    </View>
  );
}
