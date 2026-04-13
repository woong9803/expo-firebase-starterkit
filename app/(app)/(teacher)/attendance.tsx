import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { query, where, getDocs, documentId } from 'firebase/firestore';
import { router } from 'expo-router';
import { useAuthStore } from '../../../store/useAuthStore';
import { useAttendanceStore } from '../../../store/useAttendanceStore';
import { Collections } from '../../../lib/firestore';
import { setAttendanceRecord, subscribeAttendanceRecords, updateAttendanceReason } from '../../../lib/attendance';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import AttendanceRow from '../../../components/AttendanceRow';
import { strings } from '../../../constants/strings';
import type { Class, User, AttendanceStatus } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function offsetDate(baseStr: string, offset: number): string {
  const d = new Date(baseStr + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return toDateStr(d);
}

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
function getWeekdayShort(dateStr: string): string {
  return WEEKDAY_SHORT[new Date(dateStr + 'T00:00:00').getDay()];
}

function getDay(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDate();
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

// ─────────────────────────────────────────────────────────────
// 날짜 스트립: 과거 20일 ~ 미래 9일 (총 30개)
// ─────────────────────────────────────────────────────────────
const TODAY = toDateStr(new Date());
const DATE_LIST: string[] = Array.from({ length: 30 }, (_, i) => offsetDate(TODAY, i - 20));
const TODAY_INDEX = 20;

// ─────────────────────────────────────────────────────────────
// TeacherAttendanceScreen
// ─────────────────────────────────────────────────────────────

export default function TeacherAttendanceScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const {
    records,
    setRecords,
    setSelectedClassId: storeSetClassId,
    setSelectedDate: storeSetDate,
    clearAttendance,
  } = useAttendanceStore();

  // 네트워크 상태 감지
  const { isOnline, justReconnected } = useNetworkStatus();

  // 재연결 토스트 페이드 애니메이션
  const toastOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (justReconnected) {
      // 등장: 빠르게 나타났다가 천천히 사라짐
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [justReconnected]);

  const [classes, setClasses]                     = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId]     = useState<string | null>(null);
  const [selectedDate, setSelectedDate]           = useState<string>(TODAY);
  const [students, setStudents]                   = useState<User[]>([]);
  const [isLoadingClasses, setIsLoadingClasses]   = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSavingAll, setIsSavingAll]             = useState(false);

  // 저장 전 로컬 임시 상태 — 저장하기 버튼 누르기 전까지 Firestore에 반영 안 됨
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, AttendanceStatus>>({});

  const dateListRef = useRef<FlatList<string>>(null);
  const unsubRef    = useRef<(() => void) | null>(null);

  // ── 1. 담당 반 목록 로드 ──
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (classIds.length === 0) {
      setIsLoadingClasses(false);
      return;
    }

    getDocs(
      query(Collections.classes(), where(documentId(), 'in', classIds))
    ).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
      setClasses(list);
      if (list.length > 0) {
        setSelectedClassId(list[0].id);
        storeSetClassId(list[0].id);
      }
    }).catch((e) => {
      console.error('[TeacherAttendance] 반 목록 로드 실패:', e);
    }).finally(() => {
      setIsLoadingClasses(false);
    });
  }, [user?.uid]);

  // ── 2. 반/날짜 변경 시 학생 목록 재조회 + 실시간 구독 ──
  useEffect(() => {
    if (!selectedClassId || !selectedDate || !user?.academy_id) return;

    setIsLoadingStudents(true);
    setRecords({});
    // 날짜·반 변경 시 임시 상태 초기화
    setPendingStatuses({});

    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    getDocs(
      query(
        Collections.users(),
        where('academy_id', '==', user.academy_id),
        where('class_id', '==', selectedClassId),
        where('role', '==', 'student'),
        where('is_active', '==', true),
      )
    ).then((snap) => {
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
    }).catch((e) => {
      console.error('[TeacherAttendance] 학생 목록 로드 실패:', e);
    }).finally(() => {
      setIsLoadingStudents(false);
    });

    const unsub = subscribeAttendanceRecords(
      selectedClassId,
      selectedDate,
      (newRecords) => setRecords(newRecords),
      (e) => console.error('[TeacherAttendance] 출결 구독 오류:', e),
    );
    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [selectedClassId, selectedDate]);

  // ── 3. 언마운트 시 정리 ──
  useEffect(() => {
    return () => {
      clearAttendance();
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // ── 날짜 선택 ──
  const handleDateSelect = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    storeSetDate(dateStr);
  }, []);

  // ── 상태 버튼 탭: 로컬 임시 상태만 변경 (Firestore 저장 안 함) ──
  const handleStatusChange = useCallback((studentUid: string, status: AttendanceStatus) => {
    setPendingStatuses((prev) => ({ ...prev, [studentUid]: status }));
  }, []);

  // ── 표시용 상태: 임시 상태 우선, 없으면 Firestore 상태 ──
  // handleSaveAll에서 참조하므로 먼저 선언
  const mergedStatuses = useMemo(() => {
    const result: Record<string, AttendanceStatus | null> = {};
    students.forEach(({ uid }) => {
      result[uid] = pendingStatuses[uid] ?? records[uid]?.status ?? null;
    });
    return result;
  }, [students, pendingStatuses, records]);

  // ── 저장하기: 반 전체 학생의 현재 상태를 Firestore에 일괄 저장 ──
  // 상태가 설정된(null이 아닌) 학생만 저장하며, pendingStatuses + 기존 records 모두 포함
  const handleSaveAll = useCallback(async () => {
    if (!selectedClassId || !selectedDate || !user?.academy_id) return;

    // 저장 대상: 반 전체 학생 중 상태가 있는 학생
    const toSave = students
      .map(({ uid }) => ({ uid, status: mergedStatuses[uid] }))
      .filter((s): s is { uid: string; status: AttendanceStatus } => s.status !== null);

    if (toSave.length === 0) return;

    setIsSavingAll(true);
    try {
      await Promise.all(
        toSave.map(({ uid, status }) =>
          setAttendanceRecord(selectedClassId, selectedDate, uid, status, user.academy_id)
        )
      );
      // 저장 완료 후 임시 변경 상태 초기화 → 버튼 자동 비활성화
      setPendingStatuses({});
    } catch (e) {
      console.error('[TeacherAttendance] 일괄 저장 실패:', e);
    } finally {
      setIsSavingAll(false);
    }
  }, [selectedClassId, selectedDate, user?.academy_id, students, mergedStatuses]);

  // ── 사유 저장: 체크 버튼 탭 시 즉시 저장 ──
  const handleReasonSave = useCallback(async (studentUid: string, reason: string | null) => {
    if (!selectedClassId || !selectedDate) return;
    try {
      await updateAttendanceReason(selectedClassId, selectedDate, studentUid, reason);
    } catch (e) {
      console.error('[TeacherAttendance] 사유 저장 실패:', e);
    }
  }, [selectedClassId, selectedDate]);

  const summary = useMemo(() => {
    const values = Object.values(mergedStatuses);
    return {
      present: values.filter((s) => s === 'present').length,
      late:    values.filter((s) => s === 'late').length,
      absent:  values.filter((s) => s === 'absent').length,
    };
  }, [mergedStatuses]);

  const notEnteredCount = students.length - summary.present - summary.late - summary.absent;
  // 상태를 새로 탭한 학생이 있을 때만 저장 버튼 활성화
  const hasPending = Object.keys(pendingStatuses).length > 0;

  // ── 로딩 ──
  if (isLoadingClasses) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  if (classes.length === 0) {
    return (
      <View style={[styles.centered, { paddingTop: top }]}>
        <Text style={styles.emptyText}>담당 반이 없어요</Text>
        <Text style={styles.emptySubText}>선생님 홈에서 반을 먼저 등록해주세요</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 오프라인 배너 — 네트워크 끊길 때만 표시 ── */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={15} color="#fff" />
          <Text style={styles.offlineBannerText}>
            오프라인 상태 — 입력 내용은 재연결 시 자동 동기화됩니다
          </Text>
        </View>
      )}

      {/* ── 재연결 토스트 — 온라인 복귀 시 잠깐 표시 ── */}
      <Animated.View style={[styles.reconnectToast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={16} color="#fff" />
        <Text style={styles.reconnectToastText}>인터넷에 연결되었습니다 ✓</Text>
      </Animated.View>

      {/* ── 헤더: 타이틀 + 날짜 + 엑셀 아이콘 ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{strings.attendance.rosterTable}</Text>
          <Text style={styles.headerDate}>{formatDateHeader(selectedDate)}</Text>
        </View>
        {/* 엑셀 내보내기 — 우측 상단 작은 아이콘 버튼 */}
        <TouchableOpacity
          style={styles.excelBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/(app)/(teacher)/attendance-export')}
        >
          <Ionicons name="document-text-outline" size={18} color="#5B50E8" />
          <Text style={styles.excelBtnText}>엑셀</Text>
        </TouchableOpacity>
      </View>

      {/* ── 날짜 스트립 ── */}
      <FlatList
        ref={dateListRef}
        data={DATE_LIST}
        keyExtractor={(item) => item}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStripContent}
        style={styles.dateStrip}
        getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
        initialScrollIndex={Math.max(0, TODAY_INDEX - 3)}
        renderItem={({ item }) => {
          const isSelected = item === selectedDate;
          const isToday    = item === TODAY;
          return (
            <TouchableOpacity
              style={[
                styles.datePill,
                isSelected && styles.datePillSelected,
                !isSelected && isToday && styles.datePillToday,
              ]}
              onPress={() => handleDateSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.datePillWeekday, isSelected && styles.datePillTextSelected]}>
                {getWeekdayShort(item)}
              </Text>
              <Text style={[styles.datePillDay, isSelected && styles.datePillTextSelected]}>
                {getDay(item)}
              </Text>
              {isToday && !isSelected && <View style={styles.todayDot} />}
            </TouchableOpacity>
          );
        }}
      />

      {/* ── 반 선택 탭 ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.classTabBar}
        contentContainerStyle={styles.classTabContent}
      >
        {classes.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.classTab, selectedClassId === c.id && styles.classTabActive]}
            onPress={() => { setSelectedClassId(c.id); storeSetClassId(c.id); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.classTabText, selectedClassId === c.id && styles.classTabTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 요약 카운터 ── */}
      <View style={styles.summaryRow}>
        <SummaryChip count={summary.present} label={strings.attendance.present} countColor="#10B981" />
        <SummaryChip count={summary.late}    label={strings.attendance.late}    countColor="#F59E0B" />
        <SummaryChip count={summary.absent}  label={strings.attendance.absent}  countColor="#EF4444" />
        <SummaryChip count={notEnteredCount} label="미입력"                     countColor="#94A3B8" />
      </View>

      {/* ── 명렬표 ── */}
      {isLoadingStudents ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : students.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>등록된 학생이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <AttendanceRow
              studentName={item.name}
              status={mergedStatuses[item.uid] ?? null}
              reason={records[item.uid]?.reason ?? null}
              onStatusChange={(status) => handleStatusChange(item.uid, status)}
              onReasonSave={(reason) => handleReasonSave(item.uid, reason)}
              disabled={isSavingAll}
              readOnly={!hasPending}
            />
          )}
          ListFooterComponent={<View style={{ height: 16 }} />}
        />
      )}

      {/* ── 하단 저장하기 버튼 ── */}
      <View style={styles.saveWrapper}>
        <TouchableOpacity
          style={[styles.saveBtn, !hasPending && styles.saveBtnDisabled]}
          onPress={handleSaveAll}
          disabled={!hasPending || isSavingAll}
          activeOpacity={0.8}
        >
          {isSavingAll ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.saveBtnText, !hasPending && styles.saveBtnTextDisabled]}>
              저장하기
            </Text>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ── 요약 칩 ──────────────────────────────────────────────────
function SummaryChip({ count, label, countColor }: {
  count: number; label: string; countColor: string;
}) {
  return (
    <View style={styles.summaryChip}>
      <Text style={[styles.summaryCnt, { color: countColor }]}>{count}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },

  // ── 오프라인 배너 ──
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },

  // ── 재연결 토스트 ──
  reconnectToast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  reconnectToastText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerLeft: { gap: 2 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerDate: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  // 엑셀 아이콘 버튼 (우측 상단)
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F0FB',
    marginTop: 4,
  },
  excelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5B50E8',
  },

  // ── 날짜 스트립 ──
  dateStrip: {
    maxHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  datePill: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    gap: 2,
  },
  datePillSelected:      { backgroundColor: '#5B50E8' },
  datePillToday:         { backgroundColor: '#EEEDF9' },
  datePillWeekday:       { fontSize: 12, fontWeight: '500', color: '#94A3B8' },
  datePillDay:           { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  datePillTextSelected:  { color: '#fff' },
  todayDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#5B50E8', marginTop: 1,
  },

  // ── 반 탭 ──
  classTabBar:    { maxHeight: 48 },
  classTabContent: {
    paddingHorizontal: 20, paddingVertical: 10,
    flexDirection: 'row', gap: 8,
  },
  classTab: {
    paddingVertical: 6, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: '#E2E8F0', backgroundColor: '#fff',
  },
  classTabActive:      { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  classTabText:        { fontSize: 14, fontWeight: '600', color: '#334155' },
  classTabTextActive:  { color: '#fff' },

  // ── 요약 카운터 ──
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  summaryChip:  { flex: 1, alignItems: 'center', gap: 2 },
  summaryCnt:   { fontSize: 24, fontWeight: '800' },
  summaryLbl:   { fontSize: 12, color: '#94A3B8', fontWeight: '500' },

  // ── 명렬표 ──
  listContent:  { paddingHorizontal: 20, paddingBottom: 8 },
  emptyText:    { fontSize: 15, fontWeight: '600', color: '#334155' },
  emptySubText: { fontSize: 13, color: '#94A3B8' },

  // ── 저장하기 버튼 ──
  saveWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  saveBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  saveBtnTextDisabled: {
    color: '#94A3B8',
  },

});
