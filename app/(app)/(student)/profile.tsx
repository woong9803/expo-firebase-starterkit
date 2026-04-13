/**
 * app/(app)/(student)/profile.tsx — 학생 내정보 화면
 *
 * 초록 그라데이션 프로필 + 통계 카드 + 연동코드 + 설정 메뉴 + 로그아웃
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
  Share,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth, db } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class, Homework, AttendanceRecord } from '../../../types';

// AsyncStorage 키 — 알림 ON/OFF 설정 저장
const NOTIF_PREF_KEY = 'student_push_enabled';

// 통계 데이터 타입
interface Stats {
  submitCount: number;    // 제출 완료 수
  streak: number;         // 스트릭 일수
  attendanceRate: number; // 이번 달 출석률 (%)
}

export default function StudentProfileScreen() {
  const { user, academy, clearUser } = useAuthStore();

  // ── 상태 ──────────────────────────────────────
  const [className, setClassName] = useState<string>('');
  const [stats, setStats] = useState<Stats>({ submitCount: 0, streak: user?.streak ?? 0, attendanceRate: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // ── 알림 설정 불러오기 ─────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((val) => {
      if (val !== null) setPushEnabled(val === 'true');
    });
  }, []);

  const handlePushToggle = useCallback(async (value: boolean) => {
    setPushEnabled(value);
    await AsyncStorage.setItem(NOTIF_PREF_KEY, String(value));
  }, []);

  // ── 반 이름 + 통계 데이터 로드 ─────────────────
  useEffect(() => {
    if (!user?.uid || !user?.class_id) {
      setIsStatsLoading(false);
      return;
    }

    (async () => {
      try {
        // 1) 소속 반 이름 조회
        const classSnap = await getDoc(Collections.class(user.class_id!));
        if (classSnap.exists()) {
          setClassName((classSnap.data() as Class).name);
        }

        // 2) 제출 완료 수 계산
        //    학생 반의 숙제 목록 조회 후 내 제출물 존재 여부 확인 (최근 30개)
        const hwSnap = await getDocs(
          query(Collections.homeworks(), where('class_id', '==', user.class_id))
        );
        const hwList = hwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
        const recentHws = hwList.slice(0, 30);

        const subResults = await Promise.all(
          recentHws.map(async (hw) => {
            const subRef = Collections.submission(hw.id, user.uid);
            const subSnap = await getDoc(subRef);
            return subSnap.exists() ? 1 : 0; // 숫자 반환
          })
        );
        // (0|1)[] 타입 오류 방지를 위해 명시적 Number 합산
        const totalSubmit = subResults.reduce((acc: number, cur) => acc + cur, 0);

        // 3) 이번 달 출석률 계산
        //    attendances/{classId_date}/records/{studentUid} 직접 읽기
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const todayDay = today.getDate();

        // 1일 ~ 오늘까지 날짜 배열 생성
        const dates = Array.from({ length: todayDay }, (_, i) => {
          const dd = String(i + 1).padStart(2, '0');
          return `${yearMonth}-${dd}`;
        });

        let presentCnt = 0;
        let totalCnt = 0;

        await Promise.all(
          dates.map(async (dateStr) => {
            const ref = doc(
              db,
              'attendances',
              `${user.class_id}_${dateStr}`,
              'records',
              user.uid
            );
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const record = snap.data() as AttendanceRecord;
              // onLeave(휴원)는 출석률 계산에서 제외
              if (record.status !== 'onLeave') {
                totalCnt++;
                if (record.status === 'present') presentCnt++;
              }
            }
          })
        );

        const rate = totalCnt > 0 ? Math.round((presentCnt / totalCnt) * 100) : 0;

        setStats({
          submitCount: totalSubmit,
          streak: user.streak ?? 0,
          attendanceRate: rate,
        });
      } catch (e) {
        console.error('[StudentProfile] 데이터 로드 실패:', e);
      } finally {
        setIsStatsLoading(false);
      }
    })();
  }, [user?.uid, user?.class_id]);

  // ── 연동코드 공유 ─────────────────────────────
  const handleShareLinkCode = useCallback(async () => {
    const code = user?.link_code;
    if (!code) {
      Alert.alert('연동코드 없음', '연동코드가 아직 생성되지 않았어요.');
      return;
    }
    try {
      await Share.share({
        message: `EduOnePass 학부모 연동코드: ${code}\n앱에서 이 코드를 입력하면 자녀와 연결됩니다.`,
      });
    } catch {
      Alert.alert('공유 실패', '코드를 공유할 수 없어요.');
    }
  }, [user?.link_code]);

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

  // ── 문의하기 ──────────────────────────────────
  const handleInquiry = () => {
    Alert.alert(
      '문의하기',
      '이메일로 문의해 주세요.\nsupport@eduonepass.kr',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이메일 보내기',
          onPress: () => Linking.openURL('mailto:support@eduonepass.kr'),
        },
      ]
    );
  };

  const linkCode = user?.link_code ?? '';

  return (
    <ScrollView style={styles.container} bounces={false}>
      {/* ── 초록 그라데이션 프로필 영역 ── */}
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={styles.gradientHeader}
      >
        {/* 상단 타이틀 */}
        <Text style={styles.headerTitle}>내 정보</Text>

        {/* 아바타 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>👧</Text>
          </View>
        </View>

        {/* 이름 */}
        <Text style={styles.profileName}>{user?.name ?? '학생'}</Text>

        {/* 반 · 학원명 */}
        <Text style={styles.profileSub}>
          {[className, academy?.name].filter(Boolean).join(' · ')}
        </Text>

        {/* 스트릭 + 출석률 칩 */}
        <View style={styles.chipRow}>
          {(stats.streak > 0) && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>🔥 {stats.streak}일 스트릭</Text>
            </View>
          )}
          {stats.attendanceRate > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>출석률 {stats.attendanceRate}%</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── 통계 카드 — 그라데이션에 겹침 ── */}
      <View style={styles.statsCard}>
        {isStatsLoading ? (
          <ActivityIndicator color="#10B981" style={{ paddingVertical: 16 }} />
        ) : (
          <View style={styles.statsRow}>
            {/* 제출 완료 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#0F172A' }]}>
                {stats.submitCount}
              </Text>
              <Text style={styles.statLabel}>제출 완료</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 스트릭 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                🔥{stats.streak}
              </Text>
              <Text style={styles.statLabel}>스트릭</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 출석률 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                {stats.attendanceRate > 0 ? `${stats.attendanceRate}%` : '-'}
              </Text>
              <Text style={styles.statLabel}>출석률</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── 연동코드 카드 ── */}
      <View style={styles.linkCodeSection}>
        <Text style={styles.linkCodeLabel}>연동코드 (학부모에게 공유)</Text>
        <View style={styles.linkCodeCard}>
          {/* 코드 표시 — 6자리를 한 글자씩 띄어서 표시 */}
          <Text style={styles.linkCodeText}>
            {linkCode
              ? linkCode.toUpperCase().split('').join(' ')
              : '- - - - - -'}
          </Text>
          {/* 복사(공유) 버튼 */}
          <TouchableOpacity
            style={[styles.copyBtn, !linkCode && styles.copyBtnDisabled]}
            onPress={handleShareLinkCode}
            activeOpacity={0.8}
            disabled={!linkCode}
          >
            <Text style={styles.copyBtnText}>복사</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 설정 메뉴 카드 ── */}
      <View style={styles.menuCard}>
        {/* 알림 설정 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuLabel}>알림 설정</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: '#E2E8F0', true: '#10B981' }}
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
    paddingTop: 56,
    paddingBottom: 60, // 통계 카드가 겹칠 공간
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 20,
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

  // 이름, 반·학원
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  profileSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 14,
  },

  // 칩 Row
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
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

  // ── 연동코드 섹션 ──
  linkCodeSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  linkCodeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    marginLeft: 2,
  },
  linkCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  linkCodeText: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 2,
  },
  copyBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  copyBtnDisabled: {
    backgroundColor: '#A7F3D0',
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

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
    marginLeft: 58,
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
