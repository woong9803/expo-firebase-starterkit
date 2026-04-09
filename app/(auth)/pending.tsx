import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';

export default function PendingScreen() {
  const { clearUser } = useAuthStore();

  // 로그아웃 처리
  const handleLogout = async () => {
    await signOut(auth);
    clearUser();
    // app/_layout.tsx의 onAuthStateChanged가 /(auth)/login으로 자동 이동
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* ── 로고 & 타이틀 ── */}
      <View style={styles.heroArea}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>E</Text>
        </View>
        <Text style={styles.title}>{strings.onboarding.pendingTitle}</Text>
        <Text style={styles.subtitle}>{strings.onboarding.pendingDesc}</Text>
      </View>

      {/* ── 허용 기능 카드 ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.dotGreen} />
          <Text style={styles.cardTitle}>
            {strings.onboarding.pendingAllowedTitle}
          </Text>
        </View>
        {[
          strings.onboarding.pendingAllowed1,
          strings.onboarding.pendingAllowed2,
          strings.onboarding.pendingAllowed3,
        ].map((item) => (
          <View key={item} style={styles.featureRow}>
            <Text style={styles.featureCheck}>✓</Text>
            <Text style={styles.featureText}>{item}</Text>
          </View>
        ))}
      </View>

      {/* ── 차단 기능 카드 ── */}
      <View style={[styles.card, styles.cardBlocked]}>
        <View style={styles.cardHeader}>
          <View style={styles.dotGray} />
          <Text style={[styles.cardTitle, styles.cardTitleBlocked]}>
            {strings.onboarding.pendingBlockedTitle}
          </Text>
        </View>
        {[
          strings.onboarding.pendingBlocked1,
          strings.onboarding.pendingBlocked2,
        ].map((item) => (
          <View key={item} style={styles.featureRow}>
            <Text style={styles.featureLock}>🔒</Text>
            <Text style={[styles.featureText, styles.featureTextBlocked]}>
              {item}
            </Text>
          </View>
        ))}
      </View>

      {/* ── 안내 문구 ── */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          승인은 영업일 기준 1~2일 내에 완료돼요.{'\n'}
          승인 완료 시 알림을 드릴게요.
        </Text>
      </View>

      {/* ── 로그아웃 버튼 ── */}
      <TouchableOpacity
        style={styles.btnLogout}
        onPress={handleLogout}
        activeOpacity={0.85}
      >
        <Text style={styles.btnLogoutText}>{strings.auth.logout}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },

  // ── 히어로 영역 ──
  heroArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#2176C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── 카드 ──
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  cardBlocked: {
    backgroundColor: '#F8FAFC',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  dotGray: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardTitleBlocked: {
    color: '#64748B',
  },

  // ── 기능 항목 ──
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  featureCheck: {
    fontSize: 14,
    color: '#10B981',
    width: 18,
    textAlign: 'center',
  },
  featureLock: {
    fontSize: 13,
    width: 18,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#334155',
  },
  featureTextBlocked: {
    color: '#94A3B8',
  },

  // ── 안내 박스 ──
  infoBox: {
    backgroundColor: '#E6F1FB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#185FA5',
    lineHeight: 20,
    textAlign: 'center',
  },

  // ── 로그아웃 버튼 ──
  btnLogout: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  btnLogoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
});
