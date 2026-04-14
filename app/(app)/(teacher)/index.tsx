import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  query, where, getDocs, getCountFromServer,
  orderBy, limit, documentId,
} from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { getAbsentCountToday } from '../../../lib/attendance';
import { useAuthStore } from '../../../store/useAuthStore';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { Class, Homework, Notice, AttendanceRecord } from '../../../types';

// 반별 오늘 출석 현황 타입
interface ClassStat {
  studentCount: number;
  presentCount: number;
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 헤더 통계
  const [pendingHomeworkCount, setPendingHomeworkCount] = useState(0);
  const [absentTodayCount, setAbsentTodayCount] = useState(0);
  const [monthlyRate, setMonthlyRate] = useState<number | null>(null);

  // 반별 학생 수 + 오늘 출석 수 { classId: { studentCount, presentCount } }
  const [classStats, setClassStats] = useState<Record<string, ClassStat>>({});

  // 숙제 검사 현황
  const [hwStats, setHwStats] = useState<HwStat[]>([]);

  useEffect(() => {
    if (!user?.uid || !user?.academy_id) return;

    const fetchData = async () => {
      try {
        const classIds = user.assigned_class_ids ?? [];
        let classList: Class[] = [];

        if (classIds.length > 0) {
          const classSnap = await getDocs(
            query(Collections.classes(), where(documentId(), 'in', classIds))
          );
          classList = classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        }
        setClasses(classList);
        if (classList.length > 0) setSelectedClassId(classList[0].id);

        // 공지 최신 3건
        const noticeSnap = await getDocs(
          query(
            Collections.notices(),
            where('academy_id', '==', user.academy_id),
            orderBy('created_at', 'desc'),
            limit(3),
          )
        );
        setNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));

        if (classIds.length > 0) {
          const todayStr = getTodayStr();

          // ① 오늘 결석 수
          const absentCount = await getAbsentCountToday(classIds, todayStr);
          setAbsentTodayCount(absentCount);

          // ② 반별 학생 수 + 오늘 출석 수 병렬 집계
          const statsResults = await Promise.all(
            classList.map(async (cls) => {
              const [studentSnap, recordsSnap] = await Promise.all([
                getCountFromServer(
                  query(
                    Collections.users(),
                    where('academy_id', '==', user.academy_id),
                    where('class_id', '==', cls.id),
                    where('role', '==', 'student'),
                    where('is_active', '==', true),
                  )
                ),
                getDocs(Collections.attendanceRecords(cls.id, todayStr)),
              ]);
              let presentCount = 0;
              recordsSnap.forEach(d => {
                if ((d.data() as AttendanceRecord).status === 'present') presentCount++;
              });
              return { classId: cls.id, studentCount: studentSnap.data().count, presentCount };
            })
          );

          const statsMap: Record<string, ClassStat> = {};
          statsResults.forEach(({ classId, studentCount, presentCount }) => {
            statsMap[classId] = { studentCount, presentCount };
          });
          setClassStats(statsMap);

          // ③ 이번달 출석률 계산 (1일~오늘까지 records 합산)
          const now = new Date();
          const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const todayDay = now.getDate();
          let totalPresent = 0, totalRec = 0;

          await Promise.all(
            classList.flatMap(cls =>
              Array.from({ length: todayDay }, (_, i) => i + 1).map(async (day) => {
                const date = `${yearMonth}-${String(day).padStart(2, '0')}`;
                const snap = await getDocs(Collections.attendanceRecords(cls.id, date));
                snap.forEach(d => {
                  totalRec++;
                  if ((d.data() as AttendanceRecord).status === 'present') totalPresent++;
                });
              })
            )
          );
          setMonthlyRate(totalRec > 0 ? Math.round((totalPresent / totalRec) * 100) : null);

          // ④ 숙제 검사 현황 — 담당 반의 숙제 + 제출 수 집계
          const hwSnap = await getDocs(
            query(
              Collections.homeworks(),
              where('class_id', 'in', classIds.slice(0, 10)),
            )
          );
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const hwList = hwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));

          const hwStatList = await Promise.all(
            hwList.map(async (hw) => {
              const [subCount, studentCount] = await Promise.all([
                getCountFromServer(Collections.submissions(hw.id)),
                getCountFromServer(
                  query(
                    Collections.users(),
                    where('academy_id', '==', user.academy_id), // 복합 인덱스 사용을 위해 필수
                    where('class_id', '==', hw.class_id),
                    where('role', '==', 'student'),
                    where('is_active', '==', true),
                  )
                ),
              ]);
              return {
                ...hw,
                submittedCount: subCount.data().count,
                totalStudents: studentCount.data().count,
                dDays: calcDDays(hw.due_date.toDate()),
              } as HwStat;
            })
          );

          // 정렬: D-0(오늘 마감) → D-n → 마감 초과
          hwStatList.sort((a, b) => {
            if (a.dDays === 0 && b.dDays !== 0) return -1;
            if (b.dDays === 0 && a.dDays !== 0) return 1;
            return a.dDays - b.dDays;
          });
          setHwStats(hwStatList);

          // ⑤ 미검사(마감 전) 숙제 수
          setPendingHomeworkCount(hwList.filter(hw => hw.due_date.toDate() >= today).length);
        }
      } catch (e) {
        console.error('[TeacherHome] 데이터 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.uid, user?.academy_id]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
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
            <Text style={styles.statNum}>
              {monthlyRate !== null ? `${monthlyRate}%` : '-'}
            </Text>
            <Text style={styles.statLbl}>이번달 출석률</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── 담당 반 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📌 담당 반</Text>
          <TouchableOpacity><Text style={styles.sectionLink}>전체</Text></TouchableOpacity>
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
                  onPress={() => setSelectedClassId(c.id)}
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
          <TouchableOpacity><Text style={styles.sectionLink}>전체</Text></TouchableOpacity>
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
              <View key={hw.id} style={styles.hwCard}>
                <View style={styles.hwTopRow}>
                  <Text style={styles.hwTitle} numberOfLines={1}>{hw.title}</Text>
                  <View style={[styles.dDayChip, isDDay || isPast ? styles.dDayRed : styles.dDayGray]}>
                    <Text style={[styles.dDayText, isDDay || isPast ? styles.dDayTextRed : styles.dDayTextGray]}>
                      {isPast ? `D${hw.dDays}` : isDDay ? 'D-0' : `D-${hw.dDays}`}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hwSub}>
                  마감 {hw.due_date.toDate().toLocaleDateString('ko-KR')}
                </Text>
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
              </View>
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
  hwSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
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
