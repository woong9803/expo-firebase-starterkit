/**
 * app/(app)/common/notice-list.tsx — 공지사항 목록 (전 역할 공유)
 *
 * showCreateButton=true 이면 우상단에 '+' 버튼 표시 (선생님/admin 전용).
 * 역할별 notices.tsx에서 이 화면을 래핑해서 사용한다.
 *
 * 사용 예시:
 *   // (teacher)/notices.tsx
 *   <NoticeListScreen showCreateButton onCreatePress={() => router.push('...')} />
 *
 *   // (parent)/notices.tsx
 *   <NoticeListScreen />
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
import { router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../../../store/useAuthStore';
import { subscribeNotices } from '../../../lib/notice';
import NoticeCard from '../../../components/NoticeCard';
import { strings } from '../../../constants/strings';
import type { Notice } from '../../../types';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface Props {
  showCreateButton?: boolean;  // true면 우상단 '+' 버튼 표시
  onCreatePress?: () => void;  // '+' 버튼 탭 콜백
}

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatDate(notice: Notice): string {
  if (!notice.created_at) return '';
  const d = notice.created_at.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// ─────────────────────────────────────────────────────────────
// NoticeListScreen
// ─────────────────────────────────────────────────────────────

export default function NoticeListScreen({ showCreateButton, onCreatePress }: Props) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const navigation = useNavigation();
  // 이전 화면이 있으면(탭이 아닌 push 진입) 뒤로가기 버튼 표시
  const canGoBack = navigation.canGoBack();

  const [notices, setNotices]     = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── 실시간 공지 목록 구독 ──
  useEffect(() => {
    if (!user?.academy_id) return;

    setIsLoading(true);
    // 학생: 본인 반 공지만, 학부모: 역할 기반 필터링
    const viewerClassId = user.role === 'student' ? (user.class_id ?? null) : null;
    const viewerRole = (user.role === 'student' || user.role === 'parent') ? user.role : null;
    const unsub = subscribeNotices(user.academy_id, (list) => {
      setNotices(list);
      setIsLoading(false);
    }, viewerClassId, viewerRole);

    // cleanup — 화면 언마운트 시 구독 해제
    return () => unsub();
  // user.class_id(반 배정 변경)·role 변화 시 구독 갱신이 필요하므로 의존성 포함
  }, [user?.academy_id, user?.class_id, user?.role]);

  // ── 중요 공지 상단 정렬 (subscribeNotices가 이미 is_important desc로 정렬하지만
  //    클라이언트에서 한 번 더 보장) ──
  const sortedNotices = useMemo(() => {
    const important = notices.filter((n) => n.is_important);
    const normal    = notices.filter((n) => !n.is_important);
    return [...important, ...normal];
  }, [notices]);

  // ── 공지 카드 탭 → 상세 화면 이동 ──
  const handleNoticePress = (noticeId: string) => {
    router.push(`/common/notice-detail?noticeId=${noticeId}`);
  };

  // ─────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        {/* 뒤로가기 버튼 — push로 진입한 경우(학생 등)에만 표시 */}
        {canGoBack && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{strings.notice.title}</Text>
        {showCreateButton && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={onCreatePress}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={26} color="#5B50E8" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#5B50E8" size="large" />
        </View>
      )}

      {/* ── 목록 ── */}
      {!isLoading && (
        <FlatList
          data={sortedNotices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <NoticeCard
              title={item.title}
              content={item.content}
              isImportant={item.is_important}
              createdAt={formatDate(item)}
              onPress={() => handleNoticePress(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{strings.notice.noNotice}</Text>
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
    backgroundColor: '#fff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 4,
    marginRight: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  createBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 로딩/빈 상태 중앙 박스 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 목록 ──
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // ── 빈 상태 ──
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
