import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { strings } from '../../constants/strings';
import { openKakaoSupport } from '../../lib/support';

/**
 * 만 14세 미만 학생 본인 가입 차단 안내 화면
 *
 * 개인정보보호법(PIPA) 제22조: 만 14세 미만 아동의 개인정보 수집·이용에는
 * 법정대리인(부모 등)의 동의가 필수.
 *
 * 학생이 본인 가입 흐름에서 생년월일을 입력했을 때 14세 미만이면
 * 가입을 차단하고 이 화면으로 라우팅됨.
 *
 * 진입 경로: app/(auth)/code-input.tsx (role === 'student' 분기)
 */
export default function GuardianRequiredScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const t = strings.onboarding.guardianRequired;

  // 학부모로 가입하기 — 역할 선택 화면으로 돌려보냄 (사용자가 학부모를 선택하도록)
  const handleSwitchToParent = () => {
    router.replace('/(auth)/role-select');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: top + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 아이콘 + 제목 ── */}
      <View style={styles.iconWrap}>
        <Text style={styles.iconEmoji}>👨‍👩‍👧</Text>
      </View>

      <Text style={styles.title}>{t.title}</Text>
      <Text style={styles.subtitle}>{t.subtitle}</Text>

      {/* ── 방법 1: 학부모 가입 안내 ── */}
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>{t.step1Title}</Text>
        <Text style={styles.stepBody}>{t.step1Body}</Text>
      </View>

      {/* ── 방법 2: 학원 문의 ── */}
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>{t.step2Title}</Text>
        <Text style={styles.stepBody}>{t.step2Body}</Text>
      </View>

      {/* ── 버튼 영역 ── */}
      <View style={styles.btnArea}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleSwitchToParent}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>{t.parentJoinBtn}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={openKakaoSupport}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>{t.inquiryBtn}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnText}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.btnTextLabel}>{t.backBtn}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // ── 아이콘 ──
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  iconEmoji: {
    fontSize: 38,
  },

  // ── 제목 ──
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 24,
  },

  // ── 단계 카드 ──
  stepCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5B50E8',
    marginBottom: 6,
  },
  stepBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },

  // ── 버튼 ──
  btnArea: {
    marginTop: 20,
    gap: 10,
  },
  btnPrimary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  btnText: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnTextLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
