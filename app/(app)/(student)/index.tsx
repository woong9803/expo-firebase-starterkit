import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Homework, Notice } from '../../../types';

// 스트릭 막대 개수 (고정 장식용)
const BAR_COUNT = 14;

export default function StudentHomeScreen() {
  const { user } = useAuthStore();
  const streak = user?.streak ?? 0;

  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.academy_id) { setIsLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(
          query(
            Collections.notices(),
            where('academy_id', '==', user.academy_id),
            orderBy('created_at', 'desc'),
            limit(3),
          )
        );
        setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
      } catch (e) {
        console.error('[StudentHome] 공지 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id]);

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color="#5B50E8" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 (흰 배경) ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>안녕하세요! 👋</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name ?? ''}</Text>
            {/* 스트릭 뱃지 — 인라인, 작게 */}
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>🔥 {streak}일</Text>
            </View>
          </View>
        </View>
        {/* 알림 아이콘 */}
        <View style={styles.bellBtn}>
          <Text style={styles.bellEmoji}>🔔</Text>
        </View>
      </View>

      {/* ── 스트릭 카드 (초록 그라데이션) ── */}
      <View style={styles.sectionPad}>
        <LinearGradient
          colors={['#10B981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.streakCard}
        >
          <View style={styles.streakTop}>
            <View>
              <Text style={styles.streakLabel}>연속 제출 스트릭</Text>
              <Text style={styles.streakNum}>🔥 {streak}일</Text>
            </View>
            <View>
              <Text style={styles.streakRightText}>마감 전 제출 기준</Text>
              <Text style={styles.streakRightText}>지각 시 초기화</Text>
            </View>
          </View>
          {/* 막대 그래프 */}
          <View style={styles.barChart}>
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: 12 + (i % 4) * 6,
                    backgroundColor: i >= BAR_COUNT - Math.min(streak, BAR_COUNT) ? '#fff' : 'rgba(255,255,255,0.3)',
                  },
                ]}
              />
            ))}
          </View>
        </LinearGradient>
      </View>

      {/* ── 내 숙제 ── */}
      <View style={styles.sectionPad}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>✏️ 내 숙제</Text>
          <TouchableOpacity><Text style={styles.sectionLink}>전체</Text></TouchableOpacity>
        </View>

        <Text style={styles.emptyText}>제출할 숙제가 없어요</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { paddingBottom: 32 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 13, color: '#64748B' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  name: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  streakBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakBadgeText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  bellEmoji: { fontSize: 18 },

  // ── 공통 패딩 ──
  sectionPad: { paddingHorizontal: 16, marginTop: 16 },

  // ── 스트릭 카드 ──
  streakCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  streakTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  streakLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  streakNum: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 2 },
  streakRightText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 8, borderRadius: 2 },

  // ── 섹션 헤더 ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  sectionLink: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // ── 숙제 목록 ──
  hwList: { gap: 10 },

  // 공통 카드 구조
  hwBody: { flex: 1, padding: 14 },
  hwTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hwTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  hwSub: { fontSize: 11, color: '#64748B', marginTop: 2 },

  // D-0 카드
  hwUrgent: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  hwUrgentBar: { width: 3, backgroundColor: '#EF4444' },
  chipD0: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  chipD0Text: { fontSize: 10, fontWeight: '700', color: '#991B1B' },
  submitBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 10, height: 44,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // D-n 카드
  hwNormal: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  hwNormalBar: { width: 3, backgroundColor: '#5B50E8' },
  chipDn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  chipDnText: { fontSize: 10, fontWeight: '700', color: '#334155' },
  chipPending: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
    marginTop: 8,
  },
  chipPendingText: { fontSize: 10, fontWeight: '600', color: '#334155' },

  // 완료 카드
  hwDone: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  hwDoneBar: { width: 3, backgroundColor: '#10B981' },
  chipDone: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  chipDoneText: { fontSize: 10, fontWeight: '700', color: '#065F46' },
  hwFeedback: { fontSize: 11, color: '#10B981', fontWeight: '600', marginTop: 4 },

  // ── 중요 공지 카드 ──
  noticeCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 14,
  },
  noticeTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  noticeRedDot: { fontSize: 14 },
  noticeImportantLabel: { fontSize: 12, fontWeight: '700', color: '#991B1B' },
  noticeTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  noticeBody: { fontSize: 12, color: '#991B1B', marginTop: 2 },
});
