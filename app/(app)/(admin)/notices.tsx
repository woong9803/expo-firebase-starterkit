import { View, Text, StyleSheet } from 'react-native';

// 공지사항 — Phase 7에서 구현 예정
export default function AdminNoticesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>공지사항</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.emoji}>📢</Text>
        <Text style={styles.text}>공지 기능은 준비 중이에요</Text>
        <Text style={styles.sub}>Phase 7에서 구현됩니다</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emoji: { fontSize: 40 },
  text: { fontSize: 15, fontWeight: '600', color: '#334155' },
  sub: { fontSize: 12, color: '#94A3B8' },
});
