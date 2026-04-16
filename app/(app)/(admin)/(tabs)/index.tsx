/**
 * app/(app)/(admin)/index.tsx — 원장님 홈 화면
 *
 * 학원 현황(학생 수·선생님 수·반 수)을 Firestore에서 실시간으로 표시한다.
 * 오늘 확인 필요(결석·미입력) 섹션과 반별 출석률 카드를 포함한다.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useNotificationStore } from '../../../../store/useNotificationStore';
import { Class, AttendanceRecord } from '../../../../types';

// 오늘 날짜 문자열 (YYYY-MM-DD)
function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function AdminHomeScreen() {
  const { user, academy } = useAuthStore();
  const isPending = academy?.status === 'pending';
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const { top } = useSafeAreaInsets();

  // pending → active 전환 시 승인 알림
  // useRef로 이전 상태를 추적해 전환 시점에만 팝업 표시
  // AsyncStorage 방식은 이미 설정된 키 때문에 반복 테스트 시 알림이 안 뜨는 문제가 있어 제거
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = academy?.status;

    // pending 상태에서 active로 바뀐 시점에만 알림 표시
    if (prevStatus === 'pending' && academy?.status === 'active') {
      Alert.alert(
        '🎉 학원 승인 완료!',
        `${academy.name} 학원이 승인되었어요.\n이제 모든 기능을 사용할 수 있어요!`,
        [{ text: '확인' }],
      );
    }
  }, [academy?.status]);

  // ── 통계 상태 ──────────────────────────────────────────────────────
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 반별 학생 수 { classId: count }
  const [classStudentCounts, setClassStudentCounts] = useState<Record<string, number>>({});

  // 오늘 출결 관련 통계
  const [todayRate, setTodayRate]           = useState<number | null>(null);
  const [absentToday, setAbsentToday]       = useState<number | null>(null);
  const [notEnteredToday, setNotEnteredToday] = useState<number | null>(null);
  // 반별 출석률 { classId: rate(0~100) }
  const [classRates, setClassRates]         = useState<Record<string, number>>({});
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);

  // 학생 수 실시간 구독
  useEffect(() => {
    if (!user?.academy_id) return;
    const unsub = onSnapshot(
      query(Collections.users(), where('academy_id', '==', user.academy_id), where('role', '==', 'student')),
      (snap) => setStudentCount(snap.docs.filter(d => d.data().is_active !== false).length)
    );
    return () => unsub();
  }, [user?.academy_id]);

  // 선생님 수 실시간 구독
  useEffect(() => {
    if (!user?.academy_id) return;
    const unsub = onSnapshot(
      query(Collections.users(), where('academy_id', '==', user.academy_id), where('role', '==', 'teacher')),
      (snap) => setTeacherCount(snap.docs.filter(d => d.data().is_active !== false).length)
    );
    return () => unsub();
  }, [user?.academy_id]);

  // 반 목록 실시간 구독 — 반 추가/삭제/이름 변경 즉시 반영
  useEffect(() => {
    if (!user?.academy_id) return;
    const unsub = onSnapshot(
      query(Collections.classes(), where('academy_id', '==', user.academy_id)),
      async (snap) => {
        const classList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(classList);

        // 반별 학생 수 집계
        const countResults = await Promise.all(
          classList.map(async cls => {
            const s = await getDocs(query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('class_id', '==', cls.id),
              where('role', '==', 'student'),
            ));
            return { classId: cls.id, count: s.docs.filter(d => d.data().is_active !== false).length };
          })
        );
        const cMap: Record<string, number> = {};
        countResults.forEach(({ classId, count }) => { cMap[classId] = count; });
        setClassStudentCounts(cMap);
        setIsLoading(false);
      },
      (e) => { console.error('[AdminHome] 반 구독 실패:', e); setIsLoading(false); }
    );
    return () => unsub();
  }, [user?.academy_id]);

  // ── 반 목록 로드 완료 후 오늘 출결 통계 집계 ──
  useEffect(() => {
    if (classes.length === 0 || !user?.academy_id) return;

    const todayStr = getTodayStr();
    setIsLoadingAttendance(true);

    // 모든 반에 대해 학생 수 + 오늘 출결 records를 병렬 조회
    Promise.all(
      classes.map(async (cls) => {
        const [studentSnap, recordsSnap] = await Promise.all([
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('class_id', '==', cls.id),
              where('role', '==', 'student'),
            )
          ),
          getDocs(Collections.attendanceRecords(cls.id, todayStr)),
        ]);

        // is_active 필드가 없는 자체 가입 학생도 포함 (false가 아닌 경우 모두 활성)
        const total = studentSnap.docs.filter(d => d.data().is_active !== false).length;
        let present = 0, absent = 0, late = 0;

        recordsSnap.forEach((d) => {
          const r = d.data() as AttendanceRecord;
          if (r.status === 'present') present++;
          else if (r.status === 'absent') absent++;
          else if (r.status === 'late') late++;
        });

        const entered = present + absent + late;
        const rate = total > 0 ? Math.round((present / total) * 100) : 0;

        return { classId: cls.id, total, present, absent, entered, rate };
      })
    ).then((results) => {
      // 반별 출석률 맵 저장
      const rates: Record<string, number> = {};
      let totalStudents = 0, totalPresent = 0, totalAbsent = 0, totalEntered = 0;

      results.forEach(({ classId, total, present, absent, entered, rate }) => {
        rates[classId] = rate;
        totalStudents += total;
        totalPresent  += present;
        totalAbsent   += absent;
        totalEntered  += entered;
      });

      setClassRates(rates);
      setAbsentToday(totalAbsent);
      setNotEnteredToday(Math.max(0, totalStudents - totalEntered));
      setTodayRate(totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0);
    }).catch((e) => {
      console.error('[AdminHome] 출결 통계 조회 실패:', e);
    }).finally(() => {
      setIsLoadingAttendance(false);
    });
  }, [classes]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 보라 그라데이션 헤더 카드 ── */}
      <LinearGradient
        colors={['#7C3AED', '#5B50E8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerCard, { marginTop: top + 8 }]}
      >
        {/* 상단 Row: 학원명 + 알림 아이콘 */}
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreeting}>운영 현황</Text>
            <Text style={styles.headerAcademy}>{academy?.name ?? '학원'}</Text>
          </View>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => router.push('/common/notification-inbox')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        </View>

        {/* 2칸 그리드: 전체 학생 / 오늘 출석률 */}
        <View style={styles.statGrid2}>
          <View style={styles.statBox2}>
            <View style={styles.statIconRow}>
              <View style={styles.statIconBadge}>
                <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.statLbl2}>전체 학생</Text>
            </View>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginTop: 8 }} />
            ) : (
              <Text style={styles.statNum2}>{studentCount ?? 0}<Text style={styles.statUnit}>명</Text></Text>
            )}
          </View>
          <View style={styles.statBox2}>
            <View style={styles.statIconRow}>
              <View style={styles.statIconBadge}>
                <Ionicons name="stats-chart-outline" size={14} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.statLbl2}>오늘 출석률</Text>
            </View>
            {isLoadingAttendance ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginTop: 8 }} />
            ) : (
              <Text style={styles.statNum2}>{todayRate ?? 0}<Text style={styles.statUnit}>%</Text></Text>
            )}
          </View>
        </View>

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* 3칸 그리드: 반 수 / 선생님 수 / 플랜 */}
        <View style={styles.statGrid3}>
          <View style={styles.statBox3}>
            <Ionicons name="library-outline" size={16} color="rgba(255,255,255,0.8)" style={{ marginBottom: 4 }} />
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.statNum3}>{classes.length}</Text>
            )}
            <Text style={styles.statLbl3}>반 수</Text>
          </View>
          <View style={styles.statDividerV} />
          <View style={styles.statBox3}>
            <Ionicons name="school-outline" size={16} color="rgba(255,255,255,0.8)" style={{ marginBottom: 4 }} />
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.statNum3}>{teacherCount ?? 0}</Text>
            )}
            <Text style={styles.statLbl3}>선생님</Text>
          </View>
          <View style={styles.statDividerV} />
          <View style={styles.statBox3}>
            <Ionicons name="star-outline" size={16} color="rgba(255,255,255,0.8)" style={{ marginBottom: 4 }} />
            <View style={[
              styles.planBadge,
              academy?.plan === 'pro' ? styles.planBadgePro :
              academy?.plan === 'trial' ? styles.planBadgeTrial : styles.planBadgeFree,
            ]}>
              <Text style={styles.planBadgeText}>
                {academy?.plan === 'pro' ? 'Pro' : academy?.plan === 'trial' ? 'Trial' : 'Free'}
              </Text>
            </View>
            <Text style={styles.statLbl3}>플랜</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── 승인 대기 배너 ── */}
      {isPending && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingTitle}>⏳ 승인 대기 중</Text>
          <Text style={styles.pendingDesc}>
            학생 3명, 반 1개까지 이용 가능해요. 승인 완료 시 모든 기능이 열립니다.
          </Text>
        </View>
      )}

      {/* ── 빠른 작업 ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>⚡ 빠른 작업</Text>
        <View style={styles.quickGrid}>
          {/* 숙제 출제 */}
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(app)/(admin)/homework-create')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EEEDF9' }]}>
              <Ionicons name="book-outline" size={20} color="#5B50E8" />
            </View>
            <Text style={styles.quickLabel}>숙제 출제</Text>
          </TouchableOpacity>
          {/* 영상 관리 */}
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(app)/(admin)/video-list')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="videocam-outline" size={20} color="#10B981" />
            </View>
            <Text style={styles.quickLabel}>영상 관리</Text>
          </TouchableOpacity>
          {/* 공지 작성 */}
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(app)/(admin)/notice-create')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="megaphone-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.quickLabel}>공지 작성</Text>
          </TouchableOpacity>
          {/* 출결 입력 */}
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(app)/(admin)/attendance')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="calendar-outline" size={20} color="#EF4444" />
            </View>
            <Text style={styles.quickLabel}>출결 입력</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 오늘 확인 필요 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚨 오늘 확인 필요</Text>
        <View style={styles.alertGrid}>
          <View style={[styles.alertTile, styles.alertRed]}>
            {isLoadingAttendance ? (
              <ActivityIndicator color="#EF4444" size="small" style={{ marginBottom: 4 }} />
            ) : (
              <Text style={styles.alertNum_red}>{absentToday ?? 0}</Text>
            )}
            <Text style={styles.alertLbl_red}>오늘 결석</Text>
          </View>
          <View style={[styles.alertTile, styles.alertAmber]}>
            {isLoadingAttendance ? (
              <ActivityIndicator color="#F59E0B" size="small" style={{ marginBottom: 4 }} />
            ) : (
              <Text style={styles.alertNum_amber}>{notEnteredToday ?? 0}</Text>
            )}
            <Text style={styles.alertLbl_amber}>미입력</Text>
          </View>
        </View>
      </View>

      {/* ── 반별 출석률 ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📊 반별 출석률</Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color="#5B50E8" style={{ paddingVertical: 12 }} />
        ) : classes.length === 0 ? (
          <Text style={styles.emptyText}>반 데이터가 없어요</Text>
        ) : (
          classes.map((c) => {
            const rate = classRates[c.id] ?? null;
            return (
              <View key={c.id} style={styles.classRow}>
                <View style={styles.classInfo}>
                  <Text style={styles.className}>
                    {c.name}
                    <Text style={styles.classStudentCount}>
                      {'  '}{classStudentCounts[c.id] ?? '-'}명
                    </Text>
                  </Text>
                  {isLoadingAttendance || rate === null ? (
                    <ActivityIndicator size="small" color="#94A3B8" />
                  ) : (
                    <Text style={styles.classRate}>{rate}%</Text>
                  )}
                </View>
                <View style={styles.barTrack}>
                  <View style={[
                    styles.barFill,
                    {
                      width: `${rate ?? 0}%`,
                      backgroundColor: (rate ?? 0) >= 90 ? '#10B981'
                        : (rate ?? 0) >= 70 ? '#F59E0B'
                        : '#EF4444',
                    },
                  ]} />
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 32 },

  // ── 그라데이션 헤더 카드 ──
  headerCard: {
    borderRadius: 24,
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
  headerLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  headerAcademy: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  bellBtn: {
    width: 42, height: 42, borderRadius: 21,
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

  // 헤더 텍스트
  headerGreeting: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },

  // 2칸 그리드
  statGrid2: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox2: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14, padding: 14,
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statIconBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  statNum2: { fontSize: 32, fontWeight: '800', color: '#fff', lineHeight: 36 },
  statUnit: { fontSize: 16, fontWeight: '600' },
  statLbl2: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 14,
  },

  // 3칸 그리드
  statGrid3: { flexDirection: 'row', alignItems: 'center' },
  statBox3: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statDividerV: {
    width: 1, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statNum3: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLbl3: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  // 플랜 뱃지
  planBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20, marginBottom: 2,
  },
  planBadgeFree: { backgroundColor: 'rgba(255,255,255,0.25)' },
  planBadgeTrial: { backgroundColor: 'rgba(251,191,36,0.4)' },
  planBadgePro: { backgroundColor: 'rgba(52,211,153,0.4)' },
  planBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // ── 승인 대기 배너 ──
  pendingBanner: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    marginHorizontal: 16, marginTop: 16,
  },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: '#78350F', marginBottom: 2 },
  pendingDesc: { fontSize: 13, color: '#92400E', lineHeight: 17 },

  // ── 섹션 ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 10 },

  // 빠른 이동 버튼 그리드
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, padding: 14, gap: 6,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  quickLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  quickCount: { fontSize: 12, color: '#64748B' },

  // 오늘 확인 필요 타일
  alertGrid: { flexDirection: 'row', gap: 10 },
  alertTile: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  alertRed: { backgroundColor: '#FEE2E2' },
  alertAmber: { backgroundColor: '#FEF3C7' },
  alertNum_red: { fontSize: 30, fontWeight: '800', color: '#EF4444', marginBottom: 4 },
  alertLbl_red: { fontSize: 12, fontWeight: '600', color: '#991B1B' },
  alertNum_amber: { fontSize: 30, fontWeight: '800', color: '#F59E0B', marginBottom: 4 },
  alertLbl_amber: { fontSize: 12, fontWeight: '600', color: '#92400E' },

  // ── 카드 ──
  card: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginTop: 20,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 },

  // 반별 출석률
  classRow: { marginBottom: 12 },
  classInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' },
  className: { fontSize: 13, fontWeight: '600', color: '#334155' },
  classStudentCount: { fontSize: 12, fontWeight: '400', color: '#94A3B8' },
  classRate: { fontSize: 13, color: '#64748B' },
  barTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
