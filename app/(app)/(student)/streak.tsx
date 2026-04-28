/**
 * app/(app)/(student)/streak.tsx — 숙제 기록 화면
 *
 * 스탬프 카드 컬렉션 + 제출 현황 차트 + 통계를 보여준다.
 * - 완성된 카드는 기본 접힘, 탭하면 펼치기
 * - 카드 완성 시 축하 팝업
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/useAuthStore';
import StreakChart from '../../../components/StreakChart';
import { fetchStreakData, DayStreak, StreakResult } from '../../../lib/streak';

// 스탬프 카드 한 장당 스탬프 수
const STAMPS_PER_CARD = 10;

export default function StreakScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [streakData, setStreakData] = useState<DayStreak[]>([]);
  const [counts, setCounts] = useState<Pick<StreakResult, 'submittedCount' | 'lateCount' | 'missedCount'>>({
    submittedCount: 0, lateCount: 0, missedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // 완성된 카드 중 펼쳐진 카드 인덱스 목록
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  // 카드 완성 축하 팝업
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationShownRef = useRef(false); // 팝업을 한 번만 띄우기 위한 플래그

  const streak = user?.streak ?? 0;
  const completedCards = Math.floor(streak / STAMPS_PER_CARD);
  const currentProgress = streak % STAMPS_PER_CARD;

  // 카드 완성 감지 — streak가 10의 배수이면 축하 팝업 표시
  useEffect(() => {
    if (streak > 0 && streak % STAMPS_PER_CARD === 0 && !celebrationShownRef.current) {
      celebrationShownRef.current = true;
      setShowCelebration(true);
    }
  }, [streak]);

  // streak이 바뀔 때마다 재조회 — 제출·지각·미제출 모두 즉시 반영
  // subscribeStreakData는 homeworks 변경만 감지하므로 제출(submissions 변경) 시 업데이트 안 됨
  // → streak 변경(제출 후 서버에서 업데이트)을 트리거로 사용해 일관성 유지
  useEffect(() => {
    if (!user?.uid || !user?.class_id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // 30일 뒤 + 7일 앞 = 37일 데이터 조회
    fetchStreakData(user.uid, user.class_id, 30, 7)
      .then((result) => {
        if (!cancelled) {
          // 차트: 뒤로 14일 + 앞으로 7일 = 21일만 표시 (전체 37일 중 앞 16일 제거)
          // index 0 = 30일 전, index 16 = 14일 전, index 36 = 7일 후
          setStreakData(result.days.slice(16));
          // 통계: 30일 전체 기간 기준
          setCounts({
            submittedCount: result.submittedCount,
            lateCount: result.lateCount,
            missedCount: result.missedCount,
          });
          setIsLoading(false);
        }
      })
      .catch((e) => {
        console.error('[Streak] 데이터 조회 실패:', e);
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [user?.uid, user?.class_id, streak]); // streak 변경 시 재조회

  // 통계 — 모두 30일 기준으로 통일 (스탬프와 기준이 다름을 의도적으로 분리)
  const { submittedCount, lateCount, missedCount } = counts;
  const totalHwCount = submittedCount + lateCount + missedCount;
  const submitRate = totalHwCount > 0
    ? Math.round(((submittedCount + lateCount) / totalHwCount) * 100)
    : 0;

  // 완성된 카드 접기/펼치기 토글
  function toggleCard(cardIdx: number) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardIdx)) {
        next.delete(cardIdx);
      } else {
        next.add(cardIdx);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>숙제 기록</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 오류 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
            <Text style={styles.errorText}>데이터를 불러오지 못했어요</Text>
            <Text style={styles.errorSub}>잠시 후 다시 시도해주세요</Text>
          </View>
        )}

        {/* ── 반 미배정 ── */}
        {!error && !user?.class_id && (
          <View style={styles.errorBox}>
            <Ionicons name="people-outline" size={32} color="#CBD5E1" />
            <Text style={styles.emptyText}>반에 배정된 후 확인할 수 있어요</Text>
          </View>
        )}

        {!error && user?.class_id && (
          <>
            {/* ── 스탬프 카드 컬렉션 ── */}
            <View style={styles.stampSection}>
              {/* 섹션 헤더 — 완성한 카드 수 표시 */}
              <View style={styles.stampSectionHeader}>
                <View>
                  <Text style={styles.stampSectionTitle}>스탬프 카드</Text>
                  <Text style={styles.stampSectionSub}>숙제를 마감 전에 제출하면 스탬프가 찍혀요</Text>
                </View>
                {completedCards > 0 && (
                  <View style={styles.collectionBadge}>
                    <Text style={styles.collectionBadgeText}>🏆 {completedCards}장 완성</Text>
                  </View>
                )}
              </View>

              {/* ── 완성된 카드 목록 (기본 접힘) ── */}
              {Array.from({ length: completedCards }, (_, cardIdx) => {
                const isExpanded = expandedCards.has(cardIdx);
                return (
                  <TouchableOpacity
                    key={cardIdx}
                    style={styles.stampCardCompleted}
                    onPress={() => toggleCard(cardIdx)}
                    activeOpacity={0.8}
                  >
                    {/* 카드 헤더 — 항상 표시 */}
                    <View style={styles.stampCardHeader}>
                      <View style={styles.stampCardHeaderLeft}>
                        <Text style={styles.stampCardTitle}>{cardIdx + 1}번째 카드</Text>
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                          <Text style={styles.completedBadgeText}>완성!</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#64748B"
                      />
                    </View>

                    {/* 스탬프 그리드 — 펼쳤을 때만 표시 */}
                    {isExpanded && (
                      <View style={styles.stampGrid}>
                        {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
                          <View key={i} style={styles.stampCircleCompleted}>
                            <Ionicons name="checkmark" size={16} color="#fff" />
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* ── 진행 중인 카드 (항상 펼침) ── */}
              <View style={styles.stampCard}>
                <View style={styles.stampCardHeader}>
                  <View style={styles.stampCardHeaderLeft}>
                    <Text style={styles.stampCardTitle}>{completedCards + 1}번째 카드</Text>
                    <Text style={styles.stampCardLabel}>진행 중</Text>
                  </View>
                  <Text style={styles.stampCardProgress}>
                    {currentProgress} / {STAMPS_PER_CARD}
                  </Text>
                </View>
                <View style={styles.stampGrid}>
                  {Array.from({ length: STAMPS_PER_CARD }, (_, i) => {
                    const isFilled = i < currentProgress;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stampCircle,
                          isFilled ? styles.stampCircleActive : styles.stampCircleEmpty,
                        ]}
                      >
                        {isFilled && (
                          <Ionicons name="checkmark" size={16} color="#059669" />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* ── 차트 ── */}
            <StreakChart data={streakData} />

            {/* ── 통계 카드 ── */}
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>최근 한 달 통계</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.statCount}>{submittedCount}개</Text>
                  <Text style={styles.statLabel}>마감 전 제출</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.statCount}>{lateCount}개</Text>
                  <Text style={styles.statLabel}>지각 제출</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.statCount}>{missedCount}개</Text>
                  <Text style={styles.statLabel}>미제출</Text>
                </View>
              </View>
              {totalHwCount > 0 && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>제출률</Text>
                  <Text style={styles.rateValue}>{submitRate}%</Text>
                </View>
              )}
            </View>

            {/* ── 규칙 안내 ── */}
            <View style={styles.ruleCard}>
              <Text style={styles.ruleTitle}>이렇게 기록돼요</Text>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.ruleText}>마감 전 제출하면 연속 기록이 +1 늘어요</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.ruleText}>마감 후 제출(지각)하면 연속 기록이 초기화돼요</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.ruleText}>미제출하면 연속 기록이 초기화돼요</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── 카드 완성 축하 팝업 ── */}
      <Modal
        visible={showCelebration}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCelebration(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>{completedCards}번째 카드 완성!</Text>
            <Text style={styles.modalSub}>
              스탬프 {completedCards * STAMPS_PER_CARD}개를 모았어요.{'\n'}정말 대단해요!
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setShowCelebration(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalBtnText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  // ── 콘텐츠 ──
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  // ── 오류 / 빈 상태 ──
  errorBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  errorText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  errorSub: { fontSize: 13, color: '#94A3B8' },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#475569' },

  // ── 스탬프 카드 섹션 ──
  stampSection: { gap: 10 },
  stampSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stampSectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  stampSectionSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  collectionBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  collectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  // ── 완성된 카드 (접힘) ──
  stampCardCompleted: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },

  // ── 진행 중인 카드 ──
  stampCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  stampCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stampCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stampCardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  stampCardLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  stampCardProgress: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completedBadgeText: { fontSize: 11, fontWeight: '700', color: '#065F46' },

  // ── 스탬프 그리드 ──
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stampCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  stampCircleActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
  },
  stampCircleCompleted: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  stampCircleEmpty: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },

  // ── 통계 카드 ──
  statsCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  statsTitle: { fontSize: 13, fontWeight: '700', color: '#475569' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', gap: 4 },
  statDot: { width: 10, height: 10, borderRadius: 5 },
  statCount: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#64748B' },
  statDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  rateLabel: { fontSize: 13, color: '#64748B' },
  rateValue: { fontSize: 20, fontWeight: '800', color: '#5B50E8' },

  // ── 규칙 안내 ──
  ruleCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  ruleTitle: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 2 },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  ruleText: { fontSize: 13, color: '#475569', flex: 1, lineHeight: 19 },

  // ── 축하 팝업 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  modalEmoji: { fontSize: 48 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  modalSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalBtn: {
    marginTop: 8,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
