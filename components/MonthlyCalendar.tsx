import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import type { AttendanceStatus } from '../types/index';
import { strings } from '../constants/strings';

// ─────────────────────────────────────────────────────────────
// MonthlyCalendar
// 학생/학부모 월간 출결 이력을 달력 형태로 시각화하는 컴포넌트.
// 날짜별 배경색으로 출석/지각/결석/오늘 구분 표시.
// ─────────────────────────────────────────────────────────────

interface Props {
  year: number;
  month: number; // 1~12
  attendanceMap: Record<string, AttendanceStatus>; // 'YYYY-MM-DD' → status
  onMonthChange: (year: number, month: number) => void;
  onDatePress?: (dateKey: string) => void; // 날짜 탭 콜백
  style?: StyleProp<ViewStyle>;            // 컨테이너 스타일 오버라이드
}

// 날짜 셀 배경/텍스트 색상 — HTML 레퍼런스 기준
const STATUS_CELL: Record<AttendanceStatus, { bg: string; color: string }> = {
  present: { bg: '#D1FAE5', color: '#065F46' },
  late:    { bg: '#FEF3C7', color: '#78350F' },
  absent:  { bg: '#FEE2E2', color: '#991B1B' },
};

// 범례 아이템 색상 (정사각형 스와치 + 레이블)
const LEGEND_ITEMS = [
  { bg: '#D1FAE5', border: undefined,  label: '출석' },
  { bg: '#FEF3C7', border: undefined,  label: '지각' },
  { bg: '#FEE2E2', border: undefined,  label: '결석' },
  { bg: '#EEF2FF', border: '#5B50E8',  label: '오늘' },
];

// 'YYYY-MM-DD' 형식으로 날짜 키 생성
function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 오늘 날짜 키
function getTodayKey(): string {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export default function MonthlyCalendar({
  year,
  month,
  attendanceMap,
  onMonthChange,
  onDatePress,
  style,
}: Props) {
  const todayKey = getTodayKey();

  // ── 이전달 / 다음달 이동 ─────────────────────────────────
  function handlePrevMonth() {
    month === 1 ? onMonthChange(year - 1, 12) : onMonthChange(year, month - 1);
  }
  function handleNextMonth() {
    month === 12 ? onMonthChange(year + 1, 1) : onMonthChange(year, month + 1);
  }

  // ── 달력 날짜 배열 생성 (일요일 시작) ──────────────────────
  // getDay(): 0=일, 1=월 ... 6=토
  // 일요일 시작 오프셋: 그대로 사용 → 0=일, 6=토
  const startOffset = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();

  // 앞쪽 빈 칸(null) + 실제 날짜
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  // 7일씩 잘라 명시적 행(row) 단위로 묶기
  // ※ flexWrap + width:'14.2857%' 조합은 부동소수점 누적으로
  //   7번째 셀(일요일)이 다음 줄로 밀려 요일이 어긋나는 버그가 발생함
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    // 마지막 행이 7칸 미만이면 빈 칸으로 채워 셀 너비 일정 유지
    while (row.length < 7) row.push(null);
    rows.push(row);
  }

  return (
    <View style={[styles.container, style]}>
      {/* ── 헤더: 이전달 / 년월 / 다음달 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn} activeOpacity={0.7}>
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {strings.attendance.calendar.yearMonth(year, month)}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.arrowBtn} activeOpacity={0.7}>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── 요일 헤더: 월~일 ── */}
      <View style={styles.weekRow}>
        {strings.attendance.calendar.dayHeaders.map((day, idx) => (
          <View key={idx} style={styles.dayHeaderCell}>
            <Text style={styles.dayHeaderText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* ── 날짜 그리드: 7일씩 row 단위로 렌더링 ── */}
      <View>
        {rows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={styles.gridRow}>
            {row.map((day, colIdx) => {
              if (day === null) {
                return <View key={`empty-${rowIdx}-${colIdx}`} style={styles.cell} />;
              }

              const dateKey = toDateKey(year, month, day);
              const status = attendanceMap[dateKey] ?? null;
              const isToday = dateKey === todayKey;
              const cellStyle = status ? STATUS_CELL[status] : null;
              // onDatePress가 있으면 모든 날짜 탭 가능 (상태 없는 날도 포함)
              const pressable = !!onDatePress;

              return (
                <TouchableOpacity
                  key={dateKey}
                  activeOpacity={pressable ? 0.7 : 1}
                  onPress={pressable ? () => onDatePress(dateKey) : undefined}
                  style={[
                    styles.cell,
                    cellStyle ? { backgroundColor: cellStyle.bg } : null,
                    isToday && styles.todayBorder,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      cellStyle ? { color: cellStyle.color } : null,
                      isToday && !status && styles.todayText,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* ── 범례 ── */}
      <View style={styles.legend}>
        {LEGEND_ITEMS.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: item.bg },
                item.border ? { borderWidth: 2, borderColor: item.border } : null,
              ]}
            />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 24,
    color: '#64748B',
    lineHeight: 24,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── 요일 헤더 ──
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // ── 날짜 그리드 ──
  // 7일씩 row 단위로 묶고 셀은 flex:1 로 균등 분배
  // (% 기반 width 누적 오차로 일요일이 다음 줄로 밀리는 문제 방지)
  gridRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  todayBorder: {
    borderWidth: 2,
    borderColor: '#5B50E8',
    backgroundColor: '#EEF2FF',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  todayText: {
    color: '#5B50E8',
    fontWeight: '700',
  },

  // ── 범례 ──
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
});
