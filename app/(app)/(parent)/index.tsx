import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getDoc, getDocs, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { getMonthlyAttendance, sendAbsenceReason } from '../../../lib/attendance';
import { useAuthStore } from '../../../store/useAuthStore';
import { strings } from '../../../constants/strings';
import type { User, AttendanceRecord, AttendanceStatus, Homework, Submission } from '../../../types/index';

// 결석 사유 목록 — strings.ts에서 관리
const REASONS = strings.attendance.absenceReasons;

// 출결 상태별 이모지 / 레이블 매핑
const STATUS_CONFIG: Record<AttendanceStatus, { emoji: string; label: string }> = {
  present:  { emoji: '✅', label: strings.attendance.present },
  late:     { emoji: '⏰', label: strings.attendance.late },
  absent:   { emoji: '❌', label: strings.attendance.absent },
  onLeave:  { emoji: '🏠', label: strings.attendance.onLeave },
};

// 오늘 날짜 문자열 (YYYY-MM-DD) — 로컬 시간 기준
function getTodayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function ParentHomeScreen() {
  const { user } = useAuthStore();
  const parentName = user?.name ?? '부모님';

  // ── 자녀 목록 상태 ──────────────────────────────────────────
  const [children, setChildren] = useState<User[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);

  // ── 오늘 출결 상태 (undefined = 로딩 중 / null = 기록 없음) ─
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null | undefined>(undefined);

  // ── 이번달 출결 맵 ──────────────────────────────────────────
  const [monthlyAttendance, setMonthlyAttendance] = useState<Record<string, AttendanceRecord>>({});

  // ── 결석 사유 전송 ──────────────────────────────────────────
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // ── 오늘 숙제 현황 ──────────────────────────────────────────
  interface HwStatus extends Homework { submitted: boolean; feedback: '👍' | '💧' | null; }
  const [todayHomeworks, setTodayHomeworks] = useState<HwStatus[]>([]);

  const todayStr = getTodayStr();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── 1) 자녀 목록 로드 ──────────────────────────────────────
  useEffect(() => {
    if (!user?.children?.length) {
      setIsLoadingChildren(false);
      return;
    }

    const loadChildren = async () => {
      try {
        const snaps = await Promise.all(
          user.children.map((uid) => getDoc(Collections.user(uid)))
        );
        const loaded = snaps
          .filter((snap) => snap.exists())
          .map((snap) => ({ uid: snap.id, ...snap.data() } as User));
        setChildren(loaded);
      } catch {
        // 로드 실패 시 빈 목록 유지
      } finally {
        setIsLoadingChildren(false);
      }
    };

    loadChildren();
  }, [user?.children]);

  // 현재 선택된 자녀
  const selectedChild = children[selectedIdx] ?? null;

  // ── 2) 오늘 출결 실시간 구독 ──────────────────────────────
  useEffect(() => {
    if (!selectedChild?.class_id) {
      setTodayRecord(null);
      return;
    }

    // 로딩 상태로 초기화
    setTodayRecord(undefined);

    // 해당 학생의 오늘 records 문서 구독
    const recordRef = doc(
      db,
      'attendances',
      `${selectedChild.class_id}_${todayStr}`,
      'records',
      selectedChild.uid,
    );

    const unsub = onSnapshot(
      recordRef,
      (snap) => {
        setTodayRecord(snap.exists() ? (snap.data() as AttendanceRecord) : null);
      },
      () => {
        setTodayRecord(null);
      },
    );

    return () => unsub();
  }, [selectedChild?.uid, selectedChild?.class_id, todayStr]);

  // ── 3-1) 오늘 숙제 현황 로드 (자녀 변경 시 재조회) ────────
  useEffect(() => {
    if (!selectedChild?.class_id || !selectedChild?.uid) {
      setTodayHomeworks([]);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    getDocs(
      query(Collections.homeworks(), where('class_id', '==', selectedChild.class_id))
    ).then(async (hwSnap) => {
      const list = hwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
      // 오늘 마감이거나 아직 마감되지 않은 숙제만 필터
      const active = list.filter(hw => {
        const due = hw.due_date.toDate();
        due.setHours(0, 0, 0, 0);
        return due.getTime() >= today.getTime();
      });

      const withStatus = await Promise.all(
        active.map(async (hw) => {
          const subSnap = await getDoc(Collections.submission(hw.id, selectedChild.uid));
          const sub = subSnap.exists() ? (subSnap.data() as Submission) : null;
          return { ...hw, submitted: !!sub, feedback: sub?.feedback ?? null } as HwStatus;
        })
      );
      setTodayHomeworks(withStatus);
    }).catch(() => setTodayHomeworks([]));
  }, [selectedChild?.uid, selectedChild?.class_id]);

  // ── 3) 이번달 출석률 로드 ──────────────────────────────────
  useEffect(() => {
    if (!selectedChild?.uid || !selectedChild?.class_id) {
      setMonthlyAttendance({});
      return;
    }

    getMonthlyAttendance(selectedChild.uid, selectedChild.class_id, year, month)
      .then(setMonthlyAttendance)
      .catch(() => setMonthlyAttendance({}));
  }, [selectedChild?.uid, selectedChild?.class_id, year, month]);

  // 이번달 출석률 계산 (present 건수 / 전체 기록 건수)
  const monthlyRate = useMemo(() => {
    const records = Object.values(monthlyAttendance);
    if (!records.length) return null;
    const presentCount = records.filter((r) => r.status === 'present').length;
    return Math.round((presentCount / records.length) * 100);
  }, [monthlyAttendance]);

  // ── 4) 결석 사유 전송 ──────────────────────────────────────
  const handleSendReason = useCallback(async () => {
    if (!selectedChild?.class_id || !selectedReason || isSending) return;

    setIsSending(true);
    try {
      await sendAbsenceReason(
        selectedChild.class_id,
        todayStr,
        selectedChild.uid,
        selectedReason,
      );
      Alert.alert('전송 완료', '결석 사유를 선생님께 전송했어요.');
      setSelectedReason(null);
    } catch {
      Alert.alert('오류', strings.common.error);
    } finally {
      setIsSending(false);
    }
  }, [selectedChild, selectedReason, isSending, todayStr]);

  // ── 오늘 출결 표시 값 계산 ─────────────────────────────────
  const statusDisplay = useMemo(() => {
    if (todayRecord === undefined) return { emoji: '⏳', label: '확인 중...', sub: '' };
    if (todayRecord === null)      return { emoji: '❓', label: '미확인', sub: '아직 출결이 입력되지 않았어요' };
    const cfg = STATUS_CONFIG[todayRecord.status];
    return {
      emoji: cfg.emoji,
      label: cfg.label,
      sub: todayRecord.reason ?? '',
    };
  }, [todayRecord]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>자녀 현황을 확인하세요</Text>
          <Text style={styles.name}>{parentName} 부모님 👋</Text>

          {/* 자녀 탭 — Firestore 로드 후 렌더링 */}
          <View style={styles.childTabs}>
            {isLoadingChildren ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : children.length === 0 ? (
              <View style={styles.childTabActive}>
                <Text style={styles.childTabActiveText}>자녀 없음</Text>
              </View>
            ) : (
              children.map((child, idx) => (
                <TouchableOpacity
                  key={child.uid}
                  style={idx === selectedIdx ? styles.childTabActive : styles.childTabInactive}
                  onPress={() => {
                    setSelectedIdx(idx);
                    setSelectedReason(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={
                      idx === selectedIdx
                        ? styles.childTabActiveText
                        : styles.childTabInactiveText
                    }
                  >
                    {child.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
        <View style={styles.bellBtn}>
          <Text style={styles.bellEmoji}>🔔</Text>
        </View>
      </View>

      <View style={styles.body}>

        {/* ── 오늘 출결 (주황 그라데이션) ── */}
        <LinearGradient
          colors={['#F59E0B', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.attendCard}
        >
          <View style={styles.attendLeft}>
            <Text style={styles.attendEmoji}>{statusDisplay.emoji}</Text>
            <View>
              <Text style={styles.attendStatus}>{statusDisplay.label}</Text>
              {!!statusDisplay.sub && (
                <Text style={styles.attendTime}>{statusDisplay.sub}</Text>
              )}
            </View>
          </View>
          <View style={styles.attendRight}>
            <Text style={styles.attendRateLabel}>이번달 출석률</Text>
            <Text style={styles.attendRate}>
              {monthlyRate !== null ? `${monthlyRate}%` : '-'}
            </Text>
          </View>
        </LinearGradient>

        {/* ── 오늘 숙제 현황 — 자녀가 있을 때만 표시 ── */}
        {selectedChild && todayHomeworks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✏️ 오늘 숙제</Text>
            {todayHomeworks.map((hw) => (
              <View
                key={hw.id}
                style={[styles.hwCard, hw.submitted ? styles.hwCardDone : styles.hwCardPending]}
              >
                <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                <View style={styles.hwStatusRow}>
                  <Text style={hw.submitted ? styles.hwStatusDone : styles.hwStatusPending}>
                    {hw.submitted ? '✅ 제출완료' : '❌ 미제출'}
                  </Text>
                  {hw.feedback && (
                    <Text style={styles.hwFeedback}>선생님: {hw.feedback}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── 결석 사유 전송 — 자녀가 있을 때만 표시 ── */}
        {selectedChild && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 결석 사유 전송</Text>
            <Text style={styles.reasonDesc}>
              오늘 결석하나요? 선생님께 사유를 보내주세요.
            </Text>
            <View style={styles.reasonRow}>
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
            <TouchableOpacity
              style={[styles.sendBtn, (!selectedReason || isSending) && styles.sendBtnOff]}
              disabled={!selectedReason || isSending}
              onPress={handleSendReason}
              activeOpacity={0.85}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendBtnText}>선생님께 전송하기</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── 자녀가 없을 때 안내 ── */}
        {!isLoadingChildren && children.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardEmoji}>👨‍👧</Text>
            <Text style={styles.emptyCardTitle}>자녀를 연동해주세요</Text>
            <Text style={styles.emptyCardSub}>
              자녀의 연동코드를 입력하면{'\n'}출결·숙제 현황을 확인할 수 있어요.
            </Text>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 32 },

  // 헤더
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 14, color: '#64748B' },
  name: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 2, letterSpacing: -0.5 },
  childTabs: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  childTabActive: {
    backgroundColor: '#F59E0B', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  childTabActiveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  childTabInactive: {
    backgroundColor: '#F1F5F9', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  childTabInactiveText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center',
  },
  bellEmoji: { fontSize: 20 },

  body: { paddingHorizontal: 16 },

  // 출결 카드
  attendCard: {
    borderRadius: 14, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16,
  },
  attendLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attendEmoji: { fontSize: 36 },
  attendStatus: { fontSize: 20, fontWeight: '800', color: '#fff' },
  attendTime: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  attendRight: { alignItems: 'flex-end' },
  attendRateLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  attendRate: { fontSize: 24, fontWeight: '800', color: '#fff' },

  // 섹션
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 10 },

  // 숙제 카드
  hwCard: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, padding: 12, marginBottom: 8,
  },
  hwCardDone: { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' },
  hwCardPending: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  hwTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  hwStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hwStatusDone: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  hwStatusPending: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  hwFeedback: { fontSize: 13, color: '#64748B' },

  // 결석 사유
  reasonDesc: { fontSize: 14, color: '#64748B', marginBottom: 12 },
  reasonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  reasonChip: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff',
  },
  reasonChipSel: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  reasonChipText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  reasonChipTextSel: { color: '#fff' },
  sendBtn: {
    height: 52, borderRadius: 14, backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.45 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // 자녀 없을 때 안내 카드
  emptyCard: {
    marginTop: 40, alignItems: 'center', padding: 24,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14,
  },
  emptyCardEmoji: { fontSize: 40, marginBottom: 12 },
  emptyCardTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyCardSub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
