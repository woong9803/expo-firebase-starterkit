/**
 * app/(app)/common/notification-inbox.tsx — 알림 인박스 (전 역할 공유)
 *
 * - Firestore notifications 컬렉션에서 본인 알림 최신 50건 실시간 조회
 * - 읽음/미읽음 구분 표시 (미읽음: 배경 강조 + 볼드)
 * - 탭 시 is_read=true 업데이트 (markAsRead 호출)
 * - 상단 '모두 읽음' 버튼으로 일괄 읽음 처리
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  doc,
} from 'firebase/firestore';

import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { Collections } from '../../../lib/firestore';
import { db } from '../../../lib/firebase';
import { strings } from '../../../constants/strings';
import type { AppNotification } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 알림 타입별 Ionicons 이름 + 색상 매핑
// ─────────────────────────────────────────────────────────────
const NOTIFICATION_ICONS: Record<AppNotification['type'], { name: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  homework_feedback: { name: 'document-text-outline', color: '#5B50E8' },
  homework_due:      { name: 'time-outline',          color: '#EF4444' },
  attendance:        { name: 'clipboard-outline',     color: '#10B981' },
  notice:            { name: 'megaphone-outline',     color: '#F59E0B' },
};

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────
function formatDate(timestamp: AppNotification['created_at']): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  // 7일 이상 경과 시 날짜 표시
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ─────────────────────────────────────────────────────────────
// 알림 아이템 컴포넌트
// ─────────────────────────────────────────────────────────────
interface NotificationItemProps {
  item: AppNotification;
  onPress: (id: string) => void;
}

function NotificationItem({ item, onPress }: NotificationItemProps) {
  const isUnread = !item.is_read;

  return (
    <TouchableOpacity
      style={[styles.itemContainer, isUnread && styles.itemUnread]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      {/* 미읽음 인디케이터 dot */}
      {isUnread && <View style={styles.unreadDot} />}

      {/* 알림 타입 아이콘 */}
      <View style={styles.iconBox}>
        {(() => {
          const ic = NOTIFICATION_ICONS[item.type];
          return ic
            ? <Ionicons name={ic.name} size={20} color={ic.color} />
            : <Ionicons name="notifications-outline" size={20} color="#64748B" />;
        })()}
      </View>

      {/* 알림 내용 */}
      <View style={styles.contentBox}>
        <Text
          style={[styles.itemTitle, isUnread && styles.itemTitleUnread]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={styles.itemBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 화면 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function NotificationInboxScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const { notifications, unreadCount, isLoading, setNotifications, markAsRead } =
    useNotificationStore();

  // ── 실시간 알림 구독 ────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      Collections.notifications(),
      where('target_uid', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const notifs: AppNotification[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AppNotification, 'id'>),
        }));
        setNotifications(notifs);
      },
      (err) => {
        console.warn('[NotificationInbox] onSnapshot 오류:', err);
      }
    );

    // 컴포넌트 언마운트 시 구독 해제
    return () => unsub();
  }, [user?.uid]);

  // ── 단건 읽음 처리 + 딥링크 이동 ────────────────────────────
  function handlePressItem(id: string) {
    markAsRead(id);

    // 해당 알림의 deep_link가 있으면 해당 화면으로 이동
    const notif = notifications.find((n) => n.id === id);
    if (notif?.deep_link) {
      router.push(notif.deep_link as Parameters<typeof router.push>[0]);
    }
  }

  // ── 모두 읽음 처리 ──────────────────────────────────────────
  async function handleMarkAllRead() {
    const unreadItems = notifications.filter((n) => !n.is_read);
    if (unreadItems.length === 0) return;

    try {
      // Firestore batch 업데이트로 일괄 처리
      const batch = writeBatch(db);
      unreadItems.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { is_read: true });
      });
      await batch.commit();

      // 로컬 상태도 즉시 반영
      unreadItems.forEach((n) => markAsRead(n.id));
    } catch (e) {
      console.warn('[NotificationInbox] 모두 읽음 실패:', e);
    }
  }

  // ── 빈 상태 컴포넌트 ────────────────────────────────────────
  function renderEmpty() {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="notifications-outline" size={40} color="#CBD5E1" style={{ marginBottom: 8 }} />
        <Text style={styles.emptyText}>{strings.notification.empty}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.notification.inbox}</Text>
        {/* 미읽음이 있을 때만 '모두 읽음' 버튼 표시 */}
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>{strings.notification.markAllRead}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      {/* 로딩 */}
      {isLoading && (
        <ActivityIndicator style={styles.loader} color="#5B50E8" />
      )}

      {/* 알림 목록 */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem item={item} onPress={handlePressItem} />
        )}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          notifications.length === 0 ? styles.flatListEmpty : styles.flatListContent
        }
        showsVerticalScrollIndicator={false}
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

  // ── 헤더 ─────────────────────────────────────────────────
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
  markAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 13,
    color: '#5B50E8',
    fontWeight: '600',
  },
  headerRight: {
    width: 60, // 버튼 자리 확보 (레이아웃 균형)
  },

  // ── 로딩 ─────────────────────────────────────────────────
  loader: {
    marginTop: 24,
  },

  // ── 알림 아이템 ───────────────────────────────────────────
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemUnread: {
    // 미읽음 알림: 배경 강조
    backgroundColor: '#F8FAFC',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B50E8',
    marginTop: 6,
    marginRight: 4,
    flexShrink: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconText: {
    fontSize: 18,
  },
  contentBox: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748B',
    marginBottom: 3,
  },
  itemTitleUnread: {
    // 미읽음 알림 제목: 볼드 + 진한 색
    fontWeight: '700',
    color: '#0F172A',
  },
  itemBody: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // ── 빈 상태 ──────────────────────────────────────────────
  flatListContent: {
    paddingBottom: 24,
  },
  flatListEmpty: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
