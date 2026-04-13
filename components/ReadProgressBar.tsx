/**
 * components/ReadProgressBar.tsx — 읽음 현황 프로그레스바
 *
 * 공지 읽음 현황 화면 및 공지 카드 하단에서 사용.
 * readCount / totalCount 비율로 fill 너비를 계산.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  readCount: number;    // 읽은 사람 수
  totalCount: number;   // 전체 대상 수
  label?: string;       // 커스텀 레이블 (미전달 시 "N/M명 읽음" 자동 생성)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReadProgressBar({ readCount, totalCount, label }: Props) {
  // 진행률 계산 (0~100), totalCount가 0이면 0으로 처리
  const percent = totalCount > 0 ? Math.min((readCount / totalCount) * 100, 100) : 0;

  // 표시 텍스트
  const displayLabel = label ?? `${readCount}/${totalCount}명 읽음`;

  return (
    <View style={styles.container}>
      {/* 프로그레스바 */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` as any }]} />
      </View>

      {/* 읽음 텍스트 */}
      <Text style={styles.label}>{displayLabel}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── 바 배경 ──
  track: {
    flex: 1,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },

  // ── 바 fill ──
  fill: {
    height: '100%',
    backgroundColor: '#5B50E8',
    borderRadius: 4,
  },

  // ── 읽음 텍스트 ──
  label: {
    fontSize: 12,
    color: '#64748B',
    minWidth: 70,
    textAlign: 'right',
  },
});
