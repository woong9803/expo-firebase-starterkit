import { View, Text, StyleSheet } from 'react-native';

// 수업 영상 — Phase 9에서 구현 예정
export default function StudentVideosScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>수업 영상은 준비 중이에요</Text>
      <Text style={styles.sub}>Phase 9에서 구현됩니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '600', color: '#334155' },
  sub: { fontSize: 12, color: '#94A3B8', marginTop: 6 },
});
