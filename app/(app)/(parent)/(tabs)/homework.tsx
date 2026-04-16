/**
 * app/(app)/(parent)/homework.tsx — 학부모 자녀 숙제 현황
 *
 * - user.children[0] 또는 params.childUid 기준으로 자녀 선택
 * - 해당 자녀 반의 전체 숙제 목록 실시간 조회
 * - 각 숙제별 자녀 제출 여부/피드백 표시
 * - 카드 탭 시 child-homework 상세 화면으로 이동
 * - 다자녀(2명 이상)이면 상단 '자녀 전환' 버튼 표시
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  onSnapshot,
  query,
  where,
  orderBy,
  getDoc,
} from 'firebase/firestore';

import { useAuthStore } from '../../../../store/useAuthStore';
import { Collections } from '../../../../lib/firestore';
import { strings } from '../../../../constants/strings';
import type { User, Homework, Submission } from '../../../../types';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

interface HomeworkWithStatus extends Homework {
  submitted: boolean;
  subStatus: 'submitted' | 'checked' | null; // Firestore submission.status
  feedback: '👍' | '💧' | null;
  feedback_comment?: string;
}

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatDueDate(hw: Homework): string {
  const d = hw.due_date.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} 마감`;
}

// ─────────────────────────────────────────────────────────────
// 숙제 카드 컴포넌트
// ─────────────────────────────────────────────────────────────

interface HwCardProps {
  hw: HomeworkWithStatus;
  onPress: () => void;
}

function HwCard({ hw, onPress }: HwCardProps) {
  // 마감 초과 여부 (오늘 자정 기준)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = hw.due_date.toDate();
  due.setHours(0, 0, 0, 0);
  const isPastDue = due.getTime() < today.getTime();

  // 5가지 상태 분류
  const isRetry    = hw.subStatus === 'checked' && hw.feedback === '💧';
  const isDone     = hw.subStatus === 'checked' && hw.feedback !== '💧';
  const isWaiting  = hw.subStatus === 'submitted'; // 제출 후 검사 전
  const isOverdue  = !isRetry && !isDone && !isWaiting && isPastDue;  // 마감 초과 미제출
  // 위 넷 모두 false면 마감 전 미제출 (중립)

  const cardStyle = isRetry   ? styles.cardRetry   :
                    isDone    ? styles.cardDone     :
                    isWaiting ? styles.cardWaiting  :
                    isOverdue ? styles.cardMissing  :
                    styles.card; // 마감 전 미제출 — 기본 흰 카드

  const barStyle  = isRetry   ? styles.cardBarRetry   :
                    isDone    ? styles.cardBarDone     :
                    isWaiting ? styles.cardBarWaiting  :
                    isOverdue ? styles.cardBarMissing  :
                    styles.cardBarPending; // 마감 전 — 회색

  const badgeStyle     = isRetry   ? styles.badgeRetry   :
                         isDone    ? styles.badgeDone     :
                         isWaiting ? styles.badgeWaiting  :
                         isOverdue ? styles.badgeMissing  :
                         styles.badgePending; // 마감 전 — 회색

  const badgeTextStyle = isRetry   ? styles.badgeRetryText   :
                         isDone    ? styles.badgeDoneText     :
                         isWaiting ? styles.badgeWaitingText  :
                         isOverdue ? styles.badgeMissingText  :
                         styles.badgePendingText;

  const badgeLabel = isRetry   ? strings.parent.feedbackRetry :
                     isDone    ? strings.parent.done           :
                     isWaiting ? strings.parent.submitted      :
                     isOverdue ? strings.parent.notSubmitted   :
                     '미제출';

  return (
    <TouchableOpacity
      style={[styles.card, cardStyle]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* 좌측 세로바 */}
      <View style={[styles.cardBar, barStyle]} />

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{hw.title}</Text>
        <Text style={styles.cardDue}>{formatDueDate(hw)}</Text>
        {/* 💧 상태일 때 선생님 코멘트 미리보기 */}
        {isRetry && !!hw.feedback_comment && (
          <Text style={styles.cardComment} numberOfLines={1}>{hw.feedback_comment}</Text>
        )}
      </View>

      {/* 상태 뱃지 */}
      <View style={[styles.statusBadge, badgeStyle]}>
        <Text style={[styles.statusBadgeText, badgeTextStyle]}>{badgeLabel}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={styles.chevron} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────

export default function ParentHomeworkScreen() {
  const insets = useSafeAreaInsets();
  const { user, selectedChildUid, setSelectedChildUid } = useAuthStore();

  // params.childUid > store selectedChildUid > 첫 번째 자녀 순으로 우선순위 결정
  const { childUid: paramChildUid } = useLocalSearchParams<{ childUid?: string }>();
  const activeChildUid = paramChildUid ?? selectedChildUid ?? user?.children?.[0] ?? null;

  // children-switch에서 params로 넘어왔을 때 store 동기화
  useEffect(() => {
    if (paramChildUid && paramChildUid !== selectedChildUid) {
      setSelectedChildUid(paramChildUid);
    }
  }, [paramChildUid]);

  const [childUser, setChildUser] = useState<User | null>(null);
  // 숙제 원본 목록과 제출 맵을 분리 — 각각 실시간 구독
  const [rawHomeworks, setRawHomeworks] = useState<Homework[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, Submission | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  // ── 자녀 User 문서 조회 ─────────────────────────────────────
  useEffect(() => {
    if (!activeChildUid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getDoc(Collections.user(activeChildUid))
      .then((snap) => {
        if (snap.exists()) {
          setChildUser({ uid: snap.id, ...snap.data() } as User);
        }
      })
      .catch((e) => console.warn('[ParentHomework] 자녀 조회 오류:', e));
  }, [activeChildUid]);

  // ── 반 숙제 실시간 구독 ─────────────────────────────────────
  useEffect(() => {
    if (!childUser?.class_id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(
      Collections.homeworks(),
      where('class_id', '==', childUser.class_id),
      orderBy('due_date', 'asc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Homework));
        setRawHomeworks(list);
        setIsLoading(false);
      },
      (err) => {
        console.warn('[ParentHomework] 숙제 onSnapshot 오류:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [childUser?.class_id]);

  // ── 각 숙제 제출 상태 실시간 구독 ──────────────────────────
  // 학생이 제출하거나 선생님이 피드백을 줄 때 즉시 반영하기 위해
  // 각 submission 문서를 개별 onSnapshot으로 구독
  useEffect(() => {
    if (!childUser?.uid || rawHomeworks.length === 0) return;

    const unsubs = rawHomeworks.map((hw) =>
      onSnapshot(
        Collections.submission(hw.id, childUser.uid),
        (snap) => {
          const sub = snap.exists() ? (snap.data() as Submission) : null;
          setSubmissionsMap((prev) => ({ ...prev, [hw.id]: sub }));
        },
        (err) => console.warn(`[ParentHomework] submission(${hw.id}) 구독 오류:`, err)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [rawHomeworks, childUser?.uid]);

  // ── 숙제 + 제출 상태 병합 ───────────────────────────────────
  const homeworks = useMemo<HomeworkWithStatus[]>(() =>
    rawHomeworks.map((hw) => {
      const sub = submissionsMap[hw.id] ?? null;
      return {
        ...hw,
        submitted: !!sub,
        subStatus: sub?.status ?? null,
        feedback: sub?.feedback ?? null,
        feedback_comment: sub?.feedback_comment ?? '',
      };
    }),
    [rawHomeworks, submissionsMap]
  );

  // ── 숙제 카드 탭 ────────────────────────────────────────────
  const handleHwPress = useCallback((hw: HomeworkWithStatus) => {
    router.push(
      `/(app)/(parent)/child-homework?homeworkId=${hw.id}&childUid=${activeChildUid}`
    );
  }, [activeChildUid]);

  // ── 다자녀 전환 버튼 탭 ──────────────────────────────────────
  const handleSwitchChild = useCallback(() => {
    router.push('/(app)/(parent)/children-switch');
  }, []);

  const hasMultipleChildren = (user?.children?.length ?? 0) > 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{strings.parent.childHomework}</Text>
          {childUser && (
            <Text style={styles.headerSub}>{childUser.name}</Text>
          )}
        </View>

        {/* 다자녀 전환 버튼 (2명 이상일 때만) */}
        {hasMultipleChildren && (
          <TouchableOpacity style={styles.switchBtn} onPress={handleSwitchChild} activeOpacity={0.7}>
            <Ionicons name="people-outline" size={16} color="#F59E0B" />
            <Text style={styles.switchBtnText}>{strings.parent.switchChild}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#F59E0B" size="large" />
        </View>
      )}

      {/* ── 자녀 없음 ── */}
      {!isLoading && !activeChildUid && (
        <View style={styles.centerBox}>
          <Text style={styles.emptyIcon}>👨‍👧</Text>
          <Text style={styles.emptyText}>{strings.parent.noChildren}</Text>
        </View>
      )}

      {/* ── 숙제 목록 ── */}
      {!isLoading && activeChildUid && (
        <FlatList
          data={homeworks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <HwCard hw={item} onPress={() => handleHwPress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyText}>{strings.parent.noHomework}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  switchBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },

  // ── 중앙 배치 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },

  // ── 목록 ──
  listContent: {
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },

  // ── 숙제 카드 ──
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
  },
  cardMissing:  { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },  // 미제출 — 빨강
  cardWaiting:  { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },  // 검사대기 — 노랑
  cardRetry:    { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },  // 다시제출 — 주황
  cardDone:     { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' },  // 완료 — 초록

  cardBar: { width: 4, alignSelf: 'stretch' },
  cardBarMissing:  { backgroundColor: '#EF4444' },
  cardBarWaiting:  { backgroundColor: '#F59E0B' },
  cardBarRetry:    { backgroundColor: '#F97316' },
  cardBarDone:     { backgroundColor: '#10B981' },
  cardBarPending:  { backgroundColor: '#CBD5E1' }, // 마감 전 미제출 — 회색

  cardContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  cardDue:   { fontSize: 12, color: '#64748B' },
  cardComment: { fontSize: 12, color: '#C2410C', marginTop: 4 },

  // ── 상태 뱃지 ──
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
  badgeMissing:  { backgroundColor: '#FEE2E2' },
  badgeWaiting:  { backgroundColor: '#FEF3C7' },
  badgeRetry:    { backgroundColor: '#FFEDD5' },
  badgeDone:     { backgroundColor: '#ECFDF5' },
  badgePending:  { backgroundColor: '#F1F5F9' }, // 마감 전 미제출 — 회색
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  badgeMissingText:  { color: '#991B1B' },
  badgeWaitingText:  { color: '#78350F' },
  badgeRetryText:    { color: '#C2410C' },
  badgeDoneText:     { color: '#065F46' },
  badgePendingText:  { color: '#64748B' }, // 마감 전 미제출 — 회색

  // ── 화살표 ──
  chevron: { marginRight: 12 },
});
