/**
 * app/(app)/(teacher)/profile.tsx — 선생님 내정보 화면
 *
 * 보라 그라데이션 프로필 + 통계 카드 + 설정 메뉴 + 로그아웃
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { getDocs, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { initFCM } from '../../../lib/fcm';
import { useAuthStore } from '../../../store/useAuthStore';
import { updateDoc } from 'firebase/firestore';
import { Class, AttendanceRecord } from '../../../types';

// AsyncStorage 키 — 푸시 알림 ON/OFF 설정 저장
const NOTIF_PREF_KEY = 'teacher_push_enabled';

// 통계 데이터 타입
interface Stats {
  studentCount: number;   // 담당 학생 수
  checkedCount: number;   // 숙제 검사 완료 수
  attendanceRate: number; // 이번 달 출석률 (%)
}

export default function TeacherProfileScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user, academy, clearUser } = useAuthStore();

  // ── 상태 ──────────────────────────────────────
  const [assignedClasses, setAssignedClasses] = useState<Class[]>([]);
  const [stats, setStats] = useState<Stats>({ studentCount: 0, checkedCount: 0, attendanceRate: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // ── 푸시 알림 설정 불러오기 ────────────────────
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((val) => {
      // 저장된 값이 없으면 기본 ON
      if (val !== null) setPushEnabled(val === 'true');
    });
  }, []);

  // 푸시 알림 토글 처리
  const handlePushToggle = useCallback(async (value: boolean) => {
    setPushEnabled(value);
    await AsyncStorage.setItem(NOTIF_PREF_KEY, String(value));

    if (!user?.uid) return;
    if (value === false) {
      // 토글 OFF: FCM 토큰 null 처리 → Cloud Functions가 발송 건너뜀
      await updateDoc(Collections.user(user.uid), { fcm_token: null }).catch((e) =>
        console.warn('[TeacherProfile] fcm_token 제거 실패:', e)
      );
    } else {
      // 토글 ON: 토큰 재발급 + Firestore 저장
      await initFCM(user.uid).catch((e) =>
        console.warn('[TeacherProfile] FCM 재초기화 실패:', e)
      );
    }
  }, [user?.uid]);

  // ── 통계 + 담당반 데이터 로드 ─────────────────
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (classIds.length === 0) {
      setAssignedClasses([]);
      setIsStatsLoading(false);
      return;
    }

    (async () => {
      try {
        // 1) 담당 반 문서 조회
        const classSnap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user?.academy_id ?? ''))
        );
        const assignedDocs = classSnap.docs.filter((d) => classIds.includes(d.id));
        const loadedClasses = assignedDocs.map((d) => ({ id: d.id, ...d.data() } as Class));

        // 실제 학생 수 직접 쿼리 — student_count 캐시 필드가 부정확할 수 있으므로
        const studentSnap = await getDocs(
          query(
            Collections.users(),
            where('academy_id', '==', user?.academy_id ?? ''),
            where('role', '==', 'student'),
            where('is_active', '==', true),
          )
        );
        // class_id별 학생 수 집계
        const countByClass: Record<string, number> = {};
        studentSnap.docs.forEach((d) => {
          const cid = d.data().class_id as string | null;
          if (cid && classIds.includes(cid)) {
            countByClass[cid] = (countByClass[cid] ?? 0) + 1;
          }
        });
        // loadedClasses에 실제 학생 수 반영
        const classesWithCount = loadedClasses.map((c) => ({
          ...c,
          student_count: countByClass[c.id] ?? 0,
        }));
        const totalStudents = classesWithCount.reduce((sum, c) => sum + c.student_count!, 0);
        setAssignedClasses(classesWithCount);

        // 2) 숙제 검사 완료 수 — 이 선생님이 만든 숙제의 checked 제출물 집계
        //    Firestore 비용 절감을 위해 최근 20개 숙제만 처리
        const hwSnap = await getDocs(
          query(Collections.homeworks(), where('created_by', '==', user?.uid ?? ''))
        );
        const recentHws = hwSnap.docs.slice(0, 20);
        const checkedCounts = await Promise.all(
          recentHws.map(async (hwDoc) => {
            const subSnap = await getDocs(
              query(Collections.submissions(hwDoc.id), where('status', '==', 'checked'))
            );
            return subSnap.size;
          })
        );
        const totalChecked = checkedCounts.reduce((a, b) => a + b, 0);

        // 3) 이번 달 출석률 계산 — 담당반 × 이번 달 날짜별 records 집계
        //    Firestore 비용 절감: 최대 3개 반 × 오늘까지 지난 날짜만 처리
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const todayDay = today.getDate();
        const targetClassIds = classIds.slice(0, 3);

        // 이번 달 1일 ~ 오늘까지의 날짜 배열 생성
        const dates = Array.from({ length: todayDay }, (_, i) => {
          const d = new Date(year, month - 1, i + 1);
          return d.toISOString().split('T')[0];
        });

        let presentCount = 0;
        let totalCount = 0;

        await Promise.all(
          targetClassIds.flatMap((classId) =>
            dates.map(async (dateStr) => {
              const snap = await getDocs(Collections.attendanceRecords(classId, dateStr));
              snap.forEach((docSnap) => {
                const record = docSnap.data() as AttendanceRecord;
                // onLeave(휴원)는 출석률 계산에서 제외
                if (record.status !== 'onLeave') {
                  totalCount++;
                  if (record.status === 'present') presentCount++;
                }
              });
            })
          )
        );

        const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

        setStats({
          studentCount: totalStudents,
          checkedCount: totalChecked,
          attendanceRate: rate,
        });
      } catch (e) {
        console.error('[TeacherProfile] 데이터 로드 실패:', e);
      } finally {
        setIsStatsLoading(false);
      }
    })();
  }, [user?.assigned_class_ids?.join(',')]);

  // ── 로그아웃 ──────────────────────────────────
  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          clearUser();
          // app/_layout.tsx의 onAuthStateChanged가 /(auth)로 자동 이동
        },
      },
    ]);
  };

  // ── 비밀번호 변경 (준비 중) ───────────────────
  const handlePasswordChange = () => {
    Alert.alert('비밀번호 변경', '이 기능은 준비 중이에요.\n곧 업데이트될 예정입니다.', [
      { text: '확인' },
    ]);
  };

  // ── 소셜 계정 연결 (준비 중) ─────────────────
  const handleSocialConnect = () => {
    Alert.alert('소셜 계정 연결', '이 기능은 준비 중이에요.\n곧 업데이트될 예정입니다.', [
      { text: '확인' },
    ]);
  };

  // ── 문의하기 — 카카오 채널 또는 이메일 ────────
  const handleInquiry = () => {
    Alert.alert(
      '문의하기',
      '이메일로 문의해 주세요.\nsupport@woongking.kr',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이메일 보내기',
          onPress: () => Linking.openURL('mailto:support@woongking.kr'),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} bounces={false}>
      {/* ── 보라 그라데이션 프로필 영역 ── */}
      <LinearGradient
        colors={['#7C3AED', '#5B50E8']}
        style={[styles.gradientHeader, { paddingTop: top + 12 }]}
      >
        {/* 상단 타이틀 */}
        <Text style={styles.headerTitle}>내 정보</Text>

        {/* 아바타 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>👩‍💻</Text>
          </View>
        </View>

        {/* 이름 + 역할 */}
        <Text style={styles.profileName}>{user?.name ?? '선생님'} 선생님</Text>
        <Text style={styles.profileAcademy}>{academy?.name ?? ''}</Text>

        {/* 역할 칩 + 담당반 칩 */}
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>선생님</Text>
          </View>
          {assignedClasses.length > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>담당반 {assignedClasses.length}개</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── 통계 카드 — 그라데이션 위에 떠 있는 흰 카드 ── */}
      <View style={styles.statsCard}>
        {isStatsLoading ? (
          <ActivityIndicator color="#5B50E8" style={{ paddingVertical: 16 }} />
        ) : (
          <View style={styles.statsRow}>
            {/* 담당 학생 수 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#5B50E8' }]}>
                {stats.studentCount}
              </Text>
              <Text style={styles.statLabel}>담당 학생</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 숙제 검사 완료 수 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#5B50E8' }]}>
                {stats.checkedCount}
              </Text>
              <Text style={styles.statLabel}>검사 완료</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 이번 달 출석률 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#5B50E8' }]}>
                {stats.attendanceRate > 0 ? `${stats.attendanceRate}%` : '-'}
              </Text>
              <Text style={styles.statLabel}>출석률</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── 담당 반 섹션 — 반 카드 클릭 시 학생 화면으로 이동 ── */}
      {assignedClasses.length > 0 && (
        <View style={styles.classSection}>
          <Text style={styles.classSectionTitle}>담당 반</Text>
          {assignedClasses.map((cls) => (
            <TouchableOpacity
              key={cls.id}
              style={styles.classCard}
              onPress={() =>
                router.push(`/(app)/(teacher)/students?classId=${cls.id}`)
              }
              activeOpacity={0.75}
            >
              <View style={styles.classCardLeft}>
                <View style={styles.classIconBox}>
                  <Text style={styles.classIconText}>🏫</Text>
                </View>
                <View>
                  <Text style={styles.className}>{cls.name}</Text>
                  <Text style={styles.classStudentCount}>
                    학생 {cls.student_count ?? 0}명
                  </Text>
                </View>
              </View>
              <View style={styles.classCardRight}>
                <Text style={styles.classActionLabel}>학생 보기</Text>
                <Ionicons name="chevron-forward" size={16} color="#5B50E8" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── 설정 메뉴 카드 ── */}
      <View style={styles.menuCard}>
        {/* 푸시 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuLabel}>푸시 알림</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: '#E2E8F0', true: '#5B50E8' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuDivider} />

        {/* 비밀번호 변경 */}
        <TouchableOpacity style={styles.menuItem} onPress={handlePasswordChange} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuLabel}>비밀번호 변경</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* 소셜 계정 연결 */}
        <TouchableOpacity style={styles.menuItem} onPress={handleSocialConnect} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>📱</Text>
            <Text style={styles.menuLabel}>소셜 계정 연결</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* 문의하기 */}
        <TouchableOpacity style={styles.menuItem} onPress={handleInquiry} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={styles.menuLabel}>문의하기</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>
      </View>

      {/* ── 로그아웃 버튼 ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      {/* 하단 여백 */}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // ── 그라데이션 헤더 ──
  gradientHeader: {
    paddingBottom: 60, // 통계 카드가 겹칠 공간
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 20,
    alignSelf: 'center',
  },

  // 아바타
  avatarWrapper: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarEmoji: {
    fontSize: 36,
  },

  // 이름, 학원명
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  profileAcademy: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 14,
  },

  // 역할 칩
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 통계 카드 ──
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -36, // 그라데이션 위로 겹침
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 20,
    paddingHorizontal: 8,
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
  },

  // ── 담당 반 섹션 ──
  classSection: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  classSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  classCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  classIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#EEEDF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classIconText: { fontSize: 20 },
  className: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  classStudentCount: { fontSize: 13, color: '#64748B', marginTop: 2 },
  classCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  classActionLabel: { fontSize: 13, fontWeight: '700', color: '#5B50E8' },

  // ── 설정 메뉴 카드 ──
  menuCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuIcon: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 58, // 아이콘 너비만큼 들여쓰기
  },

  // ── 로그아웃 버튼 ──
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
});
