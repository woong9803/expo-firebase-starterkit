import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { query, where, getDocs, documentId } from 'firebase/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useAttendanceStore } from '../../../store/useAttendanceStore';
import { Collections } from '../../../lib/firestore';
import { setAttendanceRecord, subscribeAttendanceRecords } from '../../../lib/attendance';
import AttendanceRow from '../../../components/AttendanceRow';
import { strings } from '../../../constants/strings';
import type { Class, User, AttendanceStatus } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 날짜 유틸 함수
// ─────────────────────────────────────────────────────────────

// Date → YYYY-MM-DD 문자열
function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// YYYY-MM-DD → 한국어 표시 (예: 4월 13일 (월))
function formatDateKor(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

// ─────────────────────────────────────────────────────────────
// TeacherAttendanceScreen
// 선생님이 반·날짜를 선택해 실시간 출결 명렬표를 관리하는 화면
// ─────────────────────────────────────────────────────────────

export default function TeacherAttendanceScreen() {
  const { user } = useAuthStore();
  const {
    records,
    setRecords,
    setSelectedClassId: storeSetClassId,
    setSelectedDate: storeSetDate,
    updateRecord,
    clearAttendance,
  } = useAttendanceStore();

  const [classes, setClasses]               = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate]     = useState<string>(toDateStr(new Date()));
  const [students, setStudents]             = useState<User[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [savingUid, setSavingUid]           = useState<string | null>(null);

  // onSnapshot 구독 해제 함수 — 반/날짜 변경 시마다 교체
  const unsubRef = useRef<(() => void) | null>(null);

  // ── 1. 담당 반 목록 로드 (마운트 시 1회) ──
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
      // 첫 번째 반을 기본 선택
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

  // ── 2. 반/날짜 변경 시 학생 목록 재조회 + onSnapshot 구독 교체 ──
  useEffect(() => {
    if (!selectedClassId || !selectedDate || !user?.academy_id) return;

    setIsLoadingStudents(true);
    setRecords({});

    // 이전 리스너 해제
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    // 해당 반 활성 학생 목록 조회
    getDocs(
      query(
        Collections.users(),
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

    // 출결 records 실시간 구독
    const unsub = subscribeAttendanceRecords(
      selectedClassId,
      selectedDate,
      (newRecords) => setRecords(newRecords),
      (e) => console.error('[TeacherAttendance] 출결 구독 오류:', e),
    );
    unsubRef.current = unsub;

    // cleanup: 다음 effect 실행 전 리스너 해제
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [selectedClassId, selectedDate]);

  // ── 3. 언마운트 시 store 초기화 ──
  useEffect(() => {
    return () => {
      clearAttendance();
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // ── 날짜 이동 핸들러 (좌우 화살표) ──
  const moveDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const newDate = toDateStr(d);
    setSelectedDate(newDate);
    storeSetDate(newDate);
  };

  // ── 출결 상태 변경 핸들러 ──
  const handleStatusChange = useCallback(async (
    studentUid: string,
    status: AttendanceStatus,
  ) => {
    if (!selectedClassId || !selectedDate || !user?.academy_id) return;

    setSavingUid(studentUid);

    // 기존 사유를 유지하면서 로컬 즉시 반영 (낙관적 업데이트)
    updateRecord(studentUid, {
      status,
      reason: records[studentUid]?.reason ?? null,
    });

    try {
      await setAttendanceRecord(
        selectedClassId,
        selectedDate,
        studentUid,
        status,
        user.academy_id,
      );
    } catch (e) {
      console.error('[TeacherAttendance] 출결 저장 실패:', e);
    } finally {
      setSavingUid(null);
    }
  }, [selectedClassId, selectedDate, user?.academy_id, records]);

  // ── 요약 카운터 계산 ──
  const summary = useMemo(() => {
    const values = Object.values(records);
    return {
      present: values.filter((r) => r.status === 'present').length,
      late:    values.filter((r) => r.status === 'late').length,
      absent:  values.filter((r) => r.status === 'absent').length,
    };
  }, [records]);

  // 미입력 수 = 전체 학생 - 입력된 학생
  const notEnteredCount = students.length
    - summary.present - summary.late - summary.absent;

  // ── 로딩 (반 목록 로딩 전) ──
  if (isLoadingClasses) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  // ── 담당 반 없음 ──
  if (classes.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>담당 반이 없어요</Text>
        <Text style={styles.emptySubText}>선생님 홈에서 반을 먼저 등록해주세요</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

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
            style={[
              styles.classTab,
              selectedClassId === c.id && styles.classTabActive,
            ]}
            onPress={() => {
              setSelectedClassId(c.id);
              storeSetClassId(c.id);
            }}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.classTabText,
              selectedClassId === c.id && styles.classTabTextActive,
            ]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 날짜 선택 (좌우 화살표) ── */}
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => moveDate(-1)}>
          <Ionicons name="chevron-back" size={20} color="#5B50E8" />
        </TouchableOpacity>
        <Text style={styles.dateText}>{formatDateKor(selectedDate)}</Text>
        <TouchableOpacity style={styles.dateArrow} onPress={() => moveDate(1)}>
          <Ionicons name="chevron-forward" size={20} color="#5B50E8" />
        </TouchableOpacity>
      </View>

      {/* ── 요약 카운터 ── */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryChip, styles.summaryPresent]}>
          <Text style={[styles.summaryCnt, { color: '#065F46' }]}>{summary.present}</Text>
          <Text style={styles.summaryLbl}>{strings.attendance.present}</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryLate]}>
          <Text style={[styles.summaryCnt, { color: '#78350F' }]}>{summary.late}</Text>
          <Text style={styles.summaryLbl}>{strings.attendance.late}</Text>
        </View>
        <View style={[styles.summaryChip, styles.summaryAbsent]}>
          <Text style={[styles.summaryCnt, { color: '#991B1B' }]}>{summary.absent}</Text>
          <Text style={styles.summaryLbl}>{strings.attendance.absent}</Text>
        </View>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryCnt}>{notEnteredCount}</Text>
          <Text style={styles.summaryLbl}>미입력</Text>
        </View>
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
              status={records[item.uid]?.status ?? null}
              reason={records[item.uid]?.reason ?? null}
              onStatusChange={(status) => handleStatusChange(item.uid, status)}
              disabled={savingUid === item.uid}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },

  // 반 선택 탭바
  classTabBar: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  classTabContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  classTab: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  classTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  classTabText:       { fontSize: 12, fontWeight: '600', color: '#334155' },
  classTabTextActive: { color: '#fff' },

  // 날짜 선택
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateArrow: { padding: 4 },
  dateText:  { fontSize: 15, fontWeight: '700', color: '#0F172A' },

  // 요약 카운터
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryPresent: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  summaryLate:    { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  summaryAbsent:  { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  summaryCnt:  { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  summaryLbl:  { fontSize: 10, color: '#64748B', marginTop: 2 },

  // 명렬표
  listContent:   { paddingHorizontal: 16, paddingBottom: 32 },
  emptyText:     { fontSize: 14, fontWeight: '600', color: '#334155' },
  emptySubText:  { fontSize: 12, color: '#94A3B8' },
});
