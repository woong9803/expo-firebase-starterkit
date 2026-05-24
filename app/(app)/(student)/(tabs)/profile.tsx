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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Collections } from '../../../../lib/firestore';
import { safeSignOut } from '../../../../lib/auth';
import { openKakaoSupport } from '../../../../lib/support';
import { showDeleteAccountDialog } from '../../../../lib/deleteAccount';
import { initFCM } from '../../../../lib/fcm';
import { useAuthStore } from '../../../../store/useAuthStore';
import { Class, Homework, AttendanceRecord } from '../../../../types';
import PasswordChangeModal from '../../../../components/PasswordChangeModal';
import { strings } from '../../../../constants/strings';

// AsyncStorage 키 — 알림 ON/OFF 설정 저장
const NOTIF_HOMEWORK_KEY = 'student_notif_homework';
const NOTIF_FEEDBACK_KEY = 'student_notif_feedback';
const NOTIF_NOTICE_KEY   = 'student_notif_notice';

// 통계 데이터 타입
interface Stats {
  submitCount: number;    // 제출 완료 수
  streak: number;         // 스트릭 일수
  attendanceRate: number; // 이번 달 출석률 (%)
}

export default function StudentProfileScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user, academy, clearUser } = useAuthStore();

  // ── 상태 ──────────────────────────────────────
  const [className, setClassName] = useState<string>('');
  const [stats, setStats] = useState<Stats>({ submitCount: 0, streak: user?.streak ?? 0, attendanceRate: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [homeworkNotif, setHomeworkNotif] = useState(true);
  const [feedbackNotif, setFeedbackNotif] = useState(true);
  const [noticeNotif, setNoticeNotif]     = useState(true);
  const [isPwModalVisible, setIsPwModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── 알림 설정 불러오기 ─────────────────────────
  useEffect(() => {
    const load = async () => {
      const hw = await AsyncStorage.getItem(NOTIF_HOMEWORK_KEY);
      const fb = await AsyncStorage.getItem(NOTIF_FEEDBACK_KEY);
      const nt = await AsyncStorage.getItem(NOTIF_NOTICE_KEY);
      if (hw !== null) setHomeworkNotif(hw === 'true');
      if (fb !== null) setFeedbackNotif(fb === 'true');
      if (nt !== null) setNoticeNotif(nt === 'true');
    };
    load();
  }, []);

  // 알림 토글 공통 처리
  const handleNotifToggle = useCallback(async (
    key: 'homework' | 'feedback' | 'notice',
    value: boolean,
    storageKey: string,
  ) => {
    if (key === 'homework') setHomeworkNotif(value);
    else if (key === 'feedback') setFeedbackNotif(value);
    else setNoticeNotif(value);

    await AsyncStorage.setItem(storageKey, String(value));
    if (!user?.uid) return;

    // Firestore notif_prefs 업데이트
    await Collections.user(user.uid).update({
      [`notif_prefs.${key}`]: value,
    }).catch((e: unknown) => console.warn('[StudentProfile] notif_prefs 업데이트 실패:', e));

    // 현재 다른 토글의 값 계산
    // 토글 적용 후 상태로 전체 ON/OFF 판단
    const hw = key === 'homework' ? value : homeworkNotif;
    const fb = key === 'feedback' ? value : feedbackNotif;
    const nt = key === 'notice'   ? value : noticeNotif;
    const allOff = !hw && !fb && !nt;

    // 토글 적용 전 상태 (이전에 모두 OFF였는지 확인용)
    const prevHw = key === 'homework' ? !value : homeworkNotif;
    const prevFb = key === 'feedback' ? !value : feedbackNotif;
    const prevNt = key === 'notice'   ? !value : noticeNotif;
    const wasAllOff = !prevHw && !prevFb && !prevNt;

    if (allOff) {
      // 모든 알림 OFF → FCM 토큰 제거
      await Collections.user(user.uid).update({ fcm_token: null }).catch((e: unknown) =>
        console.warn('[StudentProfile] fcm_token 제거 실패:', e)
      );
    } else if (value && wasAllOff) {
      // 모두 OFF 상태에서 하나가 ON으로 전환 → FCM 토큰 재발급
      await initFCM(user.uid).catch((e: unknown) =>
        console.warn('[StudentProfile] FCM 재초기화 실패:', e)
      );
    }
  }, [user?.uid, homeworkNotif, feedbackNotif, noticeNotif]);

  // ── 반 이름 + 통계 데이터 로드 ─────────────────
  // useFocusEffect: 탭 진입할 때마다 재계산 → 선생님이 출결 입력하면 즉시 반영
  useFocusEffect(useCallback(() => {
    if (!user?.uid || !user?.class_id) {
      setIsStatsLoading(false);
      return;
    }

    setIsStatsLoading(true);
    (async () => {
      try {
        // 1) 소속 반 이름 조회
        const classSnap = await Collections.class(user.class_id!).get();
        if (classSnap.exists()) {
          setClassName((classSnap.data() as Class).name);
        }

        // 2) 제출 완료 수 계산
        //    학생 반의 숙제 목록 조회 후 내 제출물 존재 여부 확인 (최근 30개)
        const hwSnap = await Collections.homeworks()
          .where('class_id', '==', user.class_id)
          .get();
        const hwList = hwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
        const recentHws = hwList.slice(0, 30);

        const subResults = await Promise.all(
          recentHws.map(async (hw) => {
            const subRef = Collections.submission(hw.id, user.uid);
            const subSnap = await subRef.get();
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
            const ref = firestore()
              .collection('attendances')
              .doc(`${user.class_id}_${dateStr}`)
              .collection('records')
              .doc(user.uid);
            const snap = await ref.get();
            if (snap.exists()) {
              const record = snap.data() as AttendanceRecord;
              totalCnt++;
              if (record.status === 'present') presentCnt++;
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
  }, [user?.uid, user?.class_id, user?.streak]));

  // ── 연동코드 공유 ─────────────────────────────
  const handleShareLinkCode = useCallback(async () => {
    const code = user?.link_code;
    if (!code) {
      Alert.alert('연동코드 없음', '연동코드가 아직 생성되지 않았어요.');
      return;
    }
    try {
      await Share.share({
        message: `웅깅 학부모 연동코드: ${code}\n앱에서 이 코드를 입력하면 자녀와 연결됩니다.`,
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
          await safeSignOut();
          clearUser();
        },
      },
    ]);
  };

  // ── 비밀번호 변경 모달 열기 ──────────────────
  const handlePasswordChange = () => setIsPwModalVisible(true);

  // ── 문의하기 — 카카오톡 상담 채널로 연결 ──────
  const handleInquiry = () => {
    openKakaoSupport();
  };

  // ── 탈퇴하기 (PIPA 삭제권 — 30일 후 / 즉시 완전 삭제 선택) ──
  const handleDeleteAccount = () => {
    showDeleteAccountDialog({
      onLoadingChange: setIsDeleting,
      onSuccess: clearUser,
    });
  };

  const linkCode = user?.link_code ?? '';

  return (
    <>
    <ScrollView style={styles.container} bounces={false}>
      {/* ── 초록 그라데이션 프로필 영역 ── */}
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={[styles.gradientHeader, { paddingTop: top + 12 }]}
      >
        {/* 상단 타이틀 */}
        <Text style={styles.headerTitle}>내 정보</Text>

        {/* 아바타 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{(user?.name ?? '학생').slice(0, 1)}</Text>
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
              <Text style={styles.chipText}>{stats.streak}일 연속제출</Text>
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
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {stats.submitCount}
              </Text>
              <Text style={styles.statLabel}>제출 완료</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 스트릭 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {stats.streak}
              </Text>
              <Text style={styles.statLabel}>연속제출</Text>
            </View>

            <View style={styles.statDivider} />

            {/* 출석률 */}
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
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
          {/* 버튼 묶음 */}
          <View style={styles.codeBtnGroup}>
            {/* 클립보드 복사 */}
            <TouchableOpacity
              style={[styles.copyBtn, !linkCode && styles.copyBtnDisabled]}
              onPress={async () => {
                if (!linkCode) return;
                await Clipboard.setStringAsync(linkCode.toUpperCase());
                Alert.alert('복사 완료', `연동코드가 복사됐어요.\n${linkCode.toUpperCase()}`);
              }}
              activeOpacity={0.8}
              disabled={!linkCode}
            >
              <Ionicons name="copy-outline" size={14} color="#065F46" />
              <Text style={styles.copyBtnText}>복사</Text>
            </TouchableOpacity>
            {/* 공유 */}
            <TouchableOpacity
              style={[styles.copyBtn, !linkCode && styles.copyBtnDisabled]}
              onPress={handleShareLinkCode}
              activeOpacity={0.8}
              disabled={!linkCode}
            >
              <Ionicons name="share-outline" size={14} color="#065F46" />
              <Text style={styles.copyBtnText}>공유</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── 설정 메뉴 카드 ── */}
      <View style={styles.menuCard}>
        {/* 숙제 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="book-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <View>
              <Text style={styles.menuLabel}>숙제 알림</Text>
              <Text style={styles.menuSub}>마감·미제출 알림</Text>
            </View>
          </View>
          <Switch
            value={homeworkNotif}
            onValueChange={(v) => handleNotifToggle('homework', v, NOTIF_HOMEWORK_KEY)}
            trackColor={{ false: '#E2E8F0', true: '#10B981' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuDivider} />

        {/* 피드백 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <View>
              <Text style={styles.menuLabel}>피드백 알림</Text>
              <Text style={styles.menuSub}>선생님 검사 결과 알림</Text>
            </View>
          </View>
          <Switch
            value={feedbackNotif}
            onValueChange={(v) => handleNotifToggle('feedback', v, NOTIF_FEEDBACK_KEY)}
            trackColor={{ false: '#E2E8F0', true: '#10B981' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuDivider} />

        {/* 공지 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="megaphone-outline" size={20} color="#64748B" style={styles.menuIcon} />
            <View>
              <Text style={styles.menuLabel}>공지 알림</Text>
              <Text style={styles.menuSub}>새 공지사항 알림</Text>
            </View>
          </View>
          <Switch
            value={noticeNotif}
            onValueChange={(v) => handleNotifToggle('notice', v, NOTIF_NOTICE_KEY)}
            trackColor={{ false: '#E2E8F0', true: '#10B981' }}
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
  codeBtnGroup: { flexDirection: 'row', gap: 6 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  copyBtnDisabled: {
    backgroundColor: '#A7F3D0',
  },
  copyBtnText: {
    fontSize: 13,
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
    width: 28,
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  menuSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
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
