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
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth, app } from '../../../../lib/firebase';
import { Collections } from '../../../../lib/firestore';
import { initFCM } from '../../../../lib/fcm';
import { useAuthStore } from '../../../../store/useAuthStore';
import { updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Class, AttendanceRecord } from '../../../../types';
import PasswordChangeModal from '../../../../components/PasswordChangeModal';
import { strings } from '../../../../constants/strings';

const APP_VERSION = '1.0.0';

// AsyncStorage 키 — 푸시 알림 ON/OFF 설정 저장
const NOTIF_PREF_KEY = 'teacher_push_enabled';

// 통계 데이터 타입
interface Stats {
  studentCount: number;   // 담당 학생 수
  attendanceRate: number; // 이번 달 출석률 (%)
}

export default function TeacherProfileScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user, academy, clearUser } = useAuthStore();

  // ── 상태 ──────────────────────────────────────
  const [assignedClasses, setAssignedClasses] = useState<Class[]>([]);
  // { classId: 학생 수 } — 실시간 구독으로 갱신
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Stats>({ studentCount: 0, attendanceRate: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isPwModalVisible, setIsPwModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

    // Firestore notif_prefs 업데이트 — Cloud Functions 서버 측 필터링에 사용됨
    // 선생님은 단일 토글로 모든 알림 유형을 일괄 제어
    await updateDoc(Collections.user(user.uid), {
      'notif_prefs.homework': value,
      'notif_prefs.feedback': value,
      'notif_prefs.notice':   value,
      'notif_prefs.attendance': value,
    }).catch((e) => console.warn('[TeacherProfile] notif_prefs 업데이트 실패:', e));

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

  // ── 1) 담당 반 실시간 구독 ────────────────────
  // 반 이름·정보가 변경되면 즉시 화면에 반영
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (!user?.academy_id || classIds.length === 0) {
      setAssignedClasses([]);
      setIsStatsLoading(false);
      return;
    }

    const unsub = onSnapshot(
      query(Collections.classes(), where('academy_id', '==', user.academy_id)),
      (snap) => {
        // 전체 반 중 내 담당반만 필터링
        const filtered = snap.docs
          .filter((d) => classIds.includes(d.id))
          .map((d) => ({ id: d.id, ...d.data() } as Class));
        setAssignedClasses(filtered);
      },
      (e) => console.warn('[TeacherProfile] 반 구독 실패:', e),
    );
    return () => unsub();
  }, [user?.assigned_class_ids?.join(','), user?.academy_id]);

  // ── 2) 학생 수 실시간 구독 ────────────────────
  // 학생 가입·탈퇴·반 이동 시 즉시 카운트 갱신
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (!user?.academy_id || classIds.length === 0) {
      setStudentCounts({});
      setStats((prev) => ({ ...prev, studentCount: 0 }));
      return;
    }

    const unsub = onSnapshot(
      query(
        Collections.users(),
        where('academy_id', '==', user.academy_id),
        where('role', '==', 'student'),
        where('is_active', '==', true),
      ),
      (snap) => {
        // class_id별 학생 수 집계 — 탈퇴 학생(deleted_at != null) 제외
        const countByClass: Record<string, number> = {};
        snap.docs.forEach((d) => {
          if (d.data().deleted_at) return; // 탈퇴 학생 스킵
          const cid = d.data().class_id as string | null;
          if (cid && classIds.includes(cid)) {
            countByClass[cid] = (countByClass[cid] ?? 0) + 1;
          }
        });
        setStudentCounts(countByClass);
        // 총 담당 학생 수도 통계에 즉시 반영
        const total = Object.values(countByClass).reduce((a, b) => a + b, 0);
        setStats((prev) => ({ ...prev, studentCount: total }));
      },
      (e) => console.warn('[TeacherProfile] 학생 수 구독 실패:', e),
    );
    return () => unsub();
  }, [user?.assigned_class_ids?.join(','), user?.academy_id]);

  // ── 3) 숙제 검사 수 + 출석률 일회성 로드 ────────
  // 집계 비용이 크므로 담당반 변경 시에만 재조회
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (!user?.uid || classIds.length === 0) {
      setStats((prev) => ({ ...prev, attendanceRate: 0 }));
      setIsStatsLoading(false);
      return;
    }

    (async () => {
      setIsStatsLoading(true);
      try {
        // 이번 달 출석률 — 최대 3개 반 × 오늘까지 날짜 처리 (Firestore 비용 절감)
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const todayDay = today.getDate();
        const targetClassIds = classIds.slice(0, 3);

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

        setStats((prev) => ({ ...prev, attendanceRate: rate }));
      } catch (e) {
        console.error('[TeacherProfile] 통계 로드 실패:', e);
      } finally {
        setIsStatsLoading(false);
      }
    })();
  }, [user?.assigned_class_ids?.join(','), user?.uid]);

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

  // ── 비밀번호 변경 모달 열기 ──────────────────
  const handlePasswordChange = () => setIsPwModalVisible(true);

  // ── 소셜 계정 연결 (준비 중) ─────────────────
  const handleSocialConnect = () => {
    Alert.alert('소셜 계정 연결', '이 기능은 준비 중이에요.\n곧 업데이트될 예정입니다.', [
      { text: '확인' },
    ]);
  };

  // ── 문의하기 — 기기 정보 포함 이메일 열기 ──────
  const handleInquiry = () => {
    const body = `\n\n---\n기기: ${Platform.OS} ${Platform.Version}\n앱 버전: ${APP_VERSION}\n사용자 ID: ${user?.uid ?? ''}`;
    const mailto = `mailto:${strings.account.inquiryEmail}?subject=${encodeURIComponent(strings.account.inquirySubject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailto).catch(() =>
      Alert.alert(strings.account.inquiryTitle, `${strings.account.inquiryEmail}로 문의해주세요.`)
    );
  };

  // ── 탈퇴하기 ──────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      strings.account.deleteConfirmTitle,
      strings.account.deleteConfirmMessage,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.account.deleteButton,
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const fns = getFunctions(app, 'asia-northeast3');
              const deleteUserFn = httpsCallable(fns, 'deleteUser');
              await deleteUserFn({});
              await signOut(auth);
              clearUser();
            } catch {
              Alert.alert(strings.common.error, strings.account.deleteFailed);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
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
            <Text style={styles.avatarEmoji}>{(user?.name ?? '선생님').slice(0, 1)}</Text>
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

      {/* ── 담당 반 섹션 ── */}
      <View style={styles.classSection}>
        {/* 섹션 헤더: 제목 + 변경 버튼 */}
        <View style={styles.classSectionHeader}>
          <Text style={styles.classSectionTitle}>담당 반</Text>
          <TouchableOpacity
            onPress={() => router.push('/(app)/(teacher)/class-select')}
            activeOpacity={0.7}
            style={styles.classEditBtn}
          >
            <Ionicons name="pencil-outline" size={14} color="#5B50E8" />
            <Text style={styles.classEditText}>변경</Text>
          </TouchableOpacity>
        </View>

        {assignedClasses.length === 0 ? (
          /* 담당반 없을 때 — 선택 유도 버튼 */
          <TouchableOpacity
            style={styles.classEmptyCard}
            onPress={() => router.push('/(app)/(teacher)/class-select')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color="#5B50E8" />
            <Text style={styles.classEmptyText}>담당반을 선택해주세요</Text>
            <Ionicons name="chevron-forward" size={16} color="#5B50E8" />
          </TouchableOpacity>
        ) : (
          assignedClasses.map((cls) => (
            <View key={cls.id} style={styles.classCard}>
              {/* 반 정보 + 학생 보기 */}
              <TouchableOpacity
                style={styles.classCardMain}
                onPress={() => router.push(`/(app)/(teacher)/students?classId=${cls.id}`)}
                activeOpacity={0.75}
              >
                <View style={styles.classCardLeft}>
                  <View style={styles.classIconBox}>
                    <Ionicons name="business-outline" size={18} color="#5B50E8" />
                  </View>
                  <View>
                    <Text style={styles.className}>{cls.name}</Text>
                    <Text style={styles.classStudentCount}>
                      학생 {studentCounts[cls.id] ?? 0}명
                    </Text>
                  </View>
                </View>
                <View style={styles.classCardRight}>
                  <Text style={styles.classActionLabel}>학생 보기</Text>
                  <Ionicons name="chevron-forward" size={16} color="#5B50E8" />
                </View>
              </TouchableOpacity>
              {/* 학생 초대코드 복사 */}
              {cls.invite_code && (
                <TouchableOpacity
                  style={styles.codeRow}
                  onPress={async () => {
                    await Clipboard.setStringAsync(cls.invite_code!);
                    Alert.alert('복사 완료', `학생 초대코드가 복사됐어요.\n${cls.invite_code}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.codeLabel}>학생 초대코드</Text>
                  <View style={styles.codeChip}>
                    <Text style={styles.codeChipText}>{cls.invite_code}</Text>
                    <Ionicons name="copy-outline" size={12} color="#5B50E8" />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {/* ── 설정 메뉴 카드 ── */}
      <View style={styles.menuCard}>
        {/* 푸시 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="notifications-outline" size={20} color="#64748B" style={styles.menuIcon} />
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
            <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <Text style={styles.menuLabel}>비밀번호 변경</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* 소셜 계정 연결 */}
        <TouchableOpacity style={styles.menuItem} onPress={handleSocialConnect} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Ionicons name="phone-portrait-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <Text style={styles.menuLabel}>소셜 계정 연결</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* 문의하기 */}
        <TouchableOpacity style={styles.menuItem} onPress={handleInquiry} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Ionicons name="help-circle-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <Text style={styles.menuLabel}>문의하기</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        {/* 개인정보처리방침 */}
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(auth)/privacy' as never)} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Ionicons name="document-text-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <Text style={styles.menuLabel}>{strings.account.privacyPolicy}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>
      </View>

      {/* ── 로그아웃 버튼 ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      {/* ── 탈퇴하기 버튼 ── */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDeleteAccount}
        disabled={isDeleting}
        activeOpacity={0.7}
      >
        {isDeleting
          ? <ActivityIndicator size="small" color="#EF4444" />
          : <Text style={styles.deleteText}>{strings.account.deleteAccount}</Text>
        }
      </TouchableOpacity>

      {/* 하단 여백 */}
      <View style={{ height: 32 }} />
    </ScrollView>

    {/* 비밀번호 변경 모달 */}
    <PasswordChangeModal
      visible={isPwModalVisible}
      onClose={() => setIsPwModalVisible(false)}
    />
    </>
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
  classSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  classSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#EEEDF9',
    borderRadius: 20,
  },
  classEditText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B50E8',
  },
  classEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#5B50E8',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
  },
  classEmptyText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#5B50E8',
  },
  classCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  classCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  codeLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EEEDF9', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  codeChipText: { fontSize: 13, fontWeight: '800', color: '#5B50E8', letterSpacing: 1.5 },
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
  // 탈퇴하기 버튼 (텍스트 스타일, 버튼 구분)
  deleteBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 14,
    color: '#94A3B8',
    textDecorationLine: 'underline',
  },
});
