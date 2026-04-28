import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { query, where, onSnapshot, getDoc } from 'firebase/firestore';
import { Collections } from '../../../../lib/firestore';
import { subscribeNotices } from '../../../../lib/notice';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useNotificationStore } from '../../../../store/useNotificationStore';
import { Homework, Submission, Notice } from '../../../../types';

// 스탬프 카드 한 장당 스탬프 수
const STAMPS_PER_CARD = 10;

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

  // 공지 실시간 구독 — 내 반(class_id) + 역할(student) 기반 필터링 적용
  // subscribeNotices가 target_class_ids / target_roles를 클라이언트에서 필터링해줌
  useEffect(() => {
    if (!user?.academy_id) return;
    const unsub = subscribeNotices(
      user.academy_id,
      (list) => setNotices(list.slice(0, 3)),
      user.class_id,  // 내 반에 해당하는 공지만 표시
      'student',      // 학생 대상 공지만 표시
    );
    return () => unsub();
  }, [user?.academy_id, user?.class_id]);

  // 숙제 실시간 구독 — 화면 포커스 시마다 재구독해 제출 여부도 함께 갱신
  // 이유: homeworks 컬렉션의 onSnapshot 만으로는 submissions 변경(제출 완료)이 감지되지 않음.
  //       useFocusEffect로 감싸면 학생이 제출 후 홈으로 돌아올 때마다 onSnapshot 첫 이벤트가
  //       다시 발생해 submissions까지 새로 fetch → "지금 제출하기" 버튼이 즉시 사라짐.
  useFocusEffect(
    useCallback(() => {
      if (!user?.class_id || !user?.uid) { setIsLoading(false); return; }

      let cancelled = false;
      setIsLoading(true);

      const unsub = onSnapshot(
        query(Collections.homeworks(), where('class_id', '==', user.class_id)),
        (snap) => {
          (async () => {
            const hwList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));

            // 각 숙제의 제출 여부를 병렬로 확인
            const hwWithSubs = await Promise.all(
              hwList.map(async (hw) => {
                const subSnap = await getDoc(Collections.submission(hw.id, user.uid));
                const sub = subSnap.exists() ? (subSnap.data() as Submission) : null;
                return {
                  ...hw,
                  submitted: !!sub,
                  needsRetry: sub?.feedback === '💧',
                  feedback: sub?.feedback ?? null,
                  isLate: sub?.is_late ?? false,
                  dDays: calcDDays(hw.due_date),
                } as HwItem;
              })
            );

            if (cancelled) return;

            // 제출이 필요한 숙제만 표시 (미제출 + 다시풀기 대상)
            const pendingHws = hwWithSubs.filter((hw) => !hw.submitted || hw.needsRetry);
            pendingHws.sort((a, b) => {
              if (a.needsRetry !== b.needsRetry) return a.needsRetry ? -1 : 1;
              return a.dDays - b.dDays;
            });
            setHomeworks(pendingHws);
            setIsLoading(false);
          })();
        },
        (e) => {
          console.error('[StudentHome] 숙제 구독 실패:', e);
          if (!cancelled) setIsLoading(false);
        }
      );

      return () => { cancelled = true; unsub(); };
    }, [user?.uid, user?.class_id]),
  );

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
          <Text style={styles.greeting}>꾸준함이 실력이에요</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name ?? ''}</Text>
            {/* 스트릭 뱃지 — 인라인, 작게 */}
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>{streak}일</Text>
            </View>
          </View>
        </View>
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

      {/* ── 스트릭 카드 (초록 그라데이션) — 탭 시 상세 화면으로 이동 ── */}
      <View style={styles.sectionPad}>
        <TouchableOpacity
          onPress={() => router.push('/(app)/(student)/streak')}
          activeOpacity={0.9}
        >
        <LinearGradient
          colors={['#10B981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.streakCard}
        >
          {/* 상단: 스트릭 숫자 + 카드 진행 표시 */}
          <View style={styles.streakTop}>
            <Text style={styles.streakNum}>{streak}일째 숙제 완료</Text>
            <View style={styles.streakCardBadge}>
              <Text style={styles.streakCardBadgeText}>
                {Math.floor(streak / STAMPS_PER_CARD) + 1}번째 카드
              </Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
          {/* 미니 스탬프 미리보기 — 현재 카드 진행도 */}
          <View style={styles.stampRow}>
            {Array.from({ length: STAMPS_PER_CARD }, (_, i) => {
              // 현재 카드에서 몇 번째 스탬프까지 찍혔는지
              const progressOnCard = streak % STAMPS_PER_CARD === 0 && streak > 0
                ? STAMPS_PER_CARD
                : streak % STAMPS_PER_CARD;
              const isFilled = i < progressOnCard;
              return (
                <View
                  key={i}
                  style={[styles.stamp, isFilled ? styles.stampFilled : styles.stampEmpty]}
                >
                  {isFilled && <Ionicons name="checkmark" size={12} color="#059669" />}
                </View>
              );
            })}
          </View>
          {/* 진행 텍스트 */}
          <Text style={styles.stampProgress}>
            {streak % STAMPS_PER_CARD === 0 && streak > 0 ? STAMPS_PER_CARD : streak % STAMPS_PER_CARD}
            {' / '}{STAMPS_PER_CARD} 완료 · 눌러서 전체 보기
          </Text>
        </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── 빠른 작업 ── */}
      <View style={styles.sectionPad}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>빠른 작업</Text>
        <View style={styles.quickRow}>
          {/* 숙제 제출 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(student)/(tabs)/homework')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EEEDF9' }]}>
              <Ionicons name="camera-outline" size={20} color="#5B50E8" />
            </View>
            <Text style={styles.quickLabel}>숙제 제출</Text>
          </TouchableOpacity>
          {/* 출결 확인 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(student)/(tabs)/attendance')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="calendar-outline" size={20} color="#EF4444" />
            </View>
            <Text style={styles.quickLabel}>출결 확인</Text>
          </TouchableOpacity>
          {/* 영상 보기 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(student)/(tabs)/videos')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="videocam-outline" size={20} color="#10B981" />
            </View>
            <Text style={styles.quickLabel}>영상 보기</Text>
          </TouchableOpacity>
          {/* 공지 보기 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/common/notice-list')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="megaphone-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.quickLabel}>공지 보기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 내 숙제 ── */}
      <View style={styles.sectionPad}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>내 숙제</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/(student)/(tabs)/homework')} activeOpacity={0.7}>
            <Text style={styles.sectionLink}>전체보기</Text>
          </TouchableOpacity>
        </View>

        {!user?.class_id ? (
          <Text style={styles.emptyText}>반에 배정된 후 숙제가 표시돼요</Text>
        ) : homeworks.length === 0 ? (
          <Text style={styles.emptyText}>제출할 숙제가 없어요</Text>
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
                          <Text style={styles.chipRetryText}>다시풀기</Text>
                        </View>
                      </View>
                      <Text style={styles.hwSub}>마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}</Text>
                      <TouchableOpacity
                        style={styles.submitBtn}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/(app)/(student)/homework-submit?hwId=${hw.id}&skipAlert=true`)}
                      >
                        <Text style={styles.submitBtnText}>다시 제출하기</Text>
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
                        <Text style={styles.submitBtnText}>지금 제출하기</Text>
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

      {/* ── 최근 공지 ── */}
      <View style={styles.sectionPad}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>최근 공지</Text>
          <TouchableOpacity
            onPress={() => router.push('/common/notice-list')}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionLink}>전체보기</Text>
          </TouchableOpacity>
        </View>
        {notices.length === 0 ? (
          <Text style={styles.emptyText}>등록된 공지가 없어요</Text>
        ) : (
          notices.map((n) => (
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
                    {/* serverTimestamp() 는 onSnapshot 첫 이벤트에서 null 로 들어올 수 있음 — 가드 필수 */}
                    {n.created_at
                      ? (n.created_at as any).toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
                      : ''}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

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
    alignItems: 'center',
    marginBottom: 14,
  },
  streakNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  streakCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakCardBadgeText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  // 미니 스탬프
  stampRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  stamp: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  stampFilled: { backgroundColor: '#fff' },
  stampEmpty: { backgroundColor: 'rgba(255,255,255,0.25)' },
  stampProgress: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },

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

  // ── 빠른 작업 ──
  quickRow: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

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
