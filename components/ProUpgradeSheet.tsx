/**
 * components/ProUpgradeSheet.tsx — Pro 플랜 전환 바텀시트
 *
 * 무료 플랜 사용자가 Pro 전용 기능 진입 시 표시.
 *
 * 역할별 동작 분기 (학원 설정은 admin만 변경 가능 — security.md 기준):
 * - admin:  "플랜 업그레이드 →" → /plan-upgrade 화면으로 이동
 * - teacher: "원장님께 요청 →" → 시트만 닫고 요청 가이드 유지
 * - 기타:    시트만 닫음 (학부모/학생은 이 시트를 보게 될 일이 거의 없음)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';

import { useAuthStore } from '../store/useAuthStore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** 바텀시트 표시 여부 */
  visible: boolean;
  /** 닫기 콜백 */
  onClose: () => void;
  /** Pro 기능 이름 (예: "숙제 스캔 제출") */
  featureName: string;
}

// ─── Pro 플랜 혜택 목록 ────────────────────────────────────────────────────────

const PRO_BENEFITS = [
  '숙제 스캔 제출 · 검사 피드백',
  '출결 엑셀 자동 생성 (법정 출석부)',
  '전체 공지 + 학부모 알림',
  '무제한 학생 · 선생님 · 반',
];

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ProUpgradeSheet({ visible, onClose, featureName }: Props) {
  const { user } = useAuthStore();
  const role = user?.role;
  const isAdmin = role === 'admin';

  // admin: 결제 화면으로 이동 / 그 외: 시트만 닫음 (원장님께 요청 안내)
  const handleUpgradePress = () => {
    if (isAdmin) {
      onClose();
      router.push('/(app)/(admin)/plan-upgrade');
    } else {
      onClose();
    }
  };

  // 역할별 버튼 라벨
  const ctaLabel = isAdmin ? '플랜 업그레이드 →' : '원장님께 요청하기';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* 딤 배경 — 탭하면 닫힘 */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* 바텀시트 본체 */}
      <View style={styles.sheet}>
        {/* 핸들 바 */}
        <View style={styles.handle} />

        {/* Pro 뱃지 */}
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>Pro</Text>
        </View>

        {/* 제목 */}
        <Text style={styles.title}>Pro 플랜이 필요해요</Text>
        <Text style={styles.desc}>
          <Text style={styles.featureName}>{featureName}</Text>
          {' '}기능은{'\n'}Pro 플랜에서 이용할 수 있어요.
        </Text>

        {/* 혜택 목록 */}
        <View style={styles.benefitList}>
          {PRO_BENEFITS.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        {/* 비원장 역할에게는 안내 텍스트 추가 노출 */}
        {!isAdmin && (
          <Text style={styles.roleNotice}>
            플랜 변경은 학원 원장님만 가능해요.{'\n'}
            원장님께 업그레이드를 요청해주세요.
          </Text>
        )}

        {/* 업그레이드 버튼 (역할별 분기) */}
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={handleUpgradePress}
          activeOpacity={0.85}
        >
          <Text style={styles.upgradeBtnText}>{ctaLabel}</Text>
        </TouchableOpacity>

        {/* 취소 */}
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>나중에 할게요</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },

  // 핸들
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 20,
  },

  // Pro 뱃지
  proBadge: {
    backgroundColor: '#EEEDF9',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  proBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5B50E8',
  },

  // 제목
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  desc: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  featureName: {
    color: '#5B50E8',
    fontWeight: '700',
  },

  // 혜택 목록
  benefitList: {
    alignSelf: 'stretch',
    backgroundColor: '#F8F7FF',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 20,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  benefitText: {
    fontSize: 14,
    color: '#334155',
  },

  // 비원장 역할 안내
  roleNotice: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },

  // 버튼
  upgradeBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  upgradeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
