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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class } from '../../../types';

export default function AdminHomeScreen() {
  const router = useRouter();
  const { user, academy } = useAuthStore();
  const isPending = academy?.status === 'pending';

  // ── 통계 상태 ──────────────────────────────────────────────────────
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firestore에서 학생 수·선생님 수·반 목록 로드
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      try {
        const [studentSnap, teacherSnap, classSnap] = await Promise.all([
          // 학생 수 (getCountFromServer — 문서 전체를 내려받지 않아 효율적)
          getCountFromServer(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'student'),
              where('is_active', '==', true),
            )
          ),
          // 선생님 수
          getCountFromServer(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'teacher'),
              where('is_active', '==', true),
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

        setStudentCount(studentSnap.data().count);
        setTeacherCount(teacherSnap.data().count);
        setClasses(classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
      } catch (e) {
        console.error('[AdminHome] 통계 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id]);

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
        style={styles.headerCard}
      >
        {/* 상단 Row: 학원명 + 알림 아이콘 */}
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>원장님 대시보드 👑</Text>
            <Text style={styles.headerAcademy}>{academy?.name ?? '학원'}</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn}>
            <Ionicons name="notifications-outline" size={20} color="#fff" />
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
            <Text style={styles.statNum2}>0%</Text>
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

      {/* ── 빠른 이동 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>빠른 이동</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push('/(app)/(admin)/teachers')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EEEDF9' }]}>
              <Ionicons name="person-circle-outline" size={22} color="#5B50E8" />
            </View>
            <Text style={styles.quickLabel}>선생님 관리</Text>
            <Text style={styles.quickCount}>
              {isLoading ? '-' : `${teacherCount ?? 0}명`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="people-outline" size={22} color="#10B981" />
            </View>
            <Text style={styles.quickLabel}>학생 관리</Text>
            <Text style={styles.quickCount}>
              {isLoading ? '-' : `${studentCount ?? 0}명`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 오늘 확인 필요 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚨 오늘 확인 필요</Text>
        <View style={styles.alertGrid}>
          <View style={[styles.alertTile, styles.alertRed]}>
            <Text style={styles.alertNum_red}>0</Text>
            <Text style={styles.alertLbl_red}>오늘 결석</Text>
          </View>
          <View style={[styles.alertTile, styles.alertAmber]}>
            <Text style={styles.alertNum_amber}>0</Text>
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
          classes.map((c) => (
            <View key={c.id} style={styles.classRow}>
              <View style={styles.classInfo}>
                <Text style={styles.className}>{c.name}</Text>
                <Text style={styles.classRate}>0%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: '0%', backgroundColor: '#10B981' }]} />
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

  // ── 그라데이션 헤더 카드 ──
  headerCard: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
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
  headerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  headerAcademy: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  bellBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  // 2칸 그리드
  statGrid2: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox2: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12,
  },
  statNum2: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLbl2: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },

  // 3칸 그리드
  statGrid3: { flexDirection: 'row', gap: 8 },
  statBox3: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 10,
    alignItems: 'center',
  },
  statNum3: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLbl3: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },

  // ── 승인 대기 배너 ──
  pendingBanner: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    marginHorizontal: 16, marginTop: 16,
  },
  pendingTitle: { fontSize: 13, fontWeight: '700', color: '#78350F', marginBottom: 2 },
  pendingDesc: { fontSize: 12, color: '#92400E', lineHeight: 17 },

  // ── 섹션 ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },

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
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  quickCount: { fontSize: 11, color: '#64748B' },

  // 오늘 확인 필요 타일
  alertGrid: { flexDirection: 'row', gap: 10 },
  alertTile: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  alertRed: { backgroundColor: '#FEE2E2' },
  alertAmber: { backgroundColor: '#FEF3C7' },
  alertNum_red: { fontSize: 28, fontWeight: '800', color: '#EF4444', marginBottom: 4 },
  alertLbl_red: { fontSize: 11, fontWeight: '600', color: '#991B1B' },
  alertNum_amber: { fontSize: 28, fontWeight: '800', color: '#F59E0B', marginBottom: 4 },
  alertLbl_amber: { fontSize: 11, fontWeight: '600', color: '#92400E' },

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
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 },

  // 반별 출석률
  classRow: { marginBottom: 12 },
  classInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  className: { fontSize: 12, fontWeight: '600', color: '#334155' },
  classRate: { fontSize: 12, color: '#64748B' },
  barTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
