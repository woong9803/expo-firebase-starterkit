import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import { useAuthStore } from '../../../../store/useAuthStore';
import { getMonthlyAttendance } from '../../../../lib/attendance';
import MonthlyCalendar from '../../../../components/MonthlyCalendar';
import { strings } from '../../../../constants/strings';
import type { AttendanceRecord, AttendanceStatus } from '../../../../types/index';

// 오늘 날짜 문자열 (YYYY-MM-DD)
function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// StudentAttendanceScreen
// 학생이 본인의 월간 출결 이력을 확인하는 화면.
// 상단 이달 요약 카드 + 월간 달력 + 최근 출결 기록 리스트.
// ─────────────────────────────────────────────────────────────

// 최근 출결 기록 날짜 표시: 'YYYY-MM-DD' → 'M/D 요일'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function formatRecordDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}

// 출결 상태별 표시 텍스트·색상
function getStatusDisplay(record: AttendanceRecord): { text: string; color: string } {
  const reason = record.reason ? ` (${record.reason})` : '';
  switch (record.status) {
    case 'present':
      return { text: '○ 출석',               color: '#10B981' };
    case 'late':
      return { text: `△ 지각${reason}`,      color: '#F59E0B' };
    case 'absent':
      return { text: `✕ 결석${reason}`,      color: '#EF4444' };
    case 'onLeave':
      return { text: '- 휴원',               color: '#94A3B8' };
  }
}

// 이달 요약 4칸 아이템 컴포넌트
function SummaryItem({
  value,
  label,
  color,
  fontSize = 28,
}: {
  value: string | number;
  label: string;
  color: string;
  fontSize?: number;
}) {
  return (
    <View style={summaryItemStyles.wrap}>
      <Text style={[summaryItemStyles.value, { color, fontSize }]}>
        {value}
      </Text>
      <Text style={summaryItemStyles.label}>{label}</Text>
    </View>
  );
}

const summaryItemStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  value: { fontWeight: '800' },
  label: { fontSize: 12, color: '#64748B', marginTop: 4 },
});

export default function StudentAttendanceScreen() {
  const { top } = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  // 현재 표시 중인 연·월 상태
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // 날짜별 출결 전체 기록 맵: { 'YYYY-MM-DD': AttendanceRecord }
  const [recordMap, setRecordMap] = useState<Record<string, AttendanceRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // 날짜별 onSnapshot 구독 관리 (중복 방지 + 달 전환 시 정리)
  const subscribedDatesRef = useRef<Set<string>>(new Set());
  const dateUnsubsRef      = useRef<Record<string, () => void>>({});

  // MonthlyCalendar에 전달할 status 전용 맵 (색상 표시용)
  const attendanceMap: Record<string, AttendanceStatus> = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(recordMap).map(([date, rec]) => [date, rec.status])
      ),
    [recordMap]
  );

  // ── 월간 출결 데이터 로드 ───────────────────────────────────
  const loadMonthlyData = useCallback(async () => {
    if (!user?.uid || !user?.class_id) return;

    setIsLoading(true);
    setLoadError(false);

    try {
      const data = await getMonthlyAttendance(user.uid, user.class_id, year, month);
      setRecordMap(data);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, user?.class_id, year, month]);

  useEffect(() => {
    loadMonthlyData();
  }, [loadMonthlyData]);

  // ── 이번 달 1일 ~ 오늘 전체 실시간 구독 ─────────────────────
  // 기존 방식(오늘만 구독 or 기록 있는 날만 구독)은 선생님이
  // 아직 미입력인 과거 날짜를 뒤늦게 입력하면 반영이 안 되는 문제 있음
  // → 이번 달 모든 날짜(1일~오늘)를 구독해 어느 날이든 즉시 갱신
  // → 과거 달은 변경될 일 없으므로 getMonthlyAttendance 1회 로드로 충분
  useEffect(() => {
    if (!user?.uid || !user?.class_id) return;

    // 이전 구독 해제
    Object.values(dateUnsubsRef.current).forEach(u => u());
    dateUnsubsRef.current = {};
    subscribedDatesRef.current.clear();

    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

    // 이번 달이면 오늘까지만, 과거 달이면 해당 월의 마지막 날까지 구독
    // → 선생님이 과거 날짜를 뒤늦게 수정해도 달 이동 없이 즉시 반영
    const lastDay   = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    for (let day = 1; day <= lastDay; day++) {
      const dateStr   = `${yearMonth}-${String(day).padStart(2, '0')}`;
      subscribedDatesRef.current.add(dateStr);

      const recordRef = doc(
        db,
        'attendances',
        `${user.class_id}_${dateStr}`,
        'records',
        user.uid,
      );

      dateUnsubsRef.current[dateStr] = onSnapshot(recordRef, (snap) => {
        setRecordMap((prev) => {
          if (!snap.exists()) {
            if (!prev[dateStr]) return prev; // 원래도 없으면 스킵
            const next = { ...prev };
            delete next[dateStr];
            return next;
          }
          const newData = snap.data() as AttendanceRecord;
          const existing = prev[dateStr];
          if (existing?.status === newData.status && existing?.reason === newData.reason) {
            return prev; // 실제 변경 없으면 리렌더 스킵
          }
          return { ...prev, [dateStr]: newData };
        });
      });
    }

    return () => {
      Object.values(dateUnsubsRef.current).forEach(u => u());
      dateUnsubsRef.current = {};
      subscribedDatesRef.current.clear();
    };
  }, [user?.uid, user?.class_id, year, month]);

  // ── 이달 요약 계산 ─────────────────────────────────────────
  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    Object.values(recordMap).forEach((rec) => {
      if (rec.status === 'present') present += 1;
      else if (rec.status === 'late') late += 1;
      else if (rec.status === 'absent') absent += 1;
    });
    const total = present + late + absent;
    const rate = total > 0 ? Math.round((present / total) * 100) : null;
    return { present, late, absent, rate };
  }, [recordMap]);

  // ── 최근 출결 기록 (내림차순 최대 10개) ──────────────────────
  const recentRecords = useMemo(() => {
    return Object.entries(recordMap)
      .sort(([a], [b]) => b.localeCompare(a)) // 날짜 내림차순
      .slice(0, 10);
  }, [recordMap]);

  // ── 반 미소속 안내 화면 ────────────────────────────────────
  if (!user?.class_id) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: top }]}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyTitle}>{strings.attendance.noClassMessage}</Text>
        <Text style={styles.emptySub}>{strings.attendance.noClassSub}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 제목 ── */}
      <Text style={styles.pageTitle}>{strings.attendance.myTitle}</Text>

      {/* ── 이달 요약 카드 ── */}
      <View style={styles.summaryCard}>
        {/* 연월 표시 */}
        <Text style={styles.summaryMonth}>
          {strings.attendance.calendar.yearMonth(year, month)}
        </Text>

        {/* 4칸 통계: 출석 / 지각 / 결석 / 출석률 */}
        <View style={styles.summaryRow}>
          <SummaryItem
            value={summary.present}
            label={strings.attendance.present}
            color="#5B50E8"
            fontSize={30}
          />
          <SummaryItem
            value={summary.late}
            label={strings.attendance.late}
            color="#F59E0B"
            fontSize={30}
          />
          <SummaryItem
            value={summary.absent}
            label={strings.attendance.absent}
            color="#EF4444"
            fontSize={30}
          />
          <SummaryItem
            value={summary.rate !== null ? `${summary.rate}%` : '-'}
            label="출석률"
            color="#10B981"
            fontSize={26}
          />
        </View>
      </View>

      {/* ── 로딩 인디케이터 ── */}
      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#5B50E8" />
        </View>
      )}

      {/* ── 에러 안내 ── */}
      {!isLoading && loadError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{strings.attendance.loadFailed}</Text>
        </View>
      )}

      {/* ── 월간 달력 (카드 없이 날것으로 표시) ── */}
      <MonthlyCalendar
        year={year}
        month={month}
        attendanceMap={attendanceMap}
        onMonthChange={(y, m) => {
          setYear(y);
          setMonth(m);
        }}
        style={styles.calendarNoCard}
      />

      {/* ── 최근 출결 기록 ── */}
      {recentRecords.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>최근 출결 기록</Text>
          <View style={styles.recentCard}>
            {recentRecords.map(([dateKey, record], idx) => {
              const { text, color } = getStatusDisplay(record);
              const isLast = idx === recentRecords.length - 1;
              return (
                <View
                  key={dateKey}
                  style={[styles.recentRow, isLast && styles.recentRowLast]}
                >
                  <Text style={styles.recentDate}>{formatRecordDate(dateKey)}</Text>
                  <Text style={[styles.recentStatus, { color }]}>{text}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── 제목 ──
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },

  // ── 이달 요약 카드 ──
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryMonth: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── 로딩 ──
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },

  // ── 에러 카드 ──
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
    fontWeight: '500',
  },

  // ── 달력 카드 없이 표시 (테두리·배경·padding 제거) ──
  calendarNoCard: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    paddingVertical: 0,
  },

  // ── 최근 출결 기록 ──
  recentSection: {
    marginTop: 16,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  recentRowLast: {
    borderBottomWidth: 0,
  },
  recentDate: {
    fontSize: 14,
    color: '#64748B',
  },
  recentStatus: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── 반 미소속 안내 ──
  emptyContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
});
