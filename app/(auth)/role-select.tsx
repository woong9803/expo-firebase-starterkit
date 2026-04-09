import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserRole } from '../../types';
import { strings } from '../../constants/strings';
import StepIndicator from '../../components/StepIndicator';

// 역할 카드 데이터 정의
interface RoleCard {
  role: UserRole;
  label: string;
  desc: string;
  emoji: string;
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: 'admin',
    label: strings.roles.admin,
    desc: strings.onboarding.adminDesc,
    emoji: '🏫',
  },
  {
    role: 'teacher',
    label: strings.roles.teacher,
    desc: strings.onboarding.teacherDesc,
    emoji: '👨‍🏫',
  },
  {
    role: 'student',
    label: strings.roles.student,
    desc: strings.onboarding.studentDesc,
    emoji: '📚',
  },
  {
    role: 'parent',
    label: strings.roles.parent,
    desc: strings.onboarding.parentDesc,
    emoji: '👨‍👧',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    if (!selectedRole) return;
    setIsLoading(true);

    // 역할에 따라 다음 온보딩 화면으로 분기
    if (selectedRole === 'admin') {
      // 원장님 → 학원 등록 화면
      router.push('/(auth)/academy-register');
    } else {
      // 선생님/학생/학부모 → 코드 입력 화면 (역할 파라미터 전달)
      router.push({
        pathname: '/(auth)/code-input',
        params: { role: selectedRole },
      });
    }

    setIsLoading(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* ── 스텝 인디케이터: 3단계 진행 중 ── */}
      <StepIndicator steps={3} current={3} />

      {/* ── 타이틀 ── */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>{strings.onboarding.selectRole}</Text>
        <Text style={styles.subtitle}>{strings.onboarding.selectRoleDesc}</Text>
      </View>

      {/* ── 역할 카드 4개 ── */}
      <View style={styles.cardsGrid}>
        {ROLE_CARDS.map((item) => {
          const isSelected = selectedRole === item.role;
          return (
            <TouchableOpacity
              key={item.role}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelectedRole(item.role)}
              activeOpacity={0.8}
            >
              {/* 체크 원 — 선택 시만 표시 */}
              <View style={styles.cardTopRow}>
                <Text style={styles.cardEmoji}>{item.emoji}</Text>
                <View
                  style={[
                    styles.checkCircle,
                    isSelected
                      ? styles.checkCircleSelected
                      : styles.checkCircleEmpty,
                  ]}
                >
                  {isSelected && (
                    <Text style={styles.checkMark}>✓</Text>
                  )}
                </View>
              </View>

              <Text
                style={[
                  styles.cardLabel,
                  isSelected && styles.cardLabelSelected,
                ]}
              >
                {item.label}
              </Text>
              <Text
                style={[
                  styles.cardDesc,
                  isSelected && styles.cardDescSelected,
                ]}
              >
                {item.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 다음 버튼 ── */}
      <TouchableOpacity
        style={[
          styles.btnPrimary,
          (!selectedRole || isLoading) && styles.btnDisabled,
        ]}
        onPress={handleNext}
        disabled={!selectedRole || isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnPrimaryText}>{strings.auth.nextButton}</Text>
        )}
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
    paddingTop: 56,
    paddingBottom: 40,
  },

  // ── 타이틀 ──
  titleArea: {
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },

  // ── 역할 카드 그리드 (2×2) ──
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  card: {
    // 2열 그리드 — gap 12 고려한 너비 계산
    width: '47.5%',
    borderWidth: 1.5,
    borderColor: '#E2E8F0', // g200 — 미선택
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
  },
  cardSelected: {
    borderColor: '#2176C7',       // b500 — 선택 시
    backgroundColor: '#E6F1FB',   // b50
  },

  // ── 카드 내부 ──
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 28,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#2176C7', // b500
  },
  checkCircleEmpty: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  checkMark: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardLabelSelected: {
    color: '#0C447C', // b800
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  cardDescSelected: {
    color: '#185FA5', // b700
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    height: 52,
    backgroundColor: '#2176C7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
