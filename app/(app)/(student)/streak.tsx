/**
 * app/(app)/(student)/streak.tsx — 스트릭 상세 화면
 *
 * 학생의 최근 30일 숙제 제출 기록을 차트로 보여주고,
 * 연속 제출 현황과 통계를 표시한다.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/useAuthStore';
import StreakChart from '../../../components/StreakChart';
import { fetchStreakData, DayStreak } from '../../../lib/streak';

export default function StreakScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [streakData, setStreakData] = useState<DayStreak[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // 최근 30일 스트릭 데이터 조회
  useEffect(() => {
    if (!user?.uid || !user?.class_id) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await fetchStreakData(user.uid, user.class_id!);
        setStreakData(data);
      } catch (e) {
        console.error('[Streak] 데이터 조회 실패:', e);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.uid, user?.class_id]);

  // 통계 계산
  const submittedCount = streakData.filter(d => d.status === 'submitted').length;
  const lateCount = streakData.filter(d => d.status === 'late').length;
  const missedCount = streakData.filter(d => d.status === 'missed').length;
  // 숙제가 있었던 날만 계산 (none 제외)
  const totalHwDays = submittedCount + lateCount + missedCount;
  // 제출률 = (제출 + 지각) / 전체 숙제 있는 날
  const submitRate = totalHwDays > 0
    ? Math.round(((submittedCount + lateCount) / totalHwDays) * 100)
    : 0;

  // ── 로딩 ──
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
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>스트릭 상세</Text>
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

        {/* ── 스트릭 차트 ── */}
        {!error && user?.class_id && (
          <>
            <StreakChart
              data={streakData}
              currentStreak={user.streak ?? 0}
            />

            {/* ── 30일 통계 카드 ── */}
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>최근 30일 통계</Text>
              <View style={styles.statsRow}>
                {/* 제출 */}
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.statCount}>{submittedCount}일</Text>
                  <Text style={styles.statLabel}>마감 전 제출</Text>
                </View>
                {/* 지각 */}
                <View style={[styles.statDivider]} />
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.statCount}>{lateCount}일</Text>
                  <Text style={styles.statLabel}>지각 제출</Text>
                </View>
                {/* 미제출 */}
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.statCount}>{missedCount}일</Text>
                  <Text style={styles.statLabel}>미제출</Text>
                </View>
              </View>

              {/* 제출률 */}
              {totalHwDays > 0 && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>제출률</Text>
                  <Text style={styles.rateValue}>{submitRate}%</Text>
                </View>
              )}
            </View>

            {/* ── 스트릭 규칙 안내 ── */}
            <View style={styles.ruleCard}>
              <Text style={styles.ruleTitle}>스트릭 규칙</Text>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.ruleText}>마감 전 제출하면 스트릭이 +1 증가해요</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.ruleText}>마감 후 제출(지각)하면 스트릭이 초기화돼요</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={[styles.ruleDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.ruleText}>미제출하면 스트릭이 초기화돼요</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
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
  statDivider: {
    width: 1, height: 40,
    backgroundColor: '#E2E8F0',
  },
  // 제출률
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

  // ── 규칙 안내 카드 ──
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
});
