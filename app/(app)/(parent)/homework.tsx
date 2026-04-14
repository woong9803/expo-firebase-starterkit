/**
 * app/(app)/(parent)/homework.tsx — 학부모 자녀 숙제 현황
 *
 * - user.children[0] 또는 params.childUid 기준으로 자녀 선택
 * - 해당 자녀 반의 전체 숙제 목록 실시간 조회
 * - 각 숙제별 자녀 제출 여부/피드백 표시
 * - 카드 탭 시 child-homework 상세 화면으로 이동
 * - 다자녀(2명 이상)이면 상단 '자녀 전환' 버튼 표시
 */

import React, { useEffect, useState, useCallback } from 'react';
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

import { useAuthStore } from '../../../store/useAuthStore';
import { Collections } from '../../../lib/firestore';
import { strings } from '../../../constants/strings';
import type { User, Homework, Submission } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

interface HomeworkWithStatus extends Homework {
  submitted: boolean;
  feedback: '👍' | '💧' | null;
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
  return (
    <TouchableOpacity
      style={[
        styles.card,
        hw.submitted ? styles.cardDone : styles.cardPending,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* 제출 상태 좌측 세로바 */}
      <View style={[styles.cardBar, hw.submitted ? styles.cardBarDone : styles.cardBarPending]} />

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{hw.title}</Text>
        <Text style={styles.cardDue}>{formatDueDate(hw)}</Text>
      </View>

      {/* 피드백 칩 */}
      {hw.feedback && (
        <View style={[
          styles.feedbackChip,
          hw.feedback === '👍' ? styles.feedbackPass : styles.feedbackRetry,
        ]}>
          <Text style={[
            styles.feedbackText,
            hw.feedback === '👍' ? styles.feedbackPassText : styles.feedbackRetryText,
          ]}>
            {hw.feedback === '👍' ? strings.parent.feedbackPass : strings.parent.feedbackRetry}
          </Text>
        </View>
      )}

      {/* 제출 여부 뱃지 (피드백 없을 때) */}
      {!hw.feedback && (
        <View style={[
          styles.statusBadge,
          hw.submitted ? styles.statusBadgeDone : styles.statusBadgePending,
        ]}>
          <Text style={[
            styles.statusBadgeText,
            hw.submitted ? styles.statusBadgeDoneText : styles.statusBadgePendingText,
          ]}>
            {hw.submitted ? strings.parent.submitted : strings.parent.notSubmitted}
          </Text>
        </View>
      )}

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
  const [homeworks, setHomeworks] = useState<HomeworkWithStatus[]>([]);
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

  // ── 반 숙제 실시간 구독 + 제출 여부 조회 ───────────────────
  useEffect(() => {
    if (!childUser?.class_id || !childUser?.uid) {
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
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Homework));

        // 각 숙제에 대해 제출 여부/피드백 조회
        const withStatus = await Promise.all(
          list.map(async (hw) => {
            try {
              const subSnap = await getDoc(Collections.submission(hw.id, childUser.uid));
              const sub = subSnap.exists() ? (subSnap.data() as Submission) : null;
              return {
                ...hw,
                submitted: !!sub,
                feedback: sub?.feedback ?? null,
              } as HomeworkWithStatus;
            } catch {
              return { ...hw, submitted: false, feedback: null } as HomeworkWithStatus;
            }
          })
        );

        setHomeworks(withStatus);
        setIsLoading(false);
      },
      (err) => {
        console.warn('[ParentHomework] onSnapshot 오류:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [childUser?.class_id, childUser?.uid]);

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
    borderColor: '#E2E8F0',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  cardDone: {
    backgroundColor: '#F0FDF4',
    borderColor: '#A7F3D0',
  },
  cardPending: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  cardBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardBarDone: {
    backgroundColor: '#10B981',
  },
  cardBarPending: {
    backgroundColor: '#EF4444',
  },
  cardContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardDue: {
    fontSize: 12,
    color: '#64748B',
  },

  // ── 피드백 칩 ──
  feedbackChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  feedbackPass: {
    backgroundColor: '#ECFDF5',
  },
  feedbackRetry: {
    backgroundColor: '#FEF2F2',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackPassText: {
    color: '#065F46',
  },
  feedbackRetryText: {
    color: '#991B1B',
  },

  // ── 제출 여부 뱃지 ──
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  statusBadgeDone: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgePending: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeDoneText: {
    color: '#065F46',
  },
  statusBadgePendingText: {
    color: '#991B1B',
  },

  // ── 화살표 ──
  chevron: {
    marginRight: 12,
  },
});
