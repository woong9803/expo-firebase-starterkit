import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { useAuthStore } from '../../../store/useAuthStore';
import { Colors, FontSize, FontWeight, Radius } from '../../../constants/theme';

export default function AdminSettingsScreen() {
  const { user, academy, clearUser } = useAuthStore();

  const handleLogout = async () => {
    await signOut(auth);
    clearUser();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내정보</Text>
      </View>

      {/* 프로필 카드 */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? '원'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.name ?? '원장님'}</Text>
          <Text style={styles.role}>원장님 · {academy?.name ?? ''}</Text>
          {academy?.plan === 'pro' && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>Pro</Text>
            </View>
          )}
        </View>
      </View>

      {/* 학원 정보 카드 */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>학원 정보</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>학원명</Text>
          <Text style={styles.infoValue}>{academy?.name ?? '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>학원 유형</Text>
          <Text style={styles.infoValue}>{academy?.academy_type ?? '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>학원 코드</Text>
          <Text style={[styles.infoValue, styles.infoCode]}>{academy?.academy_code ?? '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>승인 상태</Text>
          <Text style={[styles.infoValue, academy?.status === 'active' ? styles.statusActive : styles.statusPending]}>
            {academy?.status === 'active' ? '승인 완료' : academy?.status === 'pending' ? '승인 대기' : '반려'}
          </Text>
        </View>
      </View>

      {/* 로그아웃 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: FontSize.xl4, fontWeight: FontWeight.extrabold, color: Colors.gray900 },

  // 프로필
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.white,
    margin: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.gray800,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.xl3, fontWeight: FontWeight.bold, color: Colors.white },
  profileInfo: { flex: 1 },
  name: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray900 },
  role: { fontSize: FontSize.base, color: Colors.gray500, marginTop: 2 },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenBorder,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 4,
  },
  proBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.greenText },

  // 학원 정보
  infoCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    gap: 10,
  },
  infoCardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray700, marginBottom: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: FontSize.base, color: Colors.gray500 },
  infoValue: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray900 },
  infoCode: { fontFamily: 'monospace', letterSpacing: 2, color: Colors.blue500 },
  statusActive: { color: Colors.green },
  statusPending: { color: Colors.amber },

  // 로그아웃
  logoutBtn: {
    marginHorizontal: 16,
    height: 44,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.redText },
});
