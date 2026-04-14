import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TouchableWithoutFeedback, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDoc } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { getMonthlyAttendance, registerParentRecord } from '../../../lib/attendance';
import { useAuthStore } from '../../../store/useAuthStore';
import MonthlyCalendar from '../../../components/MonthlyCalendar';
import { strings } from '../../../constants/strings';
import type { User, AttendanceRecord, AttendanceStatus } from '../../../types/index';

// ─────────────────────────────────────────────────────────────
// ParentAttendanceScreen
// 학부모가 자녀의 월간 출결을 확인하고,
// 결석·지각 사유를 미리 또는 사후에 등록할 수 있는 화면.
// 저장 시 선생님 출결 onSnapshot에 자동 반영됨.
// ─────────────────────────────────────────────────────────────

// 결석 사유 선택지
const REASONS = strings.attendance.absenceReasons;

// 학부모가 선택 가능한 출결 상태 (present·onLeave 는 제외)
const SELECTABLE_STATUSES: { value: 'absent' | 'late'; label: string; color: string; bg: string }[] = [
  { value: 'absent', label: strings.attendance.absent,  color: '#991B1B', bg: '#FEF2F2' },
  { value: 'late',   label: strings.attendance.late,    color: '#78350F', bg: '#FFFBEB' },
];

// 최근 기록 날짜 표시: 'YYYY-MM-DD' → 'M/D 요일'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function formatRecordDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}

// 모달 날짜 표시: 'YYYY-MM-DD' → 'M월 D일 (요일)'
function formatModalDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

// 최근 출결 기록 텍스트·색상
function getStatusDisplay(record: AttendanceRecord): { text: string; color: string } {
  const reason = record.reason ? ` (${record.reason})` : '';
  switch (record.status) {
    case 'present': return { text: '○ 출석',          color: '#10B981' };
    case 'late':    return { text: `△ 지각${reason}`, color: '#F59E0B' };
    case 'absent':  return { text: `✕ 결석${reason}`, color: '#EF4444' };
    case 'onLeave': return { text: '- 휴원',           color: '#94A3B8' };
  }
}

// 출결 상태 뱃지 색상 (모달 상단 현재 상태 표시용)
const STATUS_BADGE: Record<AttendanceStatus, { label: string; bg: string; text: string }> = {
  present: { label: strings.attendance.present, bg: '#ECFDF5', text: '#065F46' },
  late:    { label: strings.attendance.late,    bg: '#FFFBEB', text: '#78350F' },
  absent:  { label: strings.attendance.absent,  bg: '#FEF2F2', text: '#991B1B' },
  onLeave: { label: strings.attendance.onLeave, bg: '#F1F5F9', text: '#64748B' },
};

// 이달 요약 4칸 아이템 컴포넌트
function SummaryItem({
  value, label, color, fontSize = 28,
}: { value: string | number; label: string; color: string; fontSize?: number }) {
  return (
    <View style={summaryStyles.wrap}>
      <Text style={[summaryStyles.value, { color, fontSize }]}>{value}</Text>
      <Text style={summaryStyles.label}>{label}</Text>
    </View>
  );
}
const summaryStyles = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center' },
  value: { fontWeight: '800' },
  label: { fontSize: 12, color: '#64748B', marginTop: 4 },
});

export default function ParentAttendanceScreen() {
  const { top } = useSafeAreaInsets();
  const { user, selectedChildUid, setSelectedChildUid } = useAuthStore();

  // ── 자녀 목록 ──────────────────────────────────────────────
  const [children, setChildren] = useState<User[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);

  // ── 달력 / 출결 상태 ────────────────────────────────────────
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [recordMap, setRecordMap] = useState<Record<string, AttendanceRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // ── 사유 등록 모달 ─────────────────────────────────────────
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'absent' | 'late' | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── 1) 자녀 목록 로드 ──────────────────────────────────────
  useEffect(() => {
    if (!user?.children?.length) {
      setIsLoadingChildren(false);
      return;
    }
    (async () => {
      try {
        const snaps = await Promise.all(
          user.children.map((uid) => getDoc(Collections.user(uid)))
        );
        const loaded = snaps
          .filter((s) => s.exists())
          .map((s) => ({ uid: s.id, ...s.data() } as User));
        setChildren(loaded);

        // store에 저장된 선택 자녀로 초기 인덱스 복원
        if (loaded.length > 0) {
          const storedIdx = selectedChildUid
            ? loaded.findIndex((c) => c.uid === selectedChildUid)
            : -1;
          if (storedIdx >= 0) {
            setSelectedIdx(storedIdx);
          } else {
            setSelectedIdx(0);
            setSelectedChildUid(loaded[0].uid);
          }
        }
      } catch {
        // 로드 실패 시 빈 목록 유지
      } finally {
        setIsLoadingChildren(false);
      }
    })();
  }, [user?.children]);

  const selectedChild = children[selectedIdx] ?? null;

  // ── 2) 선택 자녀의 월간 출결 로드 ─────────────────────────
  const loadMonthlyData = useCallback(async () => {
    if (!selectedChild?.uid || !selectedChild?.class_id) {
      setRecordMap({});
      return;
    }
    setIsLoading(true);
    setLoadError(false);
    try {
      const data = await getMonthlyAttendance(
        selectedChild.uid, selectedChild.class_id, year, month,
      );
      setRecordMap(data);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedChild?.uid, selectedChild?.class_id, year, month]);

  useEffect(() => { loadMonthlyData(); }, [loadMonthlyData]);

  const attendanceMap: Record<string, AttendanceStatus> = useMemo(
    () => Object.fromEntries(
      Object.entries(recordMap).map(([d, r]) => [d, r.status])
    ),
    [recordMap]
  );

  // ── 이달 요약 ──────────────────────────────────────────────
  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    Object.values(recordMap).forEach(({ status }) => {
      if (status === 'present') present++;
      else if (status === 'late') late++;
      else if (status === 'absent') absent++;
    });
    const total = present + late + absent;
    return { present, late, absent, rate: total > 0 ? Math.round((present / total) * 100) : null };
  }, [recordMap]);

  // ── 최근 출결 기록 ─────────────────────────────────────────
  const recentRecords = useMemo(
    () => Object.entries(recordMap).sort(([a], [b]) => b.localeCompare(a)).slice(0, 10),
    [recordMap]
  );

  // ── 날짜 탭 핸들러 ─────────────────────────────────────────
  // present·onLeave는 등록 대상 아님 → 모달 열지 않음
  function handleDatePress(dateKey: string) {
    const record = recordMap[dateKey];
    if (record?.status === 'present' || record?.status === 'onLeave') return;

    setModalDate(dateKey);
    // 기존 상태·사유가 있으면 해당 값으로 초기화
    setSelectedStatus(
      (record?.status === 'absent' || record?.status === 'late') ? record.status : null
    );
    setSelectedReason(REASONS.find((r) => r === record?.reason) ?? null);
  }

  function closeModal() {
    setModalDate(null);
    setSelectedStatus(null);
    setSelectedReason(null);
  }

  // ── 사유 저장 ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedChild?.class_id || !modalDate || !selectedStatus || !selectedReason || isSaving) return;
    setIsSaving(true);
    try {
      await registerParentRecord(
        selectedChild.class_id,
        modalDate,
        selectedChild.uid,
        selectedStatus,
        selectedReason,
      );
      // 로컬 상태 즉시 반영
      setRecordMap((prev) => ({
        ...prev,
        [modalDate]: {
          ...(prev[modalDate] ?? {}),
          status: selectedStatus,
          reason: selectedReason,
        } as AttendanceRecord,
      }));
      closeModal();
    } catch {
      Alert.alert('오류', strings.common.error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedChild, modalDate, selectedStatus, selectedReason, isSaving]);

  // ── 자녀 없음 안내 ─────────────────────────────────────────
  if (!isLoadingChildren && children.length === 0) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: top }]}>
        <Text style={styles.emptyIcon}>📅</Text>
        <Text style={styles.emptyTitle}>자녀를 연동해주세요</Text>
        <Text style={styles.emptySub}>
          자녀의 연동코드를 입력하면{'\n'}출결 이력을 확인할 수 있어요.
        </Text>
      </View>
    );
  }

  const modalRecord = modalDate ? recordMap[modalDate] ?? null : null;
  // 저장 버튼 활성 조건: 상태 + 사유 모두 선택
  const canSave = !!selectedStatus && !!selectedReason;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 제목 ── */}
        <Text style={styles.pageTitle}>{strings.attendance.title}</Text>

        {/* ── 자녀 탭 ── */}
        {isLoadingChildren ? (
          <ActivityIndicator size="small" color="#F59E0B" style={styles.loadingTab} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.childTabRow}
            style={styles.childTabScroll}
          >
            {children.map((child, idx) => (
              <TouchableOpacity
                key={child.uid}
                style={[styles.childTab, idx === selectedIdx && styles.childTabActive]}
                onPress={() => { setSelectedIdx(idx); setSelectedChildUid(child.uid); closeModal(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.childTabText, idx === selectedIdx && styles.childTabTextActive]}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── 이달 요약 카드 ── */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryMonth}>
            {strings.attendance.calendar.yearMonth(year, month)}
          </Text>
          <View style={styles.summaryRow}>
            <SummaryItem value={summary.present} label={strings.attendance.present} color="#5B50E8" />
            <SummaryItem value={summary.late}    label={strings.attendance.late}    color="#F59E0B" />
            <SummaryItem value={summary.absent}  label={strings.attendance.absent}  color="#EF4444" />
            <SummaryItem
              value={summary.rate !== null ? `${summary.rate}%` : '-'}
              label="출석률" color="#10B981" fontSize={26}
            />
          </View>
        </View>

        {/* ── 로딩 / 에러 / 반 미소속 안내 ── */}
        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#F59E0B" />
          </View>
        )}
        {!isLoading && loadError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{strings.attendance.loadFailed}</Text>
          </View>
        )}
        {!isLoading && !loadError && selectedChild && !selectedChild.class_id && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{strings.attendance.noClassMessage}</Text>
          </View>
        )}

        {/* ── 월간 달력 ── */}
        <MonthlyCalendar
          year={year}
          month={month}
          attendanceMap={attendanceMap}
          onMonthChange={(y, m) => { setYear(y); setMonth(m); }}
          onDatePress={handleDatePress}
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
                const tappable = record.status !== 'present' && record.status !== 'onLeave';
                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[styles.recentRow, isLast && styles.recentRowLast]}
                    activeOpacity={tappable ? 0.6 : 1}
                    onPress={tappable ? () => handleDatePress(dateKey) : undefined}
                  >
                    <Text style={styles.recentDate}>{formatRecordDate(dateKey)}</Text>
                    <View style={styles.recentRight}>
                      <Text style={[styles.recentStatus, { color }]}>{text}</Text>
                      {tappable && <Text style={styles.recentEditHint}>사유 등록 ›</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── 사유 등록 모달 ── */}
      <Modal
        visible={!!modalDate}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>

                {/* 날짜 + 현재 선생님 입력 상태 표시 */}
                <Text style={styles.modalDate}>
                  {modalDate ? formatModalDate(modalDate) : ''}
                </Text>

                {/* 선생님이 이미 입력한 상태가 있을 때 안내 뱃지 */}
                {modalRecord && (
                  <View style={styles.teacherStatusRow}>
                    <Text style={styles.teacherStatusLabel}>선생님 입력 상태</Text>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_BADGE[modalRecord.status].bg }]}>
                      <Text style={[styles.statusBadgeText, { color: STATUS_BADGE[modalRecord.status].text }]}>
                        {STATUS_BADGE[modalRecord.status].label}
                      </Text>
                    </View>
                  </View>
                )}

                {/* 상태 선택: 결석 / 지각 */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>어떤 사유인가요?</Text>
                  <View style={styles.chipRow}>
                    {SELECTABLE_STATUSES.map(({ value, label, color, bg }) => (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.statusChip,
                          selectedStatus === value && { backgroundColor: bg, borderColor: color },
                        ]}
                        onPress={() => setSelectedStatus(selectedStatus === value ? null : value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.statusChipText,
                          selectedStatus === value && { color },
                        ]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 사유 선택 */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>사유를 선택해주세요</Text>
                  <View style={styles.chipRow}>
                    {REASONS.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.reasonChip, selectedReason === r && styles.reasonChipSel]}
                        onPress={() => setSelectedReason(selectedReason === r ? null : r)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.reasonChipText, selectedReason === r && styles.reasonChipTextSel]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 선생님 자동 반영 안내 */}
                <View style={styles.autoNoticeRow}>
                  <Text style={styles.autoNoticeText}>
                    📢 저장하면 선생님 출결에 자동으로 반영돼요
                  </Text>
                </View>

                {/* 버튼 */}
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} activeOpacity={0.8}>
                    <Text style={styles.cancelBtnText}>{strings.common.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, (!canSave || isSaving) && styles.saveBtnOff]}
                    onPress={handleSave}
                    disabled={!canSave || isSaving}
                    activeOpacity={0.85}
                  >
                    {isSaving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.saveBtnText}>저장하기</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 14 },

  // 자녀 탭
  loadingTab: { marginBottom: 14 },
  childTabScroll: { marginBottom: 14 },
  childTabRow: { flexDirection: 'row', gap: 8 },
  childTab: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: '#F1F5F9' },
  childTabActive: { backgroundColor: '#F59E0B' },
  childTabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  childTabTextActive: { color: '#fff' },

  // 이달 요약
  summaryCard: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  summaryMonth: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },

  // 로딩 / 에러
  loadingRow: { alignItems: 'center', paddingVertical: 8, marginBottom: 12 },
  errorCard: {
    backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    padding: 14, alignItems: 'center', marginBottom: 16,
  },
  errorText: { fontSize: 14, color: '#991B1B', fontWeight: '500' },

  // 달력 노-카드
  calendarNoCard: { borderWidth: 0, backgroundColor: 'transparent', borderRadius: 0, padding: 0, paddingVertical: 0 },

  // 최근 기록
  recentSection: { marginTop: 16 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 10 },
  recentCard: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, paddingHorizontal: 14,
  },
  recentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  recentRowLast: { borderBottomWidth: 0 },
  recentDate: { fontSize: 14, color: '#64748B' },
  recentRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentStatus: { fontSize: 14, fontWeight: '700' },
  recentEditHint: { fontSize: 12, color: '#94A3B8' },

  // 자녀 없음
  emptyContainer: {
    flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 32, gap: 10,
  },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  // ── 모달 ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 16,
  },
  modalDate: { fontSize: 17, fontWeight: '700', color: '#0F172A', textAlign: 'center' },

  // 선생님 입력 상태 안내
  teacherStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  teacherStatusLabel: { fontSize: 13, color: '#94A3B8' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  statusBadgeText: { fontSize: 14, fontWeight: '700' },

  // 상태·사유 섹션
  section: { gap: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  // 상태 칩 (결석/지각)
  statusChip: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 18, backgroundColor: '#fff',
  },
  statusChipText: { fontSize: 15, fontWeight: '700', color: '#64748B' },

  // 사유 칩
  reasonChip: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff',
  },
  reasonChipSel: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  reasonChipText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  reasonChipTextSel: { color: '#fff' },

  // 안내
  autoNoticeRow: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10 },
  autoNoticeText: { fontSize: 13, color: '#78350F', textAlign: 'center' },

  // 버튼
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, height: 48, backgroundColor: '#F1F5F9',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
  saveBtn: {
    flex: 2, height: 48, backgroundColor: '#F59E0B',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnOff: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
