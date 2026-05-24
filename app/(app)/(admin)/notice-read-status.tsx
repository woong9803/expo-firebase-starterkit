/**
 * app/(app)/(admin)/notice-read-status.tsx — 공지 읽음 현황 (admin, Pro 전용)
 *
 * router.params: noticeId (string)
 * - Pro 플랜이 아니면 ProUpgradeSheet 표시 후 뒤로 이동
 * - 반 필터 칩으로 특정 반 학생·학부모의 읽음/미읽음 확인
 */

import React, { useEffect, useState, useMemo } from 'react';
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
import { useAuthStore } from '../../../store/useAuthStore';
import { useProCheck } from '../../../hooks/useProCheck';
import { subscribeNoticeReadUsers } from '../../../lib/notice';
import { Collections } from '../../../lib/firestore';
import ClassPickerSheet from '../../../components/ClassPickerSheet';
import ProUpgradeSheet from '../../../components/ProUpgradeSheet';
import { strings } from '../../../constants/strings';
import type { User, Class } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 사용자 행 컴포넌트
// ─────────────────────────────────────────────────────────────

interface UserRowProps {
  user: User;
  isRead: boolean;
}

function UserRow({ user, isRead }: UserRowProps) {
  return (
    <View style={styles.userRow}>
      {/* 아바타 영역 */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {user.name.slice(0, 1)}
        </Text>
      </View>

      {/* 이름 + 역할 */}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userRole}>
          {user.role === 'student' ? strings.roles.student : strings.roles.parent}
        </Text>
      </View>

      {/* 읽음 여부 뱃지 */}
      <View style={[styles.badge, isRead ? styles.badgeRead : styles.badgeUnread]}>
        <Text style={[styles.badgeText, isRead ? styles.badgeTextRead : styles.badgeTextUnread]}>
          {isRead ? '읽음' : '미읽음'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────

export default function AdminNoticeReadStatusScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { noticeId } = useLocalSearchParams<{ noticeId: string }>();

  const { isPro, isLoaded, upgradeSheetVisible, showUpgradeSheet, hideUpgradeSheet } =
    useProCheck();

  const [readUsers, setReadUsers]     = useState<User[]>([]);
  const [unreadUsers, setUnreadUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // ── 학원 전체 반 목록 + 선택된 반 ──
  const [classes, setClasses]                   = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId]   = useState<string | null>(null); // null = 전체

  // ── Pro 체크 — academy 로드 후 판단 ─────────────────────────
  useEffect(() => {
    if (isLoaded && !isPro) showUpgradeSheet();
  // showUpgradeSheet는 useProCheck 내부에서 useCallback으로 안정화됨
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isPro]);

  // ── 학원 전체 반 로드 (admin은 assigned_class_ids 없이 academy_id로 전체 조회) ──
  useEffect(() => {
    if (!user?.academy_id) return;

    Collections.classes()
      .where('academy_id', '==', user.academy_id)
      .get()
      .then((snap) => {
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class)));
      })
      .catch((e) => console.warn('[NoticeReadStatus] 반 로드 오류:', e));
  }, [user?.academy_id]);

  // ── 읽음 현황 실시간 구독 ───────────────────────────────────
  // 학생/학부모가 공지를 읽으면 read_by가 갱신되고 즉시 반영된다
  useEffect(() => {
    if (!isPro || !noticeId || !user?.academy_id) return;

    setIsLoading(true);
    setError(null);

    const unsub = subscribeNoticeReadUsers(
      noticeId,
      user.academy_id,
      ({ readUsers: ru, unreadUsers: uu }) => {
        setReadUsers(ru);
        setUnreadUsers(uu);
        setIsLoading(false);
      },
      (e) => {
        console.warn('[NoticeReadStatus] 조회 오류:', e);
        setError(strings.common.error);
        setIsLoading(false);
      },
    );

    return () => unsub();
  }, [isPro, noticeId, user?.academy_id]);

  // ── 반 필터링 ──
  // 선택 반의 학생 uid 세트 (부모 필터링에 사용)
  const studentUidsInClass = useMemo(() => {
    if (!selectedClassId) return null;
    const allStudents = [...readUsers, ...unreadUsers].filter(
      (u) => u.role === 'student' && u.class_id === selectedClassId
    );
    return new Set(allStudents.map((u) => u.uid));
  }, [selectedClassId, readUsers, unreadUsers]);

  function filterByClass(users: User[]): User[] {
    if (!selectedClassId || !studentUidsInClass) return users;
    return users.filter((u) => {
      if (u.role === 'student') return u.class_id === selectedClassId;
      if (u.role === 'parent')  return u.children?.some((cid) => studentUidsInClass.has(cid));
      return false;
    });
  }

  const filteredRead   = filterByClass(readUsers);
  const filteredUnread = filterByClass(unreadUsers);

  // FlatList 데이터: 읽은 사람 → 미읽음 순
  const listData: Array<{ item: User; isRead: boolean }> = [
    ...filteredRead.map((u) => ({ item: u, isRead: true })),
    ...filteredUnread.map((u) => ({ item: u, isRead: false })),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.notice.readStatus}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ── 반 필터 드롭다운 ── */}
      {!isLoading && !error && classes.length > 0 && (
        <View style={styles.filterBar}>
          <ClassPickerSheet
            mode="single"
            classes={classes}
            selectedId={selectedClassId}
            showAllOption
            onSelectAll={() => setSelectedClassId(null)}
            onSelect={(id) => setSelectedClassId(id)}
          />
        </View>
      )}

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#5B50E8" size="large" />
        </View>
      )}

      {/* ── 오류 ── */}
      {!isLoading && error && (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── 목록 ── */}
      {!isLoading && !error && (
        <FlatList
          data={listData}
          keyExtractor={(d) => `${d.item.uid}-${d.isRead}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            filteredRead.length > 0 ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {strings.notice.readUsers} ({filteredRead.length})
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: d, index }) => {
            // 미읽음 섹션 헤더: 처음 미읽음 항목 앞에 삽입
            const isFirstUnread =
              !d.isRead && (index === 0 || listData[index - 1].isRead);

            return (
              <>
                {isFirstUnread && filteredUnread.length > 0 && (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                      {strings.notice.unreadUsers} ({filteredUnread.length})
                    </Text>
                  </View>
                )}
                <UserRow user={d.item} isRead={d.isRead} />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{strings.notice.noReaders}</Text>
            </View>
          }
        />
      )}

      {/* ── Pro 업그레이드 시트 ── */}
      <ProUpgradeSheet
        visible={upgradeSheetVisible}
        onClose={() => {
          hideUpgradeSheet();
          // Tabs 구조에서 router.back()이 홈으로 가는 버그 → 명시적으로 공지 탭으로 이동
          router.back();
        }}
        featureName={strings.notice.proFeatureName}
      />
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#ffffff',
  },
  backButton: {
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

  // ── 반 필터 바 ──
  filterBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  // ── 중앙 배치 (로딩/오류) ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // ── 섹션 헤더 ──
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── 빈 상태 ──
  emptyBox: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },

  // ── 목록 ──
  listContent: {
    paddingBottom: 32,
  },

  // ── 사용자 행 ──
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E6F1FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5B50E8',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  userRole: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // ── 읽음/미읽음 뱃지 ──
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeRead: {
    backgroundColor: '#ECFDF5',
  },
  badgeUnread: {
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextRead: {
    color: '#065F46',
  },
  badgeTextUnread: {
    color: '#64748B',
  },
});
