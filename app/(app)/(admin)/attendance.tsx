import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { query, where, getDocs } from 'firebase/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Collections } from '../../../lib/firestore';
import { setAttendanceRecord, subscribeAttendanceRecords, updateAttendanceReason } from '../../../lib/attendance';
import AttendanceRow from '../../../components/AttendanceRow';
import type { Class, User, AttendanceRecord, AttendanceStatus } from '../../../types';

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

// 날짜 스트립: 과거 20일 ~ 미래 9일 (총 30개)
const TODAY = toDateStr(new Date());
const DATE_LIST: string[] = Array.from({ length: 30 }, (_, i) => offsetDate(TODAY, i - 20));
const TODAY_INDEX = 20;

// ─────────────────────────────────────────────────────────────
// 반별 출결 집계 타입
// ─────────────────────────────────────────────────────────────

interface ClassStat {
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
  rate: number; // 출석률 0~100
}

// ─────────────────────────────────────────────────────────────
// AdminAttendanceScreen
// ─────────────────────────────────────────────────────────────

export default function AdminAttendanceScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const dateListRef = useRef<FlatList<string>>(null);

  const [classes, setClasses]     = useState<Class[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [classStats, setClassStats]     = useState<Record<string, ClassStat>>({});
  // classId → 담당 선생님 이름
  const [teacherMap, setTeacherMap]     = useState<Record<string, string>>({});
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingStats, setIsLoadingStats]     = useState(false);

  // ── 반 상세 모달 상태 ──
  const [detailClass, setDetailClass] = useState<Class | null>(null);
  const isDetailOpen = detailClass !== null;

  // ── 1. 반 목록 + 선생님 역매핑 로드 ──
  useEffect(() => {
    if (!user?.academy_id) return;

    Promise.all([
      getDocs(query(Collections.classes(), where('academy_id', '==', user.academy_id))),
      getDocs(
        query(
          Collections.users(),
          where('academy_id', '==', user.academy_id),
          where('role', '==', 'teacher'),
          where('is_active', '==', true),
        )
      ),
    ]).then(([classSnap, teacherSnap]) => {
      setClasses(classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));

      // 선생님 역매핑: classId → 첫 번째 담당 선생님 이름
      const tMap: Record<string, string> = {};
      teacherSnap.docs.forEach(d => {
        const teacher = d.data() as User;
        (teacher.assigned_class_ids ?? []).forEach(cid => {
          if (!tMap[cid]) tMap[cid] = teacher.name;
        });
      });
      setTeacherMap(tMap);
    }).catch(e => {
      console.error('[AdminAttendance] 반/선생님 로드 실패:', e);
    }).finally(() => {
      setIsLoadingClasses(false);
    });
  }, [user?.academy_id]);

  // ── 2. 날짜 변경 시 반별 출결 통계 집계 ──
  useEffect(() => {
    if (classes.length === 0 || !user?.academy_id) return;

    setIsLoadingStats(true);
    setClassStats({});

    Promise.all(
      classes.map(async (cls) => {
        const [studentSnap, recordsSnap] = await Promise.all([
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('class_id', '==', cls.id),
              where('role', '==', 'student'),
              where('is_active', '==', true),
            )
          ),
          getDocs(Collections.attendanceRecords(cls.id, selectedDate)),
        ]);

        const totalStudents = studentSnap.size;
        let present = 0, late = 0, absent = 0;

        recordsSnap.forEach(d => {
          const r = d.data() as AttendanceRecord;
          if (r.status === 'present') present++;
          else if (r.status === 'late') late++;
          else if (r.status === 'absent') absent++;
        });

        const rate = totalStudents > 0
          ? Math.round((present / totalStudents) * 100)
          : 0;

        return { classId: cls.id, stat: { totalStudents, present, late, absent, rate } };
      })
    ).then(results => {
      const map: Record<string, ClassStat> = {};
      results.forEach(({ classId, stat }) => { map[classId] = stat; });
      setClassStats(map);
    }).catch(e => {
      console.error('[AdminAttendance] 통계 로드 실패:', e);
    }).finally(() => {
      setIsLoadingStats(false);
    });
  }, [classes, selectedDate]);

  // ── 엑셀 내보내기 (공유) ──
  const handleExport = useCallback(async () => {
    try {
      await Share.share({
        message: `${selectedDate} 출결 현황\n` +
          classes.map(cls => {
            const s = classStats[cls.id];
            if (!s) return `${cls.name}: -`;
            return `${cls.name}: 출석 ${s.present}명 / 지각 ${s.late}명 / 결석 ${s.absent}명 (${s.rate}%)`;
          }).join('\n'),
      });
    } catch {/* ignore */}
  }, [classes, classStats, selectedDate]);

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
        <Text style={styles.emptyText}>등록된 반이 없어요</Text>
        <Text style={styles.emptySubText}>설정에서 반을 먼저 추가해주세요</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>출결 관리</Text>
          <Text style={styles.headerSub}>전체 반 통합 현황</Text>
        </View>
        <TouchableOpacity style={styles.excelBtn} onPress={handleExport} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={14} color="#fff" />
          <Text style={styles.excelBtnText}>엑셀</Text>
        </TouchableOpacity>
      </View>

      {/* ── 날짜 스트립 (과거 20일 ~ 미래 9일) ── */}
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
              onPress={() => setSelectedDate(item)}
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

      {/* ── 반별 출결 카드 목록 ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {isLoadingStats ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#5B50E8" />
          </View>
        ) : (
          classes.map(cls => (
            <ClassCard
              key={cls.id}
              cls={cls}
              stat={classStats[cls.id]}
              teacherName={teacherMap[cls.id] ?? null}
              onPress={() => setDetailClass(cls)}
            />
          ))
        )}
      </ScrollView>

      {/* ── 반별 출결 상세 모달 ── */}
      {user && (
        <AttendanceDetailModal
          visible={isDetailOpen}
          cls={detailClass}
          date={selectedDate}
          academyId={user.academy_id}
          onClose={() => setDetailClass(null)}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ClassCard — 반별 출결 현황 카드
// ─────────────────────────────────────────────────────────────

interface ClassCardProps {
  cls: Class;
  stat?: ClassStat;
  teacherName: string | null;
  onPress: () => void;
}

function ClassCard({ cls, stat, teacherName, onPress }: ClassCardProps) {
  const rate = stat?.rate ?? 0;

  return (
    <TouchableOpacity style={cardStyles.container} onPress={onPress} activeOpacity={0.8}>
      {/* 상단: 반이름 + 출석률 */}
      <View style={cardStyles.topRow}>
        <View>
          <Text style={cardStyles.className}>{cls.name}</Text>
          {teacherName && (
            <Text style={cardStyles.teacherName}>{teacherName} 선생님</Text>
          )}
        </View>
        <Text style={[
          cardStyles.rateText,
          rate >= 90 ? cardStyles.rateGood :
          rate >= 70 ? cardStyles.rateWarning :
          cardStyles.rateDanger,
        ]}>
          {stat ? `${rate}%` : '-'}
        </Text>
      </View>

      {/* 통계 칩 행 */}
      {stat ? (
        <View style={cardStyles.statRow}>
          <StatChip count={stat.present} label="출석" bg="#ECFDF5" color="#065F46" />
          <StatChip count={stat.late}    label="지각" bg="#FFFBEB" color="#78350F" />
          <StatChip count={stat.absent}  label="결석" bg="#FEF2F2" color="#991B1B" />
        </View>
      ) : (
        <ActivityIndicator size="small" color="#94A3B8" style={{ marginTop: 10 }} />
      )}

      {/* 우측 하단 화살표 — 클릭 가능 힌트 */}
      <View style={cardStyles.arrowRow}>
        <Text style={cardStyles.arrowHint}>출결 상세 보기 / 수정</Text>
        <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// StatChip — 출결 통계 칩
// ─────────────────────────────────────────────────────────────

function StatChip({
  count, label, bg, color,
}: { count: number; label: string; bg: string; color: string }) {
  return (
    <View style={[chipStyles.container, { backgroundColor: bg }]}>
      <Text style={[chipStyles.count, { color }]}>{count}</Text>
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText:    { fontSize: 15, fontWeight: '600', color: '#334155' },
  emptySubText: { fontSize: 13, color: '#94A3B8' },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSub:   { fontSize: 13, color: '#64748B', marginTop: 2 },
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#5B50E8',
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  excelBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // 날짜 스트립
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
  datePillSelected:     { backgroundColor: '#5B50E8' },
  datePillToday:        { backgroundColor: '#EEEDF9' },
  datePillWeekday:      { fontSize: 12, fontWeight: '500', color: '#94A3B8' },
  datePillDay:          { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  datePillTextSelected: { color: '#fff' },
  todayDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#5B50E8', marginTop: 1,
  },

  // 스크롤
  scrollContent: { padding: 16, gap: 12, paddingBottom: 32 },
  loadingBox:    { paddingVertical: 40, alignItems: 'center' },
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },

  // 상단 행: 반이름/선생님 + 출석률
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  className:   { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  teacherName: { fontSize: 13, color: '#64748B', marginTop: 3 },
  rateText:    { fontSize: 24, fontWeight: '800' },
  rateGood:    { color: '#10B981' },
  rateWarning: { color: '#F59E0B' },
  rateDanger:  { color: '#EF4444' },

  // 통계 칩 행
  statRow: { flexDirection: 'row', gap: 8 },

  // 화살표 힌트 행
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 4,
  },
  arrowHint: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

const chipStyles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  count: { fontSize: 24, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────
// AttendanceDetailModal — 반 클릭 시 열리는 출결 상세/수정 모달
// ─────────────────────────────────────────────────────────────

interface DetailModalProps {
  visible: boolean;
  cls: Class | null;
  date: string;
  academyId: string;
  onClose: () => void;
}

function AttendanceDetailModal({ visible, cls, date, academyId, onClose }: DetailModalProps) {
  const [students, setStudents]           = useState<User[]>([]);
  const [records, setRecords]             = useState<Record<string, AttendanceRecord>>({});
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSavingAll, setIsSavingAll]     = useState(false);

  const unsubRef = useRef<(() => void) | null>(null);

  // ── 모달 열릴 때마다 학생 목록 + 출결 실시간 구독 ──
  useEffect(() => {
    if (!visible || !cls) return;

    setIsLoadingStudents(true);
    setRecords({});
    setPendingStatuses({});

    // 학생 목록 조회
    getDocs(
      query(
        Collections.users(),
        where('academy_id', '==', academyId),
        where('class_id', '==', cls.id),
        where('role', '==', 'student'),
        where('is_active', '==', true),
      )
    ).then((snap) => {
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
    }).catch((e) => {
      console.error('[AdminAttendanceDetail] 학생 목록 로드 실패:', e);
    }).finally(() => {
      setIsLoadingStudents(false);
    });

    // 출결 레코드 실시간 구독
    const unsub = subscribeAttendanceRecords(
      cls.id,
      date,
      (newRecords) => setRecords(newRecords),
      (e) => console.error('[AdminAttendanceDetail] 출결 구독 오류:', e),
    );
    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [visible, cls?.id, date]);

  // ── 모달 닫힐 때 구독 정리 ──
  useEffect(() => {
    if (!visible && unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, [visible]);

  // ── 표시용 상태: 임시 상태 우선, 없으면 Firestore 상태 ──
  const mergedStatuses = useMemo(() => {
    const result: Record<string, AttendanceStatus | null> = {};
    students.forEach(({ uid }) => {
      result[uid] = pendingStatuses[uid] ?? records[uid]?.status ?? null;
    });
    return result;
  }, [students, pendingStatuses, records]);

  // ── 출결 상태 변경 (로컬 임시 저장) ──
  const handleStatusChange = useCallback((studentUid: string, status: AttendanceStatus) => {
    setPendingStatuses((prev) => ({ ...prev, [studentUid]: status }));
  }, []);

  // ── 사유 즉시 저장 ──
  const handleReasonSave = useCallback(async (studentUid: string, reason: string | null) => {
    if (!cls) return;
    try {
      await updateAttendanceReason(cls.id, date, studentUid, reason);
    } catch (e) {
      console.error('[AdminAttendanceDetail] 사유 저장 실패:', e);
    }
  }, [cls?.id, date]);

  // ── 전체 저장 ──
  const handleSaveAll = useCallback(async () => {
    if (!cls || !academyId) return;

    const toSave = students
      .map(({ uid }) => ({ uid, status: mergedStatuses[uid] }))
      .filter((s): s is { uid: string; status: AttendanceStatus } => s.status !== null);

    if (toSave.length === 0) return;

    setIsSavingAll(true);
    try {
      await Promise.all(
        toSave.map(({ uid, status }) =>
          setAttendanceRecord(cls.id, date, uid, status, academyId)
        )
      );
      // 저장 완료 후 임시 상태 초기화
      setPendingStatuses({});
    } catch (e) {
      console.error('[AdminAttendanceDetail] 일괄 저장 실패:', e);
    } finally {
      setIsSavingAll(false);
    }
  }, [cls?.id, date, academyId, students, mergedStatuses]);

  const summary = useMemo(() => {
    const values = Object.values(mergedStatuses);
    return {
      present: values.filter((s) => s === 'present').length,
      late:    values.filter((s) => s === 'late').length,
      absent:  values.filter((s) => s === 'absent').length,
    };
  }, [mergedStatuses]);

  const hasPending   = Object.keys(pendingStatuses).length > 0;
  const notEntered   = students.length - summary.present - summary.late - summary.absent;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={modalStyles.container}>
        {/* ── 모달 헤더 ── */}
        <View style={modalStyles.header}>
          <View>
            <Text style={modalStyles.headerTitle}>{cls?.name ?? ''}</Text>
            <Text style={modalStyles.headerSub}>{date} 출결 현황</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* ── 요약 카운터 ── */}
        <View style={modalStyles.summaryRow}>
          <ModalSummaryChip count={summary.present} label="출석" color="#10B981" />
          <ModalSummaryChip count={summary.late}    label="지각" color="#F59E0B" />
          <ModalSummaryChip count={summary.absent}  label="결석" color="#EF4444" />
          <ModalSummaryChip count={notEntered}      label="미입력" color="#94A3B8" />
        </View>

        {/* ── 명렬표 ── */}
        {isLoadingStudents ? (
          <View style={modalStyles.centered}>
            <ActivityIndicator color="#5B50E8" />
          </View>
        ) : students.length === 0 ? (
          <View style={modalStyles.centered}>
            <Text style={modalStyles.emptyText}>등록된 학생이 없어요</Text>
          </View>
        ) : (
          <FlatList
            data={students}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={modalStyles.listContent}
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

        {/* ── 저장하기 버튼 ── */}
        <View style={modalStyles.saveWrapper}>
          <TouchableOpacity
            style={[modalStyles.saveBtn, !hasPending && modalStyles.saveBtnDisabled]}
            onPress={handleSaveAll}
            disabled={!hasPending || isSavingAll}
            activeOpacity={0.8}
          >
            {isSavingAll ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[modalStyles.saveBtnText, !hasPending && modalStyles.saveBtnTextDisabled]}>
                저장하기
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── 모달 내 요약 칩 ──────────────────────────────────────────
function ModalSummaryChip({ count, label, color }: {
  count: number; label: string; color: string;
}) {
  return (
    <View style={modalStyles.summaryChip}>
      <Text style={[modalStyles.summaryCnt, { color }]}>{count}</Text>
      <Text style={modalStyles.summaryLbl}>{label}</Text>
    </View>
  );
}

const modalStyles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:   { fontSize: 15, fontWeight: '600', color: '#334155' },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSub:   { fontSize: 13, color: '#64748B', marginTop: 3 },
  closeBtn: {
    padding: 4,
    marginTop: 2,
  },

  // 요약 카운터
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryChip: { flex: 1, alignItems: 'center', gap: 2 },
  summaryCnt:  { fontSize: 24, fontWeight: '800' },
  summaryLbl:  { fontSize: 12, color: '#94A3B8', fontWeight: '500' },

  // 명렬표
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },

  // 저장 버튼
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
  saveBtnDisabled:     { backgroundColor: '#E2E8F0' },
  saveBtnText:         { fontSize: 16, fontWeight: '700', color: '#fff' },
  saveBtnTextDisabled: { color: '#94A3B8' },
});
