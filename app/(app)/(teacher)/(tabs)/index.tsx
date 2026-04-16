import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  query, where, getDocs,
  orderBy, limit, documentId, onSnapshot,
} from 'firebase/firestore';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useNotificationStore } from '../../../../store/useNotificationStore';
import { Class, Homework, Notice, AttendanceRecord } from '../../../../types';

// 반별 오늘 출석 현황 타입
interface ClassStat {
  studentCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  notEnteredCount: number;
  enteredCount: number; // 출결 입력된 학생 수 (onSnapshot 먼저 도착할 때 임시 보관용)
}

// 숙제 + 제출 통계 타입
interface HwStat extends Homework {
  submittedCount: number;
  totalStudents: number;
  dDays: number;
}

// D-day 계산 (날짜 기준, 시간 무시)
function calcDDays(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// 오늘 날짜 문자열 (YYYY-MM-DD)
function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherHomeScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  // 바텀 시트에 표시할 반 (null이면 닫힘)
  const [sheetClass, setSheetClass] = useState<Class | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 반별 학생 수 + 오늘 출석 수 { classId: { studentCount, presentCount } }
  const [classStats, setClassStats] = useState<Record<string, ClassStat>>({});

  // 숙제 원본 목록 (onSnapshot)
  const [rawHwList, setRawHwList] = useState<Homework[]>([]);
  // 숙제별 전체 제출 수 { hwId: count } — submissions onSnapshot으로 실시간 갱신
  const [submissionCountsMap, setSubmissionCountsMap] = useState<Record<string, number>>({});
  // 숙제별 미검사 제출 수 { hwId: count } — status === 'submitted' (피드백 전)
  const [uncheckedCountsMap, setUncheckedCountsMap] = useState<Record<string, number>>({});
  // 반별 학생 수 { classId: count }
  const [studentCountsMap, setStudentCountsMap] = useState<Record<string, number>>({});

  // 담당 반 목록 실시간 구독
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (!user?.academy_id || classIds.length === 0) { setIsLoading(false); return; }

    const unsub = onSnapshot(
      query(Collections.classes(), where(documentId(), 'in', classIds)),
      (snap) => {
        const classList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(classList);
        setSelectedClassId(prev => prev ?? (classList[0]?.id ?? null));
      }
    );
    return () => unsub();
  }, [user?.academy_id, user?.assigned_class_ids?.join(',')]);

  // 공지 실시간 구독 (최신 3건)
  useEffect(() => {
    if (!user?.academy_id) return;
    const unsub = onSnapshot(
      query(
        Collections.notices(),
        where('academy_id', '==', user.academy_id),
        orderBy('created_at', 'desc'),
        limit(3),
      ),
      (snap) => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)))
    );
    return () => unsub();
  }, [user?.academy_id]);

  // 반별 학생 수 로드 (1회성 — 출결 카운트는 아래 onSnapshot이 담당)
  useEffect(() => {
    if (!user?.academy_id || classes.length === 0) return;

    Promise.all(
      classes.map(async (cls) => {
        const studentSnap = await getDocs(query(Collections.users(),
          where('academy_id', '==', user.academy_id),
          where('class_id', '==', cls.id),
          where('role', '==', 'student'),
        ));
        const studentCount = studentSnap.docs.filter(d => d.data().is_active !== false).length;
        return { classId: cls.id, studentCount };
      })
    ).then((statsResults) => {
      setClassStats((prev) => {
        const next = { ...prev };
        statsResults.forEach(({ classId, studentCount }) => {
          const existing = next[classId] ?? {};
          // onSnapshot이 먼저 실행됐다면 enteredCount가 저장되어 있음 → 즉시 정확한 notEnteredCount 계산
          const enteredCount = existing.enteredCount ?? 0;
          next[classId] = {
            ...existing,
            studentCount,
            presentCount:    existing.presentCount    ?? 0,
            absentCount:     existing.absentCount     ?? 0,
            lateCount:       existing.lateCount       ?? 0,
            enteredCount,
            notEnteredCount: Math.max(0, studentCount - enteredCount),
          };
        });
        return next;
      });
    }).catch(e => {
      console.error('[TeacherHome] 학생 수 조회 실패:', e);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [classes.map(c => c.id).join(','), user?.academy_id]);

  // ── 오늘 출결 실시간 구독 ─────────────────────────────────────
  // 선생님이 출결을 입력하면 담당 반 카드의 출석 수·결석 수가 즉시 갱신됨
  useEffect(() => {
    if (classes.length === 0) return;
    const todayStr = getTodayStr();

    const unsubs = classes.map((cls) =>
      onSnapshot(
        Collections.attendanceRecords(cls.id, todayStr),
        (snap) => {
          setClassStats((prev) => {
            const existing = prev[cls.id];

            let presentCount = 0, absentCount = 0, lateCount = 0;
            const enteredUids = new Set<string>();
            snap.forEach((d) => {
              enteredUids.add(d.id);
              const status = (d.data() as AttendanceRecord).status;
              if (status === 'present') presentCount++;
              else if (status === 'absent') absentCount++;
              else if (status === 'late') lateCount++;
            });
            const enteredCount = enteredUids.size;

            // 학생 수가 아직 로드 안 됐을 때도 enteredCount를 저장해 둠
            // → 이후 학생 수 로드 시 notEnteredCount를 정확하게 계산할 수 있음
            if (!existing) {
              return {
                ...prev,
                [cls.id]: { studentCount: 0, presentCount, absentCount, lateCount, enteredCount, notEnteredCount: 0 },
              };
            }

            const notEnteredCount = Math.max(0, existing.studentCount - enteredCount);
            return {
              ...prev,
              [cls.id]: { ...existing, presentCount, absentCount, lateCount, enteredCount, notEnteredCount },
            };
          });
        },
        (e) => console.warn('[TeacherHome] 출결 구독 실패:', e)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [classes.map(c => c.id).join(',')]);

  // ── 숙제 목록 실시간 구독 ──────────────────────────────────
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (!user?.academy_id || classIds.length === 0) return;

    const unsub = onSnapshot(
      query(Collections.homeworks(), where('class_id', 'in', classIds.slice(0, 10))),
      (snap) => {
        setRawHwList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework)));
      },
      (e) => console.error('[TeacherHome] 숙제 목록 구독 실패:', e)
    );
    return () => unsub();
  }, [user?.academy_id, user?.assigned_class_ids?.join(',')]);

  // ── 각 숙제 제출 수 실시간 구독 ─────────────────────────────
  // 학생이 제출하거나 선생님이 피드백을 달 때 submissions 컬렉션이 변경되므로
  // 전체 제출 수(submittedCount)와 미검사 수(uncheckedCount)를 동시에 갱신
  useEffect(() => {
    if (rawHwList.length === 0) return;

    const unsubs = rawHwList.map((hw) =>
      onSnapshot(
        Collections.submissions(hw.id),
        (snap) => {
          // 전체 제출 수
          setSubmissionCountsMap(prev => ({ ...prev, [hw.id]: snap.size }));
          // 미검사 수 = status가 'submitted'인 것 (선생님 피드백 전)
          const unchecked = snap.docs.filter(d => d.data().status === 'submitted').length;
          setUncheckedCountsMap(prev => ({ ...prev, [hw.id]: unchecked }));
        },
        (e) => console.warn(`[TeacherHome] 제출 구독 실패(${hw.id}):`, e)
      )
    );
    return () => unsubs.forEach(u => u());
  }, [rawHwList.map(h => h.id).join(',')]);

  // ── 반별 학생 수 조회 ────────────────────────────────────────
  // 학생 수는 자주 바뀌지 않으므로 rawHwList 반 목록이 달라질 때만 재조회
  useEffect(() => {
    if (rawHwList.length === 0 || !user?.academy_id) return;

    const uniqueClassIds = [...new Set(rawHwList.map(h => h.class_id))];
    Promise.all(
      uniqueClassIds.map(async (classId) => {
        const snap = await getDocs(query(
          Collections.users(),
          where('academy_id', '==', user.academy_id!),
          where('class_id', '==', classId),
          where('role', '==', 'student'),
        ));
        return { classId, count: snap.docs.filter(d => d.data().is_active !== false).length };
      })
    ).then((results) => {
      const map: Record<string, number> = {};
      results.forEach(({ classId, count }) => { map[classId] = count; });
      setStudentCountsMap(map);
    }).catch(e => console.warn('[TeacherHome] 학생 수 조회 실패:', e));
  }, [rawHwList.map(h => h.class_id).join(','), user?.academy_id]);

  // ── 숙제 통계 병합 (실시간 상태 3개 → 렌더용 파생 데이터) ──
  // 마감일이 내일 이하(dDays <= 1)인 숙제만 표시 — 임박하거나 지난 숙제 위주
  const hwStats = useMemo<HwStat[]>(() => {
    const list = rawHwList
      .map(hw => ({
        ...hw,
        submittedCount: submissionCountsMap[hw.id] ?? 0,
        totalStudents: studentCountsMap[hw.class_id] ?? 0,
        dDays: calcDDays(hw.due_date.toDate()),
      }))
      .filter(hw => hw.dDays <= 1); // 오늘(D-0), 내일(D-1), 이미 지난 것만
    list.sort((a, b) => {
      if (a.dDays === 0 && b.dDays !== 0) return -1;
      if (b.dDays === 0 && a.dDays !== 0) return 1;
      return a.dDays - b.dDays;
    });
    return list;
  }, [rawHwList, submissionCountsMap, studentCountsMap]);

  // 미검사 숙제 수 — 제출됐지만 선생님이 아직 피드백하지 않은 제출물 총 수
  // status === 'submitted' 인 것만 집계 (선생님이 피드백 달면 즉시 감소)
  const pendingHomeworkCount = useMemo(() =>
    Object.values(uncheckedCountsMap).reduce((sum, c) => sum + c, 0),
    [uncheckedCountsMap]
  );

  // 오늘 결석 수 — classStats에서 실시간으로 파생 (별도 state 불필요)
  const absentTodayCount = useMemo(
    () => Object.values(classStats).reduce((sum, s) => sum + (s.absentCount ?? 0), 0),
    [classStats]
  );

  // 오늘 출결 미입력 수 — 아직 출결이 입력되지 않은 학생 수 합산 (실시간)
  const notEnteredTodayCount = useMemo(
    () => Object.values(classStats).reduce((sum, s) => sum + (s.notEnteredCount ?? 0), 0),
    [classStats]
  );

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 보라 그라데이션 헤더 ── */}
      <LinearGradient
        colors={['#7C3AED', '#5B50E8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerCard, { marginTop: top + 8 }]}
      >
        {/* 상단 Row */}
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>오늘도 좋은 수업 되세요 🍀</Text>
            <Text style={styles.headerName}>{user?.name ?? ''} 선생님</Text>
          </View>
          <View style={styles.headerActions}>
            {/* 학생 계정 생성 버튼 */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/(app)/(teacher)/create-student')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </TouchableOpacity>
            {/* 알림 */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/common/notification-inbox')}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={18} color="#fff" />
              {/* 미읽음 dot 배지 — 숫자 없이 점만 표시 (ui-screens.md 규칙) */}
              {unreadCount > 0 && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* 통계 3칸 */}
        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{pendingHomeworkCount}</Text>
            <Text style={styles.statLbl}>미검사 숙제</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{absentTodayCount}</Text>
            <Text style={styles.statLbl}>오늘 결석</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{notEnteredTodayCount}</Text>
            <Text style={styles.statLbl}>출석 미입력</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── 빠른 작업 ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>⚡ 빠른 작업</Text>
        <View style={styles.quickRow}>
          {/* 숙제 출제 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(teacher)/homework-create')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EEEDF9' }]}>
              <Ionicons name="book-outline" size={20} color="#5B50E8" />
            </View>
            <Text style={styles.quickLabel}>숙제 출제</Text>
          </TouchableOpacity>
          {/* 영상 관리 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(teacher)/video-list')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="videocam-outline" size={20} color="#10B981" />
            </View>
            <Text style={styles.quickLabel}>영상 관리</Text>
          </TouchableOpacity>
          {/* 공지 작성 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(teacher)/notice-create')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="megaphone-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.quickLabel}>공지 작성</Text>
          </TouchableOpacity>
          {/* 출결 입력 */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(app)/(teacher)/attendance')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="calendar-outline" size={20} color="#EF4444" />
            </View>
            <Text style={styles.quickLabel}>출결 입력</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 담당 반 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📌 담당 반</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/(teacher)/(tabs)/students')} activeOpacity={0.7}>
            <Text style={styles.sectionLink}>전체보기</Text>
          </TouchableOpacity>
        </View>

        {classes.length === 0 ? (
          <Text style={styles.emptyText}>담당 반이 없어요</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            {classes.map((c) => {
              const stat = classStats[c.id];
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.classCard, selectedClassId === c.id && styles.classCardActive]}
                  onPress={() => { setSelectedClassId(c.id); setSheetClass(c); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.classCardName, selectedClassId === c.id && styles.classCardNameActive]}>
                    {c.name}
                  </Text>
                  <Text style={styles.classCardSub}>
                    학생 {stat ? `${stat.studentCount}` : '-'}명
                  </Text>
                  <Text style={styles.classCardStatus}>
                    출석 {stat ? `${stat.presentCount}` : '-'}명 ●
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── 숙제 검사 현황 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📝 숙제 검사 현황</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/(teacher)/(tabs)/homework')} activeOpacity={0.7}>
            <Text style={styles.sectionLink}>전체보기</Text>
          </TouchableOpacity>
        </View>

        {hwStats.length === 0 ? (
          <Text style={styles.emptyText}>출제된 숙제가 없어요</Text>
        ) : (
          hwStats.map((hw) => {
            const submitRate = hw.totalStudents > 0
              ? Math.round((hw.submittedCount / hw.totalStudents) * 100)
              : 0;
            const isDDay = hw.dDays === 0;
            const isPast = hw.dDays < 0;
            return (
              <TouchableOpacity
                key={hw.id}
                style={styles.hwCard}
                onPress={() => router.push(`/(app)/(teacher)/homework-review?hwId=${hw.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.hwTopRow}>
                  <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                  <View style={[styles.dDayChip, isDDay || isPast ? styles.dDayRed : styles.dDayGray]}>
                    <Text style={[styles.dDayText, isDDay || isPast ? styles.dDayTextRed : styles.dDayTextGray]}>
                      {isPast ? `D${hw.dDays}` : isDDay ? 'D-0' : `D-${hw.dDays}`}
                    </Text>
                  </View>
                </View>
                {/* 반 이름 + 마감일 */}
                <View style={styles.hwMetaRow}>
                  <View style={styles.classNameChip}>
                    <Text style={styles.classNameChipText}>
                      {classes.find(c => c.id === hw.class_id)?.name ?? '알 수 없는 반'}
                    </Text>
                  </View>
                  <Text style={styles.hwSub}>
                    마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}
                  </Text>
                </View>
                <View style={styles.hwStatusRow}>
                  <Text style={styles.hwStatusLabel}>제출 현황</Text>
                  <Text style={styles.hwStatusCount}>
                    {hw.submittedCount}/{hw.totalStudents}명 ({submitRate}%)
                  </Text>
                </View>
                <View style={styles.hwBarTrack}>
                  <View style={[styles.hwBarFill, { width: `${submitRate}%` as any }]} />
                </View>
                <View style={styles.hwChipRow}>
                  <View style={styles.chipGreen}>
                    <Text style={styles.chipGreenText}>제출 {hw.submittedCount}명</Text>
                  </View>
                  <View style={styles.chipRed}>
                    <Text style={styles.chipRedText}>
                      미제출 {Math.max(0, hw.totalStudents - hw.submittedCount)}명
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ── 최근 공지 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📢 최근 공지</Text>
          <TouchableOpacity
            onPress={() => router.push('/common/notice-list')}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionLink}>전체보기</Text>
          </TouchableOpacity>
        </View>

        {notices.length === 0 ? (
          <Text style={styles.emptyText}>등록된 공지가 없어요</Text>
        ) : (
          notices.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[styles.noticeCard, n.is_important ? styles.noticeCardImportant : styles.noticeCardNormal]}
              onPress={() => router.push(`/common/notice-detail?noticeId=${n.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.noticeRow}>
                {/* 좌측 세로바 */}
                <View style={[styles.noticeBar, n.is_important ? styles.noticeBarImportant : styles.noticeBarNormal]} />
                <View style={styles.noticeContent}>
                  {n.is_important && (
                    <View style={styles.importantChip}>
                      <Text style={styles.importantChipText}>중요</Text>
                    </View>
                  )}
                  <Text style={styles.noticeTitle}>{n.title}</Text>
                  <Text style={styles.noticeDate}>
                    {(n.created_at as any).toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

    </ScrollView>

    {/* ── 반 상세 바텀 시트 ── */}

    <Modal
      visible={sheetClass !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setSheetClass(null)}
    >
      <TouchableOpacity
        style={styles.sheetOverlay}
        activeOpacity={1}
        onPress={() => setSheetClass(null)}
      >
        <View style={styles.sheetContainer}>
          {/* 핸들 */}
          <View style={styles.sheetHandle} />

          {/* 헤더 */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{sheetClass?.name}</Text>
              <Text style={styles.sheetSubtitle}>
                학생 {classStats[sheetClass?.id ?? '']?.studentCount ?? '-'}명
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSheetClass(null)} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* 오늘 출결 현황 4칸 */}
          <Text style={styles.sheetSectionTitle}>오늘 출결 현황</Text>
          {(() => {
            const stat = classStats[sheetClass?.id ?? ''];
            return (
              <View style={styles.sheetStatGrid}>
                <View style={[styles.sheetStatBox, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.sheetStatNum, { color: '#10B981' }]}>
                    {stat?.presentCount ?? '-'}
                  </Text>
                  <Text style={[styles.sheetStatLbl, { color: '#065F46' }]}>출석</Text>
                </View>
                <View style={[styles.sheetStatBox, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.sheetStatNum, { color: '#EF4444' }]}>
                    {stat?.absentCount ?? '-'}
                  </Text>
                  <Text style={[styles.sheetStatLbl, { color: '#991B1B' }]}>결석</Text>
                </View>
                <View style={[styles.sheetStatBox, { backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.sheetStatNum, { color: '#F59E0B' }]}>
                    {stat?.lateCount ?? '-'}
                  </Text>
                  <Text style={[styles.sheetStatLbl, { color: '#78350F' }]}>지각</Text>
                </View>
                <View style={[styles.sheetStatBox, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={[styles.sheetStatNum, { color: '#64748B' }]}>
                    {stat?.notEnteredCount ?? '-'}
                  </Text>
                  <Text style={[styles.sheetStatLbl, { color: '#334155' }]}>미입력</Text>
                </View>
              </View>
            );
          })()}

          {/* 빠른 이동 버튼 3개 */}
          <View style={styles.sheetActionRow}>
            <TouchableOpacity
              style={styles.sheetActionBtn}
              onPress={() => {
                setSheetClass(null);
                router.push({ pathname: '/(app)/(teacher)/attendance', params: { classId: sheetClass?.id } });
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="calendar-outline" size={22} color="#EF4444" />
              </View>
              <Text style={styles.sheetActionLabel}>출결 입력</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetActionBtn}
              onPress={() => {
                setSheetClass(null);
                router.push('/(app)/(teacher)/(tabs)/homework');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#EEEDF9' }]}>
                <Ionicons name="book-outline" size={22} color="#5B50E8" />
              </View>
              <Text style={styles.sheetActionLabel}>숙제 검사</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetActionBtn}
              onPress={() => {
                setSheetClass(null);
                router.push('/(app)/(teacher)/(tabs)/students');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="people-outline" size={22} color="#10B981" />
              </View>
              <Text style={styles.sheetActionLabel}>학생 목록</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 32 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── 그라데이션 헤더 ──
  headerCard: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    marginHorizontal: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  headerName: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2, right: -2,
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  // 통계 3칸
  statGrid: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12,
  },
  statNum: { fontSize: 28, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // ── 섹션 공통 ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  sectionLink: { fontSize: 13, fontWeight: '700', color: '#5B50E8' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // ── 빠른 작업 ──
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  // ── 담당 반 ──
  classScroll: { flexDirection: 'row' },
  classCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 10,
    minWidth: 120,
  },
  classCardActive: { backgroundColor: '#EEEDF9', borderWidth: 1, borderColor: '#5B50E8' },
  classCardName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  classCardNameActive: { color: '#5B50E8' },
  classCardSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  classCardStatus: { fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 4 },

  // ── 숙제 검사 카드 ──
  hwCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  hwTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hwTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  dDayChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  dDayRed: { backgroundColor: '#FEE2E2' },
  dDayGray: { backgroundColor: '#F1F5F9' },
  dDayText: { fontSize: 11, fontWeight: '700' },
  dDayTextRed: { color: '#991B1B' },
  dDayTextGray: { color: '#334155' },
  hwMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  classNameChip: {
    backgroundColor: '#EEEDF9',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  classNameChipText: { fontSize: 11, fontWeight: '700', color: '#5B50E8' },
  hwSub: { fontSize: 12, color: '#64748B' },
  hwStatusRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 10,
  },
  hwStatusLabel: { fontSize: 12, color: '#64748B' },
  hwStatusCount: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  hwBarTrack: {
    height: 6, backgroundColor: '#E2E8F0',
    borderRadius: 3, overflow: 'hidden', marginTop: 6,
  },
  hwBarFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 3 },
  hwChipRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  chipGreen: {
    backgroundColor: '#ECFDF5', borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  chipGreenText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  chipRed: {
    backgroundColor: '#FEE2E2', borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  chipRedText: { fontSize: 11, fontWeight: '700', color: '#991B1B' },

  // ── 반 상세 바텀 시트 ──
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sheetSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  sheetSectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#475569',
    marginHorizontal: 20, marginTop: 16, marginBottom: 10,
  },
  sheetStatGrid: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20,
  },
  sheetStatBox: {
    flex: 1, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  sheetStatNum: { fontSize: 22, fontWeight: '800' },
  sheetStatLbl: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  sheetActionRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginTop: 20,
  },
  sheetActionBtn: {
    flex: 1, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', gap: 8,
  },
  sheetActionIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetActionLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },

  // ── 공지 카드 ──
  noticeCard: { borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  noticeCardImportant: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeCardNormal: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  noticeRow: { flexDirection: 'row' },
  noticeBar: { width: 3 },
  noticeBarImportant: { backgroundColor: '#EF4444' },
  noticeBarNormal: { backgroundColor: '#CBD5E1' },
  noticeContent: { flex: 1, padding: 14 },
  importantChip: {
    backgroundColor: '#EF4444', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 7,
    alignSelf: 'flex-start', marginBottom: 4,
  },
  importantChipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  noticeTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  noticeDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
