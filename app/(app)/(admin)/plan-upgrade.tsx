/**
 * app/(app)/(admin)/plan-upgrade.tsx — 원장(admin) 전용 플랜 업그레이드 화면
 *
 * 왜 웹으로 리다이렉트하는가:
 * - 토스페이먼츠 결제는 웹 SDK(`@tosspayments/payment-sdk`) 기반이 가장 검증됨
 * - 웹 대시보드(`/subscription`)에 동일 결제 흐름이 이미 완성되어 있음
 *   (loadTossPayments → verifyTossPayment CF 호출 → academies.plan 갱신)
 * - 앱 내에서 WebView·네이티브 SDK를 새로 붙이면 결제 보안 리스크 증가
 *
 * 흐름:
 * 1. 현재 플랜 / 만료일 표시 (onSnapshot 기반 — academy store 동기화)
 * 2. 요금제 카드 3개 (starter / standard / pro)
 * 3. "웹에서 결제하기" → Linking.openURL(<웹 대시보드>/subscription)
 * 4. 결제 완료 후 앱으로 돌아오면 academy 문서 onSnapshot 으로 plan 자동 갱신
 *
 * 권한: _layout.tsx 에서 admin 역할로 이미 가드됨. 추가 체크 없음.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../../../store/useAuthStore';
import { strings } from '../../../constants/strings';

// ─────────────────────────────────────────────────────────────
// 플랜 정보 (도메인 용어 domain-terms.md 와 일치)
// ─────────────────────────────────────────────────────────────

interface PlanInfo {
  id: 'starter' | 'standard' | 'pro';
  label: string;
  price: number;
  priceLabel: string;
  limitLabel: string;
  features: string[];
  isPopular?: boolean;
}

const PLANS: PlanInfo[] = [
  {
    id: 'starter',
    label: '스타터',
    price: 29000,
    priceLabel: '월 29,000원',
    limitLabel: '학생 30명 이하',
    features: ['출결·숙제·공지 관리', '법정 출석부 엑셀 내보내기'],
  },
  {
    id: 'standard',
    label: '스탠다드',
    price: 59000,
    priceLabel: '월 59,000원',
    limitLabel: '학생 30~100명',
    features: ['스타터 전체 기능', '영상 자료실', '자동 알림·읽음 확인'],
    isPopular: true,
  },
  {
    id: 'pro',
    label: '프로',
    price: 99000,
    priceLabel: '월 99,000원',
    limitLabel: '학생 100명 이상',
    features: ['스탠다드 전체 기능', '웹 대시보드 무제한', '전담 상담사'],
  },
];

// 플랜 한글 라벨 (현재 플랜 표기용)
function currentPlanLabel(plan: string | undefined): string {
  if (plan === 'pro') return '프로 플랜';
  if (plan === 'standard') return '스탠다드 플랜';
  if (plan === 'starter') return '스타터 플랜';
  if (plan === 'trial') return '체험판';
  return 'Free 플랜';
}

// Timestamp → YYYY.MM.DD 포맷
function formatDate(ts: unknown): string {
  if (!ts) return '-';
  const t = ts as { toDate?: () => Date };
  const d = typeof t.toDate === 'function' ? t.toDate() : new Date(t as string);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────

export default function PlanUpgradeScreen() {
  const { top } = useSafeAreaInsets();
  const { academy } = useAuthStore();

  // 선택 상태 — 기본은 스탠다드(popular)
  const [selectedPlanId, setSelectedPlanId] = useState<PlanInfo['id']>('standard');
  const [isOpening, setIsOpening] = useState(false);

  const currentPlan = academy?.plan ?? 'free';
  const isPaid = currentPlan !== 'free';
  const expiresLabel = academy?.plan_expires_at ? formatDate(academy.plan_expires_at) : null;

  const webDashboardUrl = useMemo(
    () => (process.env.EXPO_PUBLIC_WEB_DASHBOARD_URL ?? '').trim(),
    []
  );

  // ── 결제 페이지 열기 (웹 대시보드 /subscription) ──
  const handleOpenWebPayment = async () => {
    // URL 미설정 시 문의 안내
    if (!webDashboardUrl) {
      Alert.alert(
        '결제 페이지 준비 중',
        '현재 앱에서는 결제 페이지를 열 수 없어요.\n카카오톡 채널로 문의 주시면 안내드릴게요.',
        [
          { text: strings.common.cancel, style: 'cancel' },
          { text: '카카오톡 문의', onPress: handleKakaoInquiry },
        ]
      );
      return;
    }

    setIsOpening(true);
    try {
      // /subscription 경로 + 선택한 플랜을 쿼리 파라미터로 전달
      // (웹에서는 기본 선택값만 반영하면 됨)
      const url = `${webDashboardUrl.replace(/\/$/, '')}/subscription?plan=${selectedPlanId}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(strings.common.error, '웹 브라우저를 열 수 없어요.');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.error('[PlanUpgrade] 웹 결제 페이지 열기 실패:', e);
      Alert.alert(strings.common.error, '결제 페이지를 여는 중 오류가 발생했어요.');
    } finally {
      setIsOpening(false);
    }
  };

  // ── 카카오톡 채널 문의 (URL 미설정 시 대체 경로) ──
  const handleKakaoInquiry = () => {
    // 실제 운영 시 카카오채널 URL로 교체
    const mailto = `mailto:${strings.account.inquiryEmail}?subject=${encodeURIComponent(
      '[플랜 업그레이드] 결제 문의'
    )}&body=${encodeURIComponent(
      `\n\n---\n학원명: ${academy?.name ?? ''}\n학원 ID: ${academy?.id ?? ''}\n희망 플랜: ${selectedPlanId}\n플랫폼: ${Platform.OS}`
    )}`;
    Linking.openURL(mailto).catch(() =>
      Alert.alert('문의하기', `${strings.account.inquiryEmail}으로 이메일을 보내주세요.`)
    );
  };

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>플랜 업그레이드</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 현재 플랜 안내 ── */}
        <View style={styles.currentCard}>
          <View style={styles.currentRow}>
            <Text style={styles.currentLabel}>현재 플랜</Text>
            <View style={[styles.currentBadge, isPaid ? styles.currentBadgePaid : styles.currentBadgeFree]}>
              <Text style={[styles.currentBadgeText, isPaid && styles.currentBadgeTextPaid]}>
                {currentPlanLabel(currentPlan)}
              </Text>
            </View>
          </View>
          {isPaid && expiresLabel && (
            <Text style={styles.currentSubtext}>다음 결제일 {expiresLabel}</Text>
          )}
          {!isPaid && (
            <Text style={styles.currentSubtext}>
              Pro 전용 기능(숙제 스캔, 엑셀 내보내기 등)을 이용하려면 유료 플랜이 필요해요.
            </Text>
          )}
        </View>

        {/* ── 요금제 카드 ── */}
        <Text style={styles.sectionTitle}>요금제 선택</Text>

        {PLANS.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, isSelected && styles.planCardSelected]}
              onPress={() => setSelectedPlanId(plan.id)}
              activeOpacity={0.85}
            >
              {/* 추천 뱃지 */}
              {plan.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>추천</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planLabel}>{plan.label}</Text>
                  <Text style={styles.planLimit}>{plan.limitLabel}</Text>
                </View>

                {/* 선택 체크 */}
                <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </View>

              <Text style={styles.planPrice}>{plan.priceLabel}</Text>

              <View style={styles.featureList}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#5B50E8" />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── 결제 안내 ── */}
        <View style={styles.noticeBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#5B50E8" />
          <Text style={styles.noticeText}>
            안전한 카드 결제를 위해{'\n'}결제는 웹 관리자 페이지에서 진행돼요.
          </Text>
        </View>
      </ScrollView>

      {/* ── 하단 고정 CTA ── */}
      <View style={styles.ctaBar}>
        <TouchableOpacity
          style={[styles.primaryBtn, isOpening && styles.primaryBtnDisabled]}
          onPress={handleOpenWebPayment}
          disabled={isOpening}
          activeOpacity={0.85}
        >
          {isOpening ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>웹에서 결제하기 →</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleKakaoInquiry}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>문의로 상담받기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일 (ui-screens.md 디자인 토큰 준수)
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#ffffff',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  headerRight: {
    width: 30,
  },

  // ── 본문 스크롤 ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 160,
  },

  // ── 현재 플랜 카드 ──
  currentCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  currentBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  currentBadgeFree: {
    backgroundColor: '#F1F5F9',
  },
  currentBadgePaid: {
    backgroundColor: '#EEEDF9',
  },
  currentBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  currentBadgeTextPaid: {
    color: '#5B50E8',
  },
  currentSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },

  // ── 섹션 ──
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },

  // ── 플랜 카드 ──
  planCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  planCardSelected: {
    borderColor: '#5B50E8',
    backgroundColor: '#F8F7FF',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#5B50E8',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  planLimit: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  planPrice: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '800',
    color: '#5B50E8',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#5B50E8',
    borderColor: '#5B50E8',
  },
  featureList: {
    marginTop: 10,
    gap: 6,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#334155',
  },

  // ── 결제 안내 ──
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EEEDF9',
    borderWidth: 1,
    borderColor: '#D4D0FA',
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },

  // ── 하단 고정 CTA ──
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
