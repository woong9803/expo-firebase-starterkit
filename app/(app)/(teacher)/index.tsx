import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { query, where, getDocs, orderBy, limit, documentId } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { getAbsentCountToday } from '../../../lib/attendance';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class, Notice } from '../../../types';


export default function TeacherHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 홈 통계
  const [pendingHomeworkCount, setPendingHomeworkCount] = useState(0);
  const [absentTodayCount, setAbsentTodayCount] = useState(0);

  useEffect(() => {
    if (!user?.uid || !user?.academy_id) return;

    const fetchData = async () => {
      try {
        // assigned_class_ids 배열로 직접 반 문서 조회 (head_teacher_id 쿼리 제거)
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

        const noticeSnap = await getDocs(
          query(
            Collections.notices(),
            where('academy_id', '==', user.academy_id),
            orderBy('created_at', 'desc'),
            limit(3),
          )
        );
        setNotices(noticeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));

        // 미검사 숙제 수: 담당 반의 숙제 중 미제출 건수 (간소화 — 미완료 숙제 총 수)
        if (classIds.length > 0) {
          const today = new Date();
          const hwSnap = await getDocs(
            query(
              Collections.homeworks(),
              where('class_id', 'in', classIds.slice(0, 10)), // Firestore in 한도 10개
            )
          );
          // 마감이 지나지 않은 숙제 수 = 미검사 대상
          const pending = hwSnap.docs.filter(d => {
            const hw = d.data();
            return hw.due_date?.toDate ? hw.due_date.toDate() >= today : false;
          });
          setPendingHomeworkCount(pending.length);
        }

        // 오늘 결석 수: records는 서브컬렉션이므로 getAbsentCountToday 헬퍼로 조회
        if (classIds.length > 0) {
          const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const absentCount = await getAbsentCountToday(classIds, todayStr);
          setAbsentTodayCount(absentCount);
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
        style={styles.headerCard}
      >
        {/* 상단 Row */}
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>좋은 아침이에요 ☀️</Text>
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
            <TouchableOpacity style={styles.headerActionBtn}>
              <Ionicons name="notifications-outline" size={18} color="#fff" />
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
            {/* 이번달 출석률: TODO — 출결 집계 로직 구현 후 연결 */}
            <Text style={styles.statNum}>-</Text>
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
            {classes.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.classCard, selectedClassId === c.id && styles.classCardActive]}
                onPress={() => setSelectedClassId(c.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.classCardName, selectedClassId === c.id && styles.classCardNameActive]}>
                  {c.name}
                </Text>
                <Text style={styles.classCardSub}>학생 {c.student_count ?? 0}명</Text>
                <Text style={styles.classCardStatus}>출석 {c.present_count ?? 0}명 ●</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── 숙제 검사 현황 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📝 숙제 검사 현황</Text>
          <TouchableOpacity><Text style={styles.sectionLink}>전체</Text></TouchableOpacity>
        </View>

        <Text style={styles.emptyText}>숙제 출제 후 현황이 표시됩니다</Text>
      </View>

      {/* ── 최근 공지 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📢 최근 공지</Text>
          <TouchableOpacity><Text style={styles.sectionLink}>작성</Text></TouchableOpacity>
        </View>

        {notices.length === 0 ? (
          <Text style={styles.emptyText}>등록된 공지가 없어요</Text>
        ) : (
          notices.map((n) => (
            <View key={n.id} style={styles.noticeCard}>
              {/* 좌측 세로바 */}
              <View style={[styles.noticeBar, { backgroundColor: n.is_important ? '#EF4444' : '#CBD5E1' }]} />
              <View style={styles.noticeBody}>
                {n.is_important && (
                  <View style={styles.importantChip}>
                    <Text style={styles.importantChipText}>중요</Text>
                  </View>
                )}
                <Text style={styles.noticeTitle}>{n.title}</Text>
                <View style={styles.noticeProgressRow}>
                  <View style={styles.noticeBarTrack}>
                    <View style={[styles.noticeBarFill, { width: '0%' as any }]} />
                  </View>
                  <Text style={styles.noticeReadCount}>읽음 현황</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { paddingBottom: 32 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── 그라데이션 헤더 ──
  headerCard: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  headerName: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  // 통계 3칸
  statGrid: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12,
  },
  statNum: { fontSize: 26, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // ── 섹션 공통 ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  sectionLink: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

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
  classCardName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  classCardNameActive: { color: '#5B50E8' },
  classCardSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  classCardStatus: { fontSize: 11, color: '#10B981', fontWeight: '600', marginTop: 4 },

  // ── 숙제 검사 카드 ──
  hwCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  hwTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hwTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  dDayChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  dDayRed: { backgroundColor: '#FEE2E2' },
  dDayGray: { backgroundColor: '#F1F5F9' },
  dDayText: { fontSize: 10, fontWeight: '700' },
  dDayTextRed: { color: '#991B1B' },
  dDayTextGray: { color: '#334155' },
  hwSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  hwStatusRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 10,
  },
  hwStatusLabel: { fontSize: 11, color: '#64748B' },
  hwStatusCount: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
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
  chipGreenText: { fontSize: 10, fontWeight: '700', color: '#065F46' },
  chipRed: {
    backgroundColor: '#FEE2E2', borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  chipRedText: { fontSize: 10, fontWeight: '700', color: '#991B1B' },

  // ── 공지 카드 ──
  noticeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  noticeBar: { width: 2.5, borderRadius: 2, marginRight: 12 },
  noticeBody: { flex: 1 },
  importantChip: {
    backgroundColor: '#EF4444', borderRadius: 6,
    paddingVertical: 2, paddingHorizontal: 7,
    alignSelf: 'flex-start', marginBottom: 4,
  },
  importantChipText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  noticeTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  noticeProgressRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginTop: 8,
  },
  noticeBarTrack: {
    flex: 1, height: 4, backgroundColor: '#E2E8F0',
    borderRadius: 2, overflow: 'hidden',
  },
  noticeBarFill: { height: '100%', backgroundColor: '#5B50E8', borderRadius: 2 },
  noticeReadCount: { fontSize: 10, color: '#64748B' },
});
