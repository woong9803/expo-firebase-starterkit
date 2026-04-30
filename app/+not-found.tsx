import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Unmatched Route 흡수 화면
 *
 * Firebase Phone Auth 가 APNs Silent Push 검증에 실패하면
 * Safari 로 reCAPTCHA 페이지를 띄우고, 인증 완료 후 `woongking://` 스킴으로
 * 앱에 복귀시킨다. 이때 expo-router 에 매칭되는 경로가 없어
 * 기본 "Unmatched Route" 화면이 검게 노출되는 문제 해결용.
 *
 * AppDelegate 의 `Auth.auth().canHandle(url)` 분기로 대부분 흡수되지만,
 * 만일을 대비해 안전망으로 둔다 — store 에 진행 중인 번호가 있으면
 * phone-verify 로 직접 복귀시켜 사용자가 첫 화면으로 튕기는 일이 없게 한다.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const pendingPhone = useAuthStore((s) => s.pendingPhoneAuthNumber);

  useEffect(() => {
    // 휴대폰 인증 진행 중이었다면 phone-verify 로 복귀 (phone 파라미터 함께 전달)
    if (pendingPhone) {
      router.replace({
        pathname: '/(auth)/phone-verify',
        params: { phone: pendingPhone },
      });
      return;
    }
    // 그 외 케이스는 루트(/) 로 — _layout 의 인증 가드가 다시 분기 처리
    router.replace('/');
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#5B50E8" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
