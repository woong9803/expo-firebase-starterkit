/**
 * app/(app)/(admin)/index.tsx — 원장님 홈 화면
 *
 * 학원 현황(학생 수·선생님 수·반 수)을 Firestore에서 실시간으로 표시한다.
 * 오늘 확인 필요(결석·미입력) 섹션과 반별 출석률 카드를 포함한다.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { query, where, getDocs } from 'firebase/firestore';
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

  // Case 2: 앱 재시작 후 이미 승인된 상태로 첫 진입 시 승인 알림
  // pending.tsx에서 아직 알림을 못 본 경우에만 표시 (AsyncStorage 키로 판단)
  useEffect(() => {
    if (!academy?.id || academy.status !== 'active') return;

    const storageKey = `approved_shown_${academy.id}`;
    AsyncStorage.getItem(storageKey).then((shown) => {
      if (!shown) {
        // 아직 승인 알림을 본 적 없음 → 표시 후 플래그 저장
        AsyncStorage.setItem(storageKey, '1');
        Alert.alert(
          '🎉 학원 승인 완료!',
          `${academy.name} 학원이 승인되었어요.\n이제 모든 기능을 사용할 수 있어요!`,
          [{ text: '확인' }],
        );
      }
    });
  }, [academy?.id, academy?.status]);

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

  // Firestore에서 학생 수·선생님 수·반 목록 로드
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      try {
        // is_active 필터 제거 → getDocs + 메모리 필터 (자가 가입 학생 포함)
        const [studentSnap, teacherSnap, classSnap] = await Promise.all([
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'student'),
            )
          ),
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'teacher'),
            )
          ),
          // 반 목록 (출석률 표시용으로 문서 전체 필요)
          getDocs(
            query(
              Collections.classes(),
              where('academy_id', '==', user.academy_id),
            )
          ),
        ]);

        const classList = classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setStudentCount(studentSnap.docs.filter(d => d.data().is_active !== false).length);
        setTeacherCount(teacherSnap.docs.filter(d => d.data().is_active !== false).length);
        setClasses(classList);

        // 반별 학생 수 병렬 집계
        const countResults = await Promise.all(
          classList.map(async cls => {
            const snap = await getDocs(
              query(
                Collections.users(),
                where('academy_id', '==', user.academy_id),
                where('class_id', '==', cls.id),
                where('role', '==', 'student'),
              )
            );
            return { classId: cls.id, count: snap.docs.filter(d => d.data().is_active !== false).length };
          })
        );
        const cMap: Record<string, number> = {};
        countResults.forEach(({ classId, count }) => { cMap[classId] = count; });
        setClassStudentCounts(cMap);
      } catch (e) {
        console.error('[AdminHome] 통계 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
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
          <View>
            <Text style={styles.headerAcademy}>{academy?.name ?? '학원'} 운영 현황</Text>
          </View>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => router.push('/common/notification-inbox')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            {/* 미읽음 dot 배지 — 숫자 없이 점만 표시 (ui-screens.md 규칙) */}
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        </View>

        {/* 2칸 그리드: 전체 학생 / 오늘 출석률 */}
        <View style={styles.statGrid2}>
          <View style={styles.statBox2}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 4 }} />
            ) : (
              <Text style={styles.statNum2}>{studentCount ?? 0}명</Text>
            )}
            <Text style={styles.statLbl2}>전체 학생</Text>
          </View>
          <View style={styles.statBox2}>
            {isLoadingAttendance ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 4 }} />
            ) : (
              <Text style={styles.statNum2}>{todayRate ?? 0}%</Text>
            )}
            <Text style={styles.statLbl2}>오늘 출석률</Text>
          </View>
        </View>

        {/* 3칸 그리드: 반 수 / 선생님 수 / 플랜 */}
        <View style={styles.statGrid3}>
          <View style={styles.statBox3}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 2 }} />
            ) : (
              <Text style={styles.statNum3}>{classes.length}</Text>
            )}
            <Text style={styles.statLbl3}>반 수</Text>
          </View>
          <View style={styles.statBox3}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 2 }} />
            ) : (
              <Text style={styles.statNum3}>{teacherCount ?? 0}</Text>
            )}
            <Text style={styles.statLbl3}>선생님</Text>
          </View>
          <View style={styles.statBox3}>
            <Text style={styles.statNum3}>
              {academy?.plan === 'pro' ? 'Pro' : academy?.plan === 'trial' ? 'Trial' : 'Free'}
            </Text>
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

  // 2칸 그리드
  statGrid2: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox2: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12,
  },
  statNum2: { fontSize: 30, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLbl2: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  // 3칸 그리드
  statGrid3: { flexDirection: 'row', gap: 8 },
  statBox3: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 10,
    alignItems: 'center',
  },
  statNum3: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLbl3: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },

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
