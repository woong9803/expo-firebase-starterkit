/**
 * components/HomeworkCard.tsx — 숙제 목록 카드
 *
 * 선생님·관리자 숙제 목록 화면에서 사용하는 공용 카드 컴포넌트.
 * D-Day 칩, 반 이름, 제출 현황 프로그레스바 포함.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  title: string;
  dDay: number;
  dueDate?: string;       // 마감일 포맷 문자열 (예: "2026. 4. 20.")
  className?: string;     // 반 이름
  submitCount?: number;   // 제출 학생 수
  totalCount?: number;    // 전체 학생 수 (있으면 프로그레스바 표시)
  status?: 'pending' | 'submitted' | 'checked'; // 숙제 상태 칩 (선택)
  onPress: () => void;
}

export default function HomeworkCard({
  title,
  dDay,
  dueDate,
  className,
  submitCount = 0,
  totalCount = 0,
  status,
  onPress,
}: Props) {
  // D-Day 표시 텍스트
  const dDayLabel = dDay === 0 ? 'D-0' : dDay > 0 ? `D-${dDay}` : '마감';

  // 제출 진행률 (0~1), totalCount가 있을 때만 계산
  const ratio = totalCount > 0 ? Math.min(submitCount / totalCount, 1) : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* 제목 + D-Day 칩 */}
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <View
          style={[
            styles.dDayChip,
            dDay === 0 ? styles.chipRed : dDay < 0 ? styles.chipGray : styles.chipBlue,
          ]}
        >
          <Text
            style={[
              styles.dDayText,
              dDay === 0 ? styles.textRed : dDay < 0 ? styles.textGray : styles.textBlue,
            ]}
          >
            {dDayLabel}
          </Text>
        </View>
      </View>

      {/* 반 이름 + 마감일 */}
      {(className || dueDate) && (
        <Text style={styles.cardSub}>
          {[className, dueDate ? `마감 ${dueDate}` : null].filter(Boolean).join(' · ')}
        </Text>
      )}

      {/* 제출 현황 — submitCount가 있을 때 표시 */}
      {submitCount > 0 || totalCount > 0 ? (
        <>
          <View style={styles.submitRow}>
            <Text style={styles.submitLabel}>제출 현황</Text>
            <Text style={styles.submitCount}>
              {totalCount > 0 ? `${submitCount} / ${totalCount}명` : `${submitCount}명 제출`}
            </Text>
          </View>
          {totalCount > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${ratio * 100}%` as any }]} />
            </View>
          )}
        </>
      ) : null}

      {/* 상태 칩 (선택) */}
      {status && (
        <View style={[styles.statusChip, STATUS_CHIP_STYLE[status]]}>
          <Text style={[styles.statusChipText, STATUS_TEXT_STYLE[status]]}>
            {STATUS_LABEL[status]}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// 상태 칩 라벨
const STATUS_LABEL: Record<NonNullable<Props['status']>, string> = {
  pending: '미확인',
  submitted: '제출됨',
  checked: '검사완료',
};

// 상태 칩 배경·테두리
const STATUS_CHIP_STYLE: Record<NonNullable<Props['status']>, object> = {
  pending:   { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  submitted: { backgroundColor: '#EEEDF9', borderColor: '#C4C2F0' },
  checked:   { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
};

// 상태 칩 텍스트 색
const STATUS_TEXT_STYLE: Record<NonNullable<Props['status']>, object> = {
  pending:   { color: '#78350F' },
  submitted: { color: '#3730A3' },
  checked:   { color: '#065F46' },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', flex: 1 },
  cardSub: { fontSize: 13, color: '#64748B' },

  // D-Day 칩
  dDayChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, flexShrink: 0 },
  chipRed:  { backgroundColor: '#FEE2E2' },
  chipBlue: { backgroundColor: '#EEEDF9' },
  chipGray: { backgroundColor: '#F1F5F9' },
  dDayText: { fontSize: 11, fontWeight: '700' },
  textRed:  { color: '#991B1B' },
  textBlue: { color: '#5B50E8' },
  textGray: { color: '#64748B' },

  // 제출 현황
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  submitLabel: { fontSize: 12, color: '#64748B' },
  submitCount: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  progressTrack: { height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: '#5B50E8', borderRadius: 3 },

  // 상태 칩
  statusChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },
});
