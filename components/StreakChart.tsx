/**
 * components/StreakChart.tsx — 스트릭 막대 차트
 *
 * 최근 30일 스트릭 상태를 색상 막대로 시각화.
 * submitted(초록) / late(노랑) / missed(빨강) / none(회색) 4가지 색 구분.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { DayStreak } from '../lib/streak';

interface Props {
  data: DayStreak[];  // fetchStreakData 결과 배열 (날짜 오름차순)
}

/** 상태별 막대 색상 */
const BAR_COLOR: Record<DayStreak['status'], string> = {
  submitted: '#10B981', // 초록 — 마감 전 제출
  late:      '#F59E0B', // 노랑 — 지각 제출
  missed:    '#EF4444', // 빨강 — 미제출
  none:      '#E2E8F0', // 회색 — 숙제 없음
};

/** 상태 한글 레이블 (범례용) */
const STATUS_LABEL: Record<DayStreak['status'], string> = {
  submitted: '제출',
  late:      '지각',
  missed:    '미제출',
  none:      '없음',
};

export default function StreakChart({ data }: Props) {
  // 막대 최대 높이 (submitted 기준 100%)
  const MAX_BAR_HEIGHT = 48;

  return (
    <View style={styles.container}>
      {/* 범례 */}
      <View style={styles.legend}>
        {(['submitted', 'late', 'missed'] as const).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BAR_COLOR[s] }]} />
            <Text style={styles.legendLabel}>{STATUS_LABEL[s]}</Text>
          </View>
        ))}
      </View>

      {/* 막대 차트 — 왼쪽(오래된 날짜)부터 오른쪽(오늘)으로 채워짐 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartContent}
      >
        {data.map((day) => {
          // submitted만 최대 높이, 나머지는 절반 높이로 구분
          const barHeight =
            day.status === 'submitted'
              ? MAX_BAR_HEIGHT
              : day.status === 'none'
              ? MAX_BAR_HEIGHT * 0.3
              : MAX_BAR_HEIGHT * 0.6;

          // 날짜에서 일(day) 숫자만 추출
          const dayNum = day.date.split('-')[2];

          return (
            <View key={day.date} style={styles.barColumn}>
              {/* 막대 — 하단 정렬을 위해 래퍼로 감쌈 */}
              <View style={[styles.barWrapper, { height: MAX_BAR_HEIGHT }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: BAR_COLOR[day.status],
                      // none이면 더 투명하게
                      opacity: day.status === 'none' ? 0.5 : 1,
                    },
                  ]}
                />
              </View>
              {/* 날짜 숫자 */}
              <Text style={styles.dayLabel}>{dayNum}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 16,
  },

  // 범례
  legend: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: '#64748B',
  },

  // 막대 차트
  chartContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingBottom: 2,
  },
  barColumn: {
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    justifyContent: 'flex-end', // 막대를 하단에서 위로 자라게
  },
  bar: {
    width: 8,
    borderRadius: 4,
  },
  dayLabel: {
    fontSize: 9,
    color: '#94A3B8',
  },
});
