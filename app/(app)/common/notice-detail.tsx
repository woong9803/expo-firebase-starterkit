/**
 * app/(app)/common/notice-detail.tsx — 공지사항 상세 (전 역할 공유)
 *
 * router.params: noticeId (string)
 * - 진입 시 Firestore에서 공지 조회 후 read_by에 uid 추가
 * - 선생님/admin은 하단에 '읽음 현황 보기' 버튼 표시 (Pro 전용 화면으로 이동)
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDoc } from 'firebase/firestore';

import { useAuthStore } from '../../../store/useAuthStore';
import { Collections } from '../../../lib/firestore';
import { markNoticeRead } from '../../../lib/notice';
import { strings } from '../../../constants/strings';
import type { Notice } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatDate(notice: Notice): string {
  if (!notice.created_at) return '';
  const d = notice.created_at.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// ─────────────────────────────────────────────────────────────
// NoticeDetailScreen
// ─────────────────────────────────────────────────────────────

export default function NoticeDetailScreen() {
  const { top } = useSafeAreaInsets();
  const { noticeId } = useLocalSearchParams<{ noticeId: string }>();
  const { user } = useAuthStore();

  const [notice, setNotice]     = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState(false);

  // 선생님/admin만 읽음 현황 버튼 표시
  const canViewReadStatus =
    user?.role === 'teacher' || user?.role === 'admin';

  // ── 공지 조회 + 읽음 처리 ──
  useEffect(() => {
    if (!noticeId || !user?.uid) return;

    const fetch = async () => {
      setIsLoading(true);
      setError(false);
      try {
        const snap = await getDoc(Collections.notice(noticeId));
        if (!snap.exists()) {
          setError(true);
          return;
        }
        setNotice({ id: snap.id, ...snap.data() } as Notice);

        // 읽음 처리 — 실패해도 화면에 영향 없음 (Security Rules 오류 시 콘솔에만 기록)
        markNoticeRead(noticeId, user.uid).catch((e) => {
          console.warn('[NoticeDetail] 읽음 처리 실패:', e);
        });
      } catch (e) {
        console.error('[NoticeDetail] 공지 조회 실패:', e);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetch();
  }, [noticeId, user?.uid]);

  // ── 읽음 현황 화면으로 이동 ──
  const handleReadStatus = () => {
    if (user?.role === 'teacher') {
      router.push(`/(app)/(teacher)/notice-read-status?noticeId=${noticeId}`);
    } else {
      router.push(`/(app)/(admin)/notice-read-status?noticeId=${noticeId}`);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.notice.title}</Text>
        <View style={{ width: 40 }} />
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
          <Text style={styles.errorText}>{strings.common.error}</Text>
        </View>
      )}

      {/* ── 본문 ── */}
      {!isLoading && !error && notice && (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            canViewReadStatus && styles.scrollContentWithBottom,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* 중요 뱃지 */}
          {notice.is_important && (
            <View style={styles.importantBadge}>
              <Text style={styles.importantBadgeText}>{strings.notice.important}</Text>
            </View>
          )}

          {/* 제목 */}
          <Text style={styles.title}>{notice.title}</Text>

          {/* 작성일 */}
          <Text style={styles.date}>{formatDate(notice)}</Text>

          {/* 구분선 */}
          <View style={styles.divider} />

          {/* 내용 */}
          <Text style={styles.content}>
            {notice.content || strings.notice.noContent}
          </Text>
        </ScrollView>
      )}

      {/* ── 하단 버튼 (선생님/admin 전용) ── */}
      {canViewReadStatus && !isLoading && !error && notice && (
        <View style={styles.bottomWrapper}>
          <TouchableOpacity
            style={styles.readStatusBtn}
            onPress={handleReadStatus}
            activeOpacity={0.85}
          >
            <Ionicons name="people-outline" size={18} color="#5B50E8" />
            <Text style={styles.readStatusBtnText}>{strings.notice.readStatus}</Text>
          </TouchableOpacity>
        </View>
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── 로딩/오류 중앙 박스 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#94A3B8',
  },

  // ── 스크롤 영역 ──
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  scrollContentWithBottom: {
    paddingBottom: 96, // 하단 버튼 높이만큼 여백
  },

  // ── 중요 뱃지 ──
  importantBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  importantBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 제목 ──
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 28,
    marginBottom: 8,
  },

  // ── 작성일 ──
  date: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },

  // ── 구분선 ──
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 20,
  },

  // ── 본문 내용 ──
  content: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  },

  // ── 하단 버튼 영역 ──
  bottomWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  readStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    height: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readStatusBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5B50E8',
  },
});
