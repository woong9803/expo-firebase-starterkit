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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { UserRole } from '../../types';

// 역할 카드 순서: 선생님 → 학생 → 학부모 → 원장님
const ROLE_CARDS: Array<{
  role: UserRole;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
}> = [
  {
    role: 'teacher',
    label: '선생님',
    desc: '숙제 출제, 출결 관리, 피드백',
    icon: 'school-outline',
    iconBg: '#E6F1FB',
    iconColor: '#3B82F6',
  },
  {
    role: 'student',
    label: '학생',
    desc: '숙제 제출, 수업 영상, 출결 확인',
    icon: 'person-outline',
    iconBg: '#ECFDF5',
    iconColor: '#10B981',
  },
  {
    role: 'parent',
    label: '학부모',
    desc: '자녀 숙제 확인, 결석 사유 전송',
    icon: 'people-outline',
    iconBg: '#FFFBEB',
    iconColor: '#F59E0B',
  },
  {
    role: 'admin',
    label: '원장님 (admin)',
    desc: '학원 전체 관리, 통계',
    icon: 'business-outline',
    iconBg: '#F5F3FF',
    iconColor: '#5B50E8',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    if (!selectedRole) return;
    setIsLoading(true);

    if (selectedRole === 'admin') {
      router.push('/(auth)/academy-register');
    } else {
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
      contentContainerStyle={[styles.content, { paddingTop: top + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 스텝 인디케이터: 4개 dot, 3번째 활성 ── */}
      <View style={styles.stepRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={i === 2 ? styles.stepActive : styles.stepInactive} />
        ))}
      </View>

      {/* ── 제목 ── */}
      <View style={styles.titleArea}>
        <Text style={styles.title}>어떤 분이세요?</Text>
        <Text style={styles.subtitle}>역할에 맞는 화면을 보여드릴게요</Text>
      </View>

      {/* ── 역할 카드 4개 ── */}
      <View style={styles.cardList}>
        {ROLE_CARDS.map((item) => {
          const isSelected = selectedRole === item.role;
          return (
            <TouchableOpacity
              key={item.role}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelectedRole(item.role)}
              activeOpacity={0.8}
            >
              {/* 아이콘 박스 48×48 */}
              <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={24} color={item.iconColor} />
              </View>

              {/* 텍스트 */}
              <View style={styles.cardText}>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                  {item.label}
                </Text>
                <Text style={styles.cardDesc}>{item.desc}</Text>
              </View>

              {/* 선택 시 체크원 */}
              {isSelected && (
                <View style={styles.checkCircle}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 다음 버튼 ── */}
      <TouchableOpacity
        style={[styles.btnPrimary, !selectedRole && styles.btnInactive]}
        onPress={handleNext}
        disabled={!selectedRole || isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.btnPrimaryText, !selectedRole && styles.btnTextInactive]}>
            다음 →
          </Text>
        )}
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // ── 스텝 인디케이터 ──
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 22,
  },
  stepActive: {
    width: 28,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B50E8',
  },
  stepInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },

  // ── 제목 ──
  titleArea: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },

  // ── 역할 카드 ──
  cardList: {
    gap: 12,
    marginBottom: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
  },
  cardSelected: {
    borderColor: '#5B50E8',
    backgroundColor: '#EEEDF9',
  },

  // 아이콘 박스 48×48
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // iconEmoji 스타일 제거 — Ionicons로 교체됨

  // 텍스트
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardLabelSelected: {
    color: '#0F172A',
  },
  cardDesc: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },

  // 체크원 24×24
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 버튼 ──
  btnPrimary: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInactive: {
    backgroundColor: '#E2E8F0',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  btnTextInactive: {
    color: '#94A3B8',
  },
});
