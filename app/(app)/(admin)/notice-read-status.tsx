/**
 * app/(app)/(admin)/notice-read-status.tsx — 공지 읽음 현황 (admin, Pro 전용)
 *
 * router.params: noticeId (string)
 * - Pro 플랜이 아니면 ProUpgradeSheet 표시 후 뒤로 이동
 * - 학생 + 학부모 대상으로 읽음/미읽음 사용자 목록 표시
 * - ReadProgressBar로 전체 진행률 시각화
 */

import React, { useEffect, useState } from 'react';
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
import { getNoticeReadUsers } from '../../../lib/notice';
import ReadProgressBar from '../../../components/ReadProgressBar';
import ProUpgradeSheet from '../../../components/ProUpgradeSheet';
import { strings } from '../../../constants/strings';
import type { User } from '../../../types';

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

  // ── Pro 체크 — academy 로드 후 판단 ─────────────────────────
  useEffect(() => {
    if (isLoaded && !isPro) showUpgradeSheet();
  }, [isLoaded, isPro]);

  // ── 읽음 현황 조회 ───────────────────────────────────────────
  useEffect(() => {
    if (!isPro || !noticeId || !user?.academy_id) return;

    setIsLoading(true);
    setError(null);

    getNoticeReadUsers(noticeId, user.academy_id)
      .then(({ readUsers: ru, unreadUsers: uu }) => {
        setReadUsers(ru);
        setUnreadUsers(uu);
      })
      .catch((e) => {
        console.warn('[NoticeReadStatus] 조회 오류:', e);
        setError(strings.common.error);
      })
      .finally(() => setIsLoading(false));
  }, [isPro, noticeId, user?.academy_id]);

  const totalCount = readUsers.length + unreadUsers.length;

  // ── 목록 데이터: 읽은 사람 → 미읽음 순 ──────────────────────
  const listData: Array<{ item: User; isRead: boolean }> = [
    ...readUsers.map((u) => ({ item: u, isRead: true })),
    ...unreadUsers.map((u) => ({ item: u, isRead: false })),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.navigate({
            pathname: '/common/notice-detail' as const,
            params: { noticeId: noticeId ?? '' },
          })}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.notice.readStatus}</Text>
        <View style={styles.headerRight} />
      </View>

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

      {/* ── 본문 ── */}
      {!isLoading && !error && (
        <>
          {/* 프로그레스 요약 카드 */}
          <View style={styles.summaryCard}>
            <ReadProgressBar
              readCount={readUsers.length}
              totalCount={totalCount}
            />
          </View>

          {/* 섹션 헤더: 읽은 사람 */}
          {readUsers.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {strings.notice.readUsers} ({readUsers.length})
              </Text>
            </View>
          )}

          {/* 읽은 사람 없을 때 안내 */}
          {readUsers.length === 0 && !isLoading && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{strings.notice.noReaders}</Text>
            </View>
          )}

          <FlatList
            data={listData}
            keyExtractor={(d) => `${d.item.uid}-${d.isRead}`}
            renderItem={({ item: d, index }) => {
              // 미읽음 섹션 헤더 삽입
              const isFirstUnread =
                !d.isRead &&
                (index === 0 || listData[index - 1].isRead);

              return (
                <>
                  {isFirstUnread && unreadUsers.length > 0 && (
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>
                        {strings.notice.unreadUsers} ({unreadUsers.length})
                      </Text>
                    </View>
                  )}
                  <UserRow user={d.item} isRead={d.isRead} />
                </>
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* ── Pro 업그레이드 시트 ── */}
      <ProUpgradeSheet
        visible={upgradeSheetVisible}
        onClose={() => {
          hideUpgradeSheet();
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

  // ── 프로그레스 요약 카드 ──
  summaryCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
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
    padding: 24,
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
