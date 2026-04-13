/**
 * components/NoticeCard.tsx — 공지사항 카드
 *
 * 공지 목록 화면에서 사용하는 공용 카드 컴포넌트.
 * 중요 공지(빨강 계열)와 일반 공지(흰색 계열)를 구분하여 표시.
 * readCount/totalCount 전달 시 하단에 읽음 현황 프로그레스바 표시.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ReadProgressBar from './ReadProgressBar';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  title: string;
  content?: string;       // 공지 내용 미리보기 (있으면 제목 아래에 표시)
  isImportant: boolean;   // true면 중요 공지 스타일 적용
  createdAt: string;      // 작성일 포맷 문자열 (예: "2026. 4. 13.")
  readCount?: number;     // 읽은 사람 수 (있으면 프로그레스바 표시)
  totalCount?: number;    // 전체 대상 수
  onPress: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NoticeCard({
  title,
  content,
  isImportant,
  createdAt,
  readCount,
  totalCount,
  onPress,
}: Props) {
  // 읽음 현황 프로그레스바 표시 여부 (둘 다 있어야 표시)
  const showProgress =
    readCount !== undefined &&
    totalCount !== undefined &&
    totalCount > 0;

  return (
    <TouchableOpacity
      style={[styles.card, isImportant ? styles.cardImportant : styles.cardNormal]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* 좌측 세로 강조바 */}
      <View style={[styles.bar, { backgroundColor: isImportant ? '#EF4444' : '#5B50E8' }]} />

      {/* 카드 본문 */}
      <View style={styles.body}>
        {/* 상단: 중요 뱃지 + 작성일 */}
        <View style={styles.topRow}>
          {isImportant && (
            <View style={styles.importantBadge}>
              <Text style={styles.importantBadgeText}>중요</Text>
            </View>
          )}
          <Text style={styles.date}>{createdAt}</Text>
        </View>

        {/* 제목 */}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        {/* 내용 미리보기 */}
        {content ? (
          <Text style={styles.content} numberOfLines={2}>{content}</Text>
        ) : null}

        {/* 읽음 현황 프로그레스바 */}
        {showProgress && (
          <View style={styles.progressWrapper}>
            <ReadProgressBar readCount={readCount!} totalCount={totalCount!} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── 카드 공통 ──
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  cardNormal: {
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
  },
  cardImportant: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  // ── 좌측 세로바 ──
  bar: {
    width: 3,
    // height는 flexbox로 부모 높이에 맞춤
  },

  // ── 본문 ──
  body: {
    flex: 1,
    padding: 13,
    gap: 4,
  },

  // ── 상단 행 (뱃지 + 날짜) ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  importantBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  importantBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  date: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // ── 제목 ──
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },

  // ── 내용 미리보기 ──
  content: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },

  // ── 프로그레스바 래퍼 ──
  progressWrapper: {
    marginTop: 6,
  },
});
