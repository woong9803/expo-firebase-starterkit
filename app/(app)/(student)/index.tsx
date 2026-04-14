import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { query, where, getDocs, getDoc, orderBy, limit } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { Homework, Submission, Notice } from '../../../types';

// 스트릭 막대 개수 (고정 장식용)
const BAR_COUNT = 14;

// 숙제 + 제출 상태를 합친 타입
interface HwItem extends Homework {
  submitted: boolean;
  needsRetry: boolean; // 선생님이 💧(다시풀기) 피드백 → 재제출 필요
  feedback: '👍' | '💧' | null;
  isLate: boolean;
  dDays: number; // 0=오늘, 양수=남은 일수, 음수=마감 초과
}

// D-day 계산 (날짜 기준, 시간 무시)
function calcDDays(dueTimestamp: Homework['due_date']): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = dueTimestamp.toDate();
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export default function StudentHomeScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const streak = user?.streak ?? 0;
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const [homeworks, setHomeworks] = useState<HwItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.academy_id) { setIsLoading(false); return; }
    (async () => {
      try {
        // 공지 최신 3건 조회
        const noticeSnap = await getDocs(
          query(
            Collections.notices(),
            where('academy_id', '==', user.academy_id),
            orderBy('created_at', 'desc'),
            limit(3),
          )
        );
        setNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));

        // 내 반 숙제 조회 (class_id가 있을 때만)
        if (user.class_id) {
          const hwSnap = await getDocs(
            query(Collections.homeworks(), where('class_id', '==', user.class_id))
          );
          const hwList = hwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));

          // 각 숙제의 제출 여부를 병렬로 확인
          const hwWithSubs = await Promise.all(
            hwList.map(async (hw) => {
              const subSnap = await getDoc(Collections.submission(hw.id, user.uid));
              const sub = subSnap.exists() ? (subSnap.data() as Submission) : null;
              return {
                ...hw,
                submitted: !!sub,
                needsRetry: sub?.feedback === '💧', // 선생님이 다시풀기 피드백 → 재제출 필요
                feedback: sub?.feedback ?? null,
                isLate: sub?.is_late ?? false,
                dDays: calcDDays(hw.due_date),
              } as HwItem;
            })
          );

          // 홈에는 제출이 필요한 숙제만 표시 (미제출 + 다시풀기 대상)
          // 제출완료(👍 or 검사 대기 중)는 홈에서 제외
          const pendingHws = hwWithSubs.filter((hw) => !hw.submitted || hw.needsRetry);

          // 정렬: 다시풀기 → D-0(긴급) → D-n(여유)
          pendingHws.sort((a, b) => {
            if (a.needsRetry !== b.needsRetry) return a.needsRetry ? -1 : 1;
            return a.dDays - b.dDays;
          });

          setHomeworks(pendingHws);
        }
      } catch (e) {
        console.error('[StudentHome] 데이터 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id, user?.class_id]);

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
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>꾸준함이 실력이에요 ✨</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name ?? ''}</Text>
            {/* 스트릭 뱃지 — 인라인, 작게 */}
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>🔥 {streak}일</Text>
            </View>
          </View>
        </View>
        {/* 우측 아이콘 버튼 묶음 */}
        <View style={styles.headerActions}>
          {/* 공지 확성기 버튼 */}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/common/notice-list')}
            activeOpacity={0.7}
          >
            <Ionicons name="megaphone-outline" size={21} color="#0F172A" />
          </TouchableOpacity>
          {/* 알림 벨 버튼 */}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/common/notification-inbox')}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={22} color="#0F172A" />
            {/* 미읽음 dot 배지 — 숫자 없이 점만 표시 (ui-screens.md 규칙) */}
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </TouchableOpacity>
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
              <Text style={styles.streakLabel}>연속 제출</Text>
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

        {!user?.class_id ? (
          <Text style={styles.emptyText}>반에 배정된 후 숙제가 표시돼요</Text>
        ) : homeworks.length === 0 ? (
          <Text style={styles.emptyText}>제출할 숙제가 없어요 🎉</Text>
        ) : (
          <View style={styles.hwList}>
            {homeworks.map((hw) => {
              // ── 다시 제출 필요 카드 (💧 다시풀기 피드백) ──
              if (hw.needsRetry) {
                return (
                  <View key={hw.id} style={styles.hwUrgent}>
                    <View style={styles.hwUrgentBar} />
                    <View style={styles.hwBody}>
                      <View style={styles.hwTopRow}>
                        <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                        <View style={styles.chipRetry}>
                          <Text style={styles.chipRetryText}>💧 다시풀기</Text>
                        </View>
                      </View>
                      <Text style={styles.hwSub}>마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}</Text>
                      <TouchableOpacity
                        style={styles.submitBtn}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/(app)/(student)/homework-submit?hwId=${hw.id}&skipAlert=true`)}
                      >
                        <Text style={styles.submitBtnText}>📷 다시 제출하기</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              // ── D-0 카드 (오늘 마감 또는 마감 초과) ──
              if (hw.dDays <= 0) {
                return (
                  <View key={hw.id} style={styles.hwUrgent}>
                    <View style={styles.hwUrgentBar} />
                    <View style={styles.hwBody}>
                      <View style={styles.hwTopRow}>
                        <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                        <View style={styles.chipD0}>
                          <Text style={styles.chipD0Text}>{hw.dDays === 0 ? 'D-0' : `D${hw.dDays}`}</Text>
                        </View>
                      </View>
                      <Text style={styles.hwSub}>마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}</Text>
                      <TouchableOpacity
                        style={styles.submitBtn}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/(app)/(student)/homework-submit?hwId=${hw.id}`)}
                      >
                        <Text style={styles.submitBtnText}>📷 지금 제출하기</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              // ── D-n 카드 (마감 남은 경우) ──
              return (
                <View key={hw.id} style={styles.hwNormal}>
                  <View style={styles.hwNormalBar} />
                  <View style={styles.hwBody}>
                    <View style={styles.hwTopRow}>
                      <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                      <View style={styles.chipDn}>
                        <Text style={styles.chipDnText}>D-{hw.dDays}</Text>
                      </View>
                    </View>
                    <Text style={styles.hwSub}>마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}</Text>
                    <TouchableOpacity
                      style={styles.chipPending}
                      activeOpacity={0.75}
                      onPress={() => router.push(`/(app)/(student)/homework-submit?hwId=${hw.id}`)}
                    >
                      <Text style={styles.chipPendingText}>미제출 · 제출하기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── 공지 ── */}
      {notices.length > 0 && (
        <View style={styles.sectionPad}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📢 최근 공지</Text>
            <TouchableOpacity
              onPress={() => router.push('/common/notice-list')}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionLink}>전체보기</Text>
            </TouchableOpacity>
          </View>
          {notices.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[styles.noticeCard, n.is_important ? styles.noticeCardImportant : styles.noticeCardNormal]}
              onPress={() => router.push(`/common/notice-detail?noticeId=${n.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.noticeRow}>
                {/* 좌측 세로바 */}
                <View style={[styles.noticeBar, n.is_important ? styles.noticeBarImportant : styles.noticeBarNormal]} />
                <View style={styles.noticeContent}>
                  {n.is_important && (
                    <View style={styles.importantChip}>
                      <Text style={styles.importantChipText}>중요</Text>
                    </View>
                  )}
                  <Text style={styles.noticeTitle}>{n.title}</Text>
                  <Text style={styles.noticeDate}>
                    {(n.created_at as any).toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
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
    paddingBottom: 14,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 14, color: '#64748B' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  name: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  streakBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakBadgeText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2, right: -2,
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  // ── 공통 패딩 ──
  sectionPad: { paddingHorizontal: 16, marginTop: 16 },

  // ── 스트릭 카드 ──
  streakCard: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  streakTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  streakLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  streakNum: { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 2 },
  streakRightText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 8, borderRadius: 2 },

  // ── 섹션 헤더 ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  sectionLink: { fontSize: 13, fontWeight: '700', color: '#5B50E8' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // ── 숙제 목록 ──
  hwList: { gap: 10 },

  // 공통 카드 구조
  hwBody: { flex: 1, padding: 14 },
  hwTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hwTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  hwSub: { fontSize: 12, color: '#64748B', marginTop: 2 },

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
  chipD0Text: { fontSize: 11, fontWeight: '700', color: '#991B1B' },
  submitBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 10, height: 44,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
  chipDnText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  chipPending: {
    alignSelf: 'flex-start',
    backgroundColor: '#5B50E8',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  chipPendingText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // 다시풀기 칩
  chipRetry: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  chipRetryText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  // ── 공지 카드 ──
  noticeCard: { borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  noticeCardImportant: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeCardNormal: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeRow: { flexDirection: 'row' },
  noticeBar: { width: 3 },
  noticeBarImportant: { backgroundColor: '#EF4444' },
  noticeBarNormal: { backgroundColor: '#CBD5E1' },
  noticeContent: { flex: 1, padding: 14 },
  importantChip: {
    backgroundColor: '#EF4444', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 7,
    alignSelf: 'flex-start', marginBottom: 4,
  },
  importantChipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  noticeDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
