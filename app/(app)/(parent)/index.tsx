import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDoc, getDocs, doc, onSnapshot, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { getMonthlyAttendance, sendAbsenceReason } from '../../../lib/attendance';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { strings } from '../../../constants/strings';
import type { User, AttendanceRecord, AttendanceStatus, Homework, Submission, Notice } from '../../../types/index';

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
  const { top } = useSafeAreaInsets();
  const { user, selectedChildUid, setSelectedChildUid } = useAuthStore();
  const parentName = user?.name ?? '부모님';
  const unreadCount = useNotificationStore((s) => s.unreadCount);

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
  interface HwStatus extends Homework {
    submitted: boolean;
    subStatus: 'submitted' | 'checked' | null; // Firestore submission.status
    feedback: '👍' | '💧' | null;
    feedback_comment?: string;
  }
  const [todayHomeworks, setTodayHomeworks] = useState<HwStatus[]>([]);

  // ── 최근 공지 (학원 기준 최신 2개) ─────────────────────────
  const [recentNotices, setRecentNotices] = useState<Notice[]>([]);
  const [isLoadingNotices, setIsLoadingNotices] = useState(false);


  const todayStr = getTodayStr();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── 1) 자녀 문서 실시간 구독 ──────────────────────────────
  // onSnapshot 사용 — 선생님이 teacher_feedback 등 필드를 변경하면 즉시 반영
  useEffect(() => {
    if (!user?.children?.length) {
      setIsLoadingChildren(false);
      return;
    }

    const childUids = user.children;
    let loadedCount = 0;

    // 자녀별 구독 해제 함수 목록
    const unsubs = childUids.map((childUid) =>
      onSnapshot(
        Collections.user(childUid),
        (snap) => {
          if (!snap.exists()) {
            loadedCount++;
            if (loadedCount >= childUids.length) setIsLoadingChildren(false);
            return;
          }
          const updated = { uid: snap.id, ...snap.data() } as User;

          setChildren((prev) => {
            const idx = prev.findIndex((c) => c.uid === childUid);
            if (idx >= 0) {
              // 기존 항목만 교체 (순서 유지)
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            // 처음 추가 — user.children 배열 순서 기준으로 정렬
            const next = [...prev, updated];
            next.sort((a, b) => childUids.indexOf(a.uid) - childUids.indexOf(b.uid));
            return next;
          });

          loadedCount++;
          if (loadedCount >= childUids.length) setIsLoadingChildren(false);
        },
        () => {
          loadedCount++;
          if (loadedCount >= childUids.length) setIsLoadingChildren(false);
        }
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.children?.join(',')]);

  // ── 1-1) 자녀 로드 완료 후 초기 선택 자녀 설정 ─────────────
  // children 배열이 처음 채워질 때 한 번만 실행
  useEffect(() => {
    if (children.length === 0) return;
    const storedIdx = selectedChildUid
      ? children.findIndex((c) => c.uid === selectedChildUid)
      : -1;
    if (storedIdx >= 0) {
      setSelectedIdx(storedIdx);
    } else {
      setSelectedIdx(0);
      setSelectedChildUid(children[0].uid);
    }
    // children이 처음 채워질 때만 실행 (이후 피드백 업데이트로 재실행 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

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

      // 내일 자정 기준 (오늘 + 1일)
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      // 마감일이 오늘 또는 내일인 숙제만 표시 (당일 + 전날 알림 용도)
      const active = list.filter(hw => {
        const due = hw.due_date.toDate();
        due.setHours(0, 0, 0, 0);
        return due.getTime() >= today.getTime() && due.getTime() <= tomorrow.getTime();
      });

      const withStatus = await Promise.all(
        active.map(async (hw) => {
          const subSnap = await getDoc(Collections.submission(hw.id, selectedChild.uid));
          const sub = subSnap.exists() ? (subSnap.data() as Submission) : null;
          return {
            ...hw,
            submitted: !!sub,
            subStatus: sub?.status ?? null,
            feedback: sub?.feedback ?? null,
            feedback_comment: sub?.feedback_comment ?? '',
          } as HwStatus;
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

  // 이번달 출결 일수 집계 (출석 · 지각 · 결석)
  const monthlyCounts = useMemo(() => {
    const records = Object.values(monthlyAttendance);
    return {
      present: records.filter((r) => r.status === 'present').length,
      late:    records.filter((r) => r.status === 'late').length,
      absent:  records.filter((r) => r.status === 'absent').length,
    };
  }, [monthlyAttendance]);

  // ── 4) 최근 공지 로드 (학원 기준) ────────────────────────────
  useEffect(() => {
    if (!user?.academy_id) return;

    setIsLoadingNotices(true);
    getDocs(
      query(
        Collections.notices(),
        where('academy_id', '==', user.academy_id),
        orderBy('is_important', 'desc'),
        orderBy('created_at', 'desc'),
        limit(2),
      )
    )
      .then((snap) => {
        setRecentNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice)));
      })
      .catch(() => setRecentNotices([]))
      .finally(() => setIsLoadingNotices(false));
  }, [user?.academy_id]);

  // ── 5) 결석 사유 전송 ──────────────────────────────────────
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

  // ── 날짜 차이 → "N일 전" 텍스트 변환 ─────────────────────────
  const daysAgoText = useCallback((ts: Timestamp): string => {
    const diffMs = Date.now() - ts.toMillis();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '1일 전';
    return `${diffDays}일 전`;
  }, []);

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
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>오늘도 믿고 맡겨주세요 🙏</Text>
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
                    setSelectedChildUid(child.uid); // 전체 화면에 자녀 선택 공유
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
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => router.push('/common/notification-inbox')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color="#0F172A" />
          {/* 미읽음 dot 배지 — 숫자 없이 점만 표시 (ui-screens.md 규칙) */}
          {unreadCount > 0 && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>

        {/* ── 오늘 출결 (주황 그라데이션) ── */}
        <LinearGradient
          colors={['#FBBF24', '#F59E0B', '#D97706']}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.attendCard}
        >
          {/* 반투명 원형 장식 */}
          <View style={styles.attendDecorCircle} />

          {/* 상단 Row: 타이틀 | 날짜 */}
          <View style={styles.attendTop}>
            <Text style={styles.attendCardLabel}>오늘 출결 현황</Text>
            <Text style={styles.attendDate}>{month}월 {new Date().getDate()}일</Text>
          </View>

          {/* 중간 Row: 아이콘 박스 + 상태 텍스트 */}
          <View style={styles.attendMain}>
            {/* 상태별 텍스트 기호 아이콘 박스 */}
            <View style={styles.attendIconBox}>
              <Text style={styles.attendIconText}>
                {todayRecord?.status === 'present' ? '✓'
                  : todayRecord?.status === 'absent'  ? '✕'
                  : todayRecord?.status === 'late'    ? '△'
                  : todayRecord === null              ? '?'
                  : '···'}
              </Text>
            </View>
            {/* 상태명 + 사유 */}
            <View style={styles.attendInfo}>
              <Text style={styles.attendStatus}>{statusDisplay.label}</Text>
              {!!statusDisplay.sub && (
                <Text style={styles.attendSub}>{statusDisplay.sub}</Text>
              )}
            </View>
          </View>

          {/* 하단: 프로그레스바 + 출결 일수 텍스트 */}
          {monthlyRate !== null && (
            <View style={styles.attendRateSection}>
              <View style={styles.attendRateTrack}>
                <View style={[
                  styles.attendRateFill,
                  {
                    width: `${monthlyRate}%` as any,
                    // 출석률에 따라 fill 투명도 조절
                    backgroundColor:
                      monthlyRate === 100 ? '#fff'
                      : monthlyRate >= 80  ? 'rgba(255,255,255,0.9)'
                      : 'rgba(255,255,255,0.7)',
                  },
                ]} />
              </View>
              <Text style={styles.attendCountText}>
                출석 {monthlyCounts.present}일 · 지각 {monthlyCounts.late}일 · 결석 {monthlyCounts.absent}일
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* ── 오늘 숙제 현황 — 자녀가 있을 때만 표시 ── */}
        {selectedChild && todayHomeworks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✏️ 오늘 숙제</Text>
            {todayHomeworks.map((hw) => {
              // 4가지 상태 분류
              const isRetry   = hw.subStatus === 'checked' && hw.feedback === '💧';
              const isDone    = hw.subStatus === 'checked' && hw.feedback !== '💧';
              const isPending = hw.subStatus === 'submitted';
              // isRetry/isDone/isPending 모두 false면 미제출

              return (
                <View key={hw.id} style={styles.hwCard}>
                  {/* 좌측 세로바 — 상태별 색상 */}
                  <View style={[
                    styles.hwBar,
                    isRetry   ? styles.hwBarRetry   :
                    isDone    ? styles.hwBarDone    :
                    isPending ? styles.hwBarPending :
                    styles.hwBarMissing,
                  ]} />
                  <View style={styles.hwContent}>
                    {/* 제목 + 마감일 */}
                    <View style={styles.hwTitleRow}>
                      <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                      <Text style={styles.hwDueDate}>
                        {(hw.due_date as any).toDate().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 마감
                      </Text>
                    </View>
                    <View style={styles.hwStatusRow}>
                      <Text style={
                        isRetry   ? styles.hwStatusRetry   :
                        isDone    ? styles.hwStatusDone    :
                        isPending ? styles.hwStatusPending :
                        styles.hwStatusMissing
                      }>
                        {isRetry   ? '💧 다시 제출 필요'  :
                         isDone    ? '✅ 완료'            :
                         isPending ? '⏳ 검사 대기 중'    :
                         '❌ 미제출'}
                      </Text>
                    </View>
                    {/* 💧 상태일 때 선생님 코멘트 표시 */}
                    {isRetry && !!hw.feedback_comment && (
                      <Text style={styles.hwRetryComment}>{hw.feedback_comment}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 결석 사유 전송 — 기록 없음(null) 또는 결석·지각 상태일 때만 표시 ──
            출석(present) · 휴원(onLeave) · 로딩중(undefined)은 숨김           */}
        {selectedChild
          && todayRecord !== undefined
          && todayRecord?.status !== 'present'
          && todayRecord?.status !== 'onLeave'
          && (
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

        {/* ── 최근 공지 섹션 ── */}
        {selectedChild && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleDark}>📢 최근 공지</Text>
              <TouchableOpacity onPress={() => router.push('/common/notice-list')} activeOpacity={0.7}>
                <Text style={styles.sectionMore}>전체보기</Text>
              </TouchableOpacity>
            </View>

            {isLoadingNotices ? (
              <ActivityIndicator size="small" color="#5B50E8" style={{ marginTop: 12 }} />
            ) : recentNotices.length === 0 ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>등록된 공지가 없어요</Text>
              </View>
            ) : (
              recentNotices.map((notice) => (
                <View
                  key={notice.id}
                  style={[styles.noticeCard, notice.is_important ? styles.noticeCardImportant : styles.noticeCardNormal]}
                >
                  <View style={styles.noticeRow}>
                    {/* 좌측 세로바 */}
                    <View style={[styles.noticeBar, notice.is_important ? styles.noticeBarImportant : styles.noticeBarNormal]} />
                    <View style={styles.noticeContent}>
                      {notice.is_important && (
                        <View style={styles.importantChip}>
                          <Text style={styles.importantChipText}>중요</Text>
                        </View>
                      )}
                      <Text style={styles.noticeTitle} numberOfLines={2}>{notice.title}</Text>
                      <Text style={styles.noticeDate}>
                        {notice.created_at.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── 선생님 피드백 섹션 — teacher_feedback 필드 기반 ── */}
        {selectedChild && (
          <View style={styles.section}>
            <Text style={styles.sectionTitleDark}>💬 선생님 피드백</Text>

            {selectedChild.teacher_feedback?.text ? (
              <View style={styles.teacherFeedbackCard}>
                {/* 좌측 포인트 세로 바 */}
                <View style={styles.teacherFeedbackBar} />
                {/* 본문 영역 */}
                <View style={styles.teacherFeedbackBody}>
                  {/* 작성자 + 날짜 행 */}
                  <View style={styles.teacherFeedbackMeta}>
                    <Text style={styles.teacherFeedbackAuthor}>
                      ✏️ {selectedChild.teacher_feedback.author_name} 선생님
                    </Text>
                    {selectedChild.teacher_feedback.created_at && (
                      <Text style={styles.teacherFeedbackDate}>
                        {selectedChild.teacher_feedback.created_at
                          .toDate()
                          .toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  {/* 피드백 본문 */}
                  <Text style={styles.teacherFeedbackText}>
                    {selectedChild.teacher_feedback.text}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>아직 선생님 피드백이 없어요</Text>
              </View>
            )}
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
    paddingHorizontal: 16, paddingBottom: 14,
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
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2, right: -2,
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  body: { paddingHorizontal: 16 },

  // 출결 카드
  attendCard: {
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    overflow: 'hidden',
    gap: 0,
  },
  // 반투명 원형 장식
  attendDecorCircle: {
    position: 'absolute',
    right: -20, top: -20,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // 상단 Row
  attendTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendCardLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  attendDate: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  // 중간 Row
  attendMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 14,
  },
  attendIconBox: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  attendIconText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  attendInfo: { flex: 1, gap: 2 },
  attendStatus: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  attendSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  // 하단: 프로그레스바 + 일수 텍스트
  attendRateSection: { marginTop: 16, gap: 0 },
  attendRateTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  attendRateFill: {
    height: '100%' as any,
    borderRadius: 3,
  },
  attendCountText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },

  // 섹션
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 10 },
  sectionTitleDark: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionMore: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },

  // 인라인 빈 상태
  emptyInline: { paddingVertical: 20, alignItems: 'center' },
  emptyInlineText: { fontSize: 13, color: '#94A3B8' },

  // 공지 카드
  noticeCard: { borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  noticeCardImportant: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeCardNormal: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeRow: { flexDirection: 'row' },
  noticeBar: { width: 2.5, borderRadius: 2 },
  noticeBarImportant: { backgroundColor: '#EF4444' },
  noticeBarNormal: { backgroundColor: '#CBD5E1' },
  noticeContent: { flex: 1, padding: 14 },
  importantChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#EF4444', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 7, marginBottom: 4,
  },
  importantChipText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  noticeTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  noticeDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // 피드백 카드
  feedbackCard: { borderRadius: 14, padding: 14, marginBottom: 8 },
  feedbackCardGood: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#A7F3D0' },
  feedbackCardRetry: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  feedbackTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0F172A' },
  feedbackChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  feedbackChipGood: { backgroundColor: '#ECFDF5' },
  feedbackChipRetry: { backgroundColor: '#DBEAFE' },
  feedbackChipText: { fontSize: 10, fontWeight: '700' },
  feedbackChipTextGood: { color: '#065F46' },
  feedbackChipTextRetry: { color: '#1E40AF' },
  feedbackDate: { fontSize: 11, color: '#94A3B8', marginTop: 4 },

  // 숙제 카드
  hwCard: {
    borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  // 좌측 세로바 — 상태별 색상
  hwBar: { width: 3 },
  hwBarMissing:  { backgroundColor: '#EF4444' },  // 미제출 — 빨강
  hwBarPending:  { backgroundColor: '#F59E0B' },  // 검사대기 — 노랑
  hwBarRetry:    { backgroundColor: '#F97316' },  // 다시제출 — 주황
  hwBarDone:     { backgroundColor: '#10B981' },  // 완료 — 초록
  hwContent: { flex: 1, padding: 12 },
  hwTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  hwTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  hwDueDate: { fontSize: 11, color: '#94A3B8', marginLeft: 8 },
  hwStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hwStatusMissing:  { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  hwStatusPending:  { fontSize: 13, fontWeight: '700', color: '#78350F' },
  hwStatusRetry:    { fontSize: 13, fontWeight: '700', color: '#C2410C' },  // 주황
  hwStatusDone:     { fontSize: 13, fontWeight: '700', color: '#065F46' },
  hwRetryComment:   { fontSize: 12, color: '#C2410C', marginTop: 6, lineHeight: 17 },

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

  // 선생님 피드백 카드 (teacher_feedback 필드 기반)
  teacherFeedbackCard: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, overflow: 'hidden', marginTop: 10,
    flexDirection: 'row',
  },
  teacherFeedbackBar: {
    width: 3, borderRadius: 2, backgroundColor: '#5B50E8',
  },
  teacherFeedbackBody: { flex: 1, padding: 14 },
  teacherFeedbackMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  teacherFeedbackAuthor: { fontSize: 13, fontWeight: '800', color: '#3730A3' },
  teacherFeedbackDate: { fontSize: 11, color: '#7C6FCD' },
  teacherFeedbackText: { fontSize: 14, color: '#1E1B4B', lineHeight: 21, fontWeight: '500' },

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
