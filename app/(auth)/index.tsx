import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/theme';

// 특징 리스트 (카드 박스 없는 심플 리스트)
const FEATURES = [
  { icon: '📋', text: '숙제 스캔 제출 · 실시간 피드백' },
  { icon: '✅', text: '원터치 출결 · 학부모 즉시 알림' },
  { icon: '📊', text: '법정 출석부 엑셀 자동 생성' },
] as const;

export default function StartScreen() {
  const router = useRouter();

  return (
    // 다크 그라디언트 배경
    <LinearGradient
      colors={['#1A1830', '#2D2B52', '#1A1830']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.gradient}
    >
      {/* 글로우 효과 — 보라(우상단) + 초록(좌하단) */}
      <View style={styles.glowPurple} />
      <View style={styles.glowGreen} />

      {/* ── 상단 콘텐츠: 로고 + 앱명 + 특징 리스트 ── */}
      <View style={styles.topContent}>

        {/* 로고 박스: 72×72, #4F46E5, 📚 이모지 */}
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>📚</Text>
        </View>

        <Text style={styles.appName}>EduOnePass</Text>
        <Text style={styles.appSlogan}>선생님 퇴근 시간을 앞당기다</Text>

        {/* 특징 리스트 — 아이콘 + 텍스트, 카드 없음 */}
        <View style={styles.featureList}>
          {FEATURES.map((item) => (
            <View key={item.text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{item.icon}</Text>
              <Text style={styles.featureText}>{item.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 하단 바텀시트: 흰색 둥근 상단 ── */}
      <View style={styles.bottomSheet}>

        {/* 시작하기 Primary 버튼 — #4F46E5 (인디고) */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>시작하기</Text>
        </TouchableOpacity>

        {/* 이미 계정이 있어요 Outline 버튼 */}
        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.7}
        >
          <Text style={styles.btnOutlineText}>이미 계정이 있어요</Text>
        </TouchableOpacity>

        {/* 약관 텍스트 */}
        <Text style={styles.termsText}>
          계속 진행하면{' '}
          <Text style={styles.termsLink}>이용약관</Text>
          에 동의합니다
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },

  // ── 글로우 효과 (절대 위치) ──
  glowPurple: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(79,70,229,0.2)',
    // React Native는 CSS blur 미지원 — 반투명으로 표현
  },
  glowGreen: {
    position: 'absolute',
    bottom: 220,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },

  // ── 상단 콘텐츠 ──
  topContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    paddingBottom: 40,
  },

  // 로고 박스 72×72, #4F46E5, borderRadius 20
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    // 그림자
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  logoEmoji: {
    fontSize: 36,
  },

  appName: {
    fontSize: 28,
    fontWeight: FontWeight.extrabold,  // 800
    color: '#ffffff',
    letterSpacing: -1,
  },
  appSlogan: {
    fontSize: FontSize.lg,             // 13px
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },

  // 특징 리스트 — marginTop 48, gap 12
  featureList: {
    marginTop: 48,
    gap: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIcon: {
    fontSize: 22,
  },
  featureText: {
    fontSize: FontSize.lg,             // 13px
    color: 'rgba(255,255,255,0.7)',
  },

  // ── 바텀시트: 흰색, 상단 32px 라운드 ──
  bottomSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    gap: 14,
  },

  // Primary 버튼 — #4F46E5 (인디고)
  btnPrimary: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: FontWeight.bold,       // 700
    color: Colors.white,
  },

  // Outline 버튼
  btnOutline: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E4F0',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: '#1A1830',
  },

  // 약관 텍스트
  termsText: {
    fontSize: 12,
    color: '#A0A0BC',
    textAlign: 'center',
    marginTop: 4,
  },
  termsLink: {
    fontSize: 12,
    color: '#4F46E5',
  },
});
