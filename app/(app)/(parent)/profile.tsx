/**
 * app/(app)/(parent)/profile.tsx — 학부모 내정보 화면
 *
 * 주황 그라데이션 프로필 + 연동된 자녀 관리 + 알림 설정 + 문의하기 + 로그아웃
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { getDoc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { initFCM } from '../../../lib/fcm';
import { useAuthStore } from '../../../store/useAuthStore';
import { strings } from '../../../constants/strings';
import { validateLinkCode } from '../../../lib/auth';
import type { User, Class } from '../../../types';

// AsyncStorage 키 — 푸시 알림 ON/OFF 설정 저장
const NOTIF_HOMEWORK_KEY = 'parent_notif_homework';
const NOTIF_NOTICE_KEY = 'parent_notif_notice';

// 자녀 표시용 데이터 타입
interface ChildInfo {
  uid: string;
  name: string;
  className: string; // 반 이름 (예: "초등 A반")
}

export default function ParentProfileScreen() {
  const { top } = useSafeAreaInsets();
  const { user, academy, setUser, clearUser } = useAuthStore();

  // ── 자녀 목록 ──────────────────────────────────────────
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);

  // ── 자녀 추가 연동 모달 ────────────────────────────────
  const [addChildModalVisible, setAddChildModalVisible] = useState(false);
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // ── 알림 설정 ──────────────────────────────────────────
  const [homeworkNotif, setHomeworkNotif] = useState(true);
  const [noticeNotif, setNoticeNotif] = useState(true);

  // ── 알림 설정 불러오기 ─────────────────────────────────
  useEffect(() => {
    const loadNotifSettings = async () => {
      try {
        const hw = await AsyncStorage.getItem(NOTIF_HOMEWORK_KEY);
        const nt = await AsyncStorage.getItem(NOTIF_NOTICE_KEY);
        // 저장된 값이 없으면 기본 ON
        if (hw !== null) setHomeworkNotif(hw === 'true');
        if (nt !== null) setNoticeNotif(nt === 'true');
      } catch (err) {
        console.error('[ParentProfile] 알림 설정 불러오기 실패:', err);
      }
    };
    loadNotifSettings();
  }, []);

  // 알림 토글 처리
  const handleHomeworkNotifToggle = useCallback(async (value: boolean) => {
    setHomeworkNotif(value);
    await AsyncStorage.setItem(NOTIF_HOMEWORK_KEY, String(value));

    if (!user?.uid) return;
    const bothOff = value === false && !noticeNotif;
    if (bothOff) {
      // 두 토글 모두 OFF: FCM 토큰 null → Cloud Functions가 발송 건너뜀
      await updateDoc(Collections.user(user.uid), { fcm_token: null }).catch((e) =>
        console.warn('[ParentProfile] fcm_token 제거 실패:', e)
      );
    } else if (value === true && !homeworkNotif) {
      // OFF에서 ON으로 전환: 토큰 재발급 + Firestore 저장
      await initFCM(user.uid).catch((e) =>
        console.warn('[ParentProfile] FCM 재초기화 실패:', e)
      );
    }
  }, [user?.uid, noticeNotif, homeworkNotif]);

  const handleNoticeNotifToggle = useCallback(async (value: boolean) => {
    setNoticeNotif(value);
    await AsyncStorage.setItem(NOTIF_NOTICE_KEY, String(value));

    if (!user?.uid) return;
    const bothOff = value === false && !homeworkNotif;
    if (bothOff) {
      // 두 토글 모두 OFF: FCM 토큰 null
      await updateDoc(Collections.user(user.uid), { fcm_token: null }).catch((e) =>
        console.warn('[ParentProfile] fcm_token 제거 실패:', e)
      );
    } else if (value === true && !noticeNotif) {
      // OFF에서 ON으로 전환: 토큰 재발급
      await initFCM(user.uid).catch((e) =>
        console.warn('[ParentProfile] FCM 재초기화 실패:', e)
      );
    }
  }, [user?.uid, homeworkNotif, noticeNotif]);

  // ── 자녀 데이터 조회 ────────────────────────────────────
  useEffect(() => {
    const childUids = user?.children ?? [];
    if (childUids.length === 0) {
      setIsLoadingChildren(false);
      return;
    }

    const fetchChildren = async () => {
      try {
        const results = await Promise.all(
          childUids.map(async (childUid) => {
            // 자녀 사용자 문서 조회
            const childSnap = await getDoc(Collections.user(childUid));
            if (!childSnap.exists()) return null;
            const childData = childSnap.data() as User;

            // 자녀가 속한 반 이름 조회
            let className = strings.profile.noClass;
            if (childData.class_id) {
              const classSnap = await getDoc(Collections.class(childData.class_id));
              if (classSnap.exists()) {
                className = (classSnap.data() as Class).name;
              }
            }

            return { uid: childUid, name: childData.name, className } as ChildInfo;
          })
        );
        setChildren(results.filter((c): c is ChildInfo => c !== null));
      } catch (err) {
        console.error('[ParentProfile] 자녀 데이터 조회 실패:', err);
      } finally {
        setIsLoadingChildren(false);
      }
    };

    fetchChildren();
  }, [user?.children?.join(',')]);

  // ── 자녀 연동 해제 ──────────────────────────────────────
  const handleUnlink = useCallback(
    (child: ChildInfo) => {
      Alert.alert(
        strings.profile.unlinkConfirmTitle,
        strings.profile.unlinkConfirmDesc(child.name),
        [
          { text: strings.common.cancel, style: 'cancel' },
          {
            text: strings.profile.unlink,
            style: 'destructive',
            onPress: async () => {
              if (!user) return;
              try {
                // Firestore에서 parent.children 배열에서 해당 uid 제거
                await updateDoc(Collections.user(user.uid), {
                  children: arrayRemove(child.uid),
                });
                // 로컬 상태 즉시 반영
                setChildren((prev) => prev.filter((c) => c.uid !== child.uid));
                const updatedChildren = (user.children ?? []).filter((uid) => uid !== child.uid);
                setUser({ ...user, children: updatedChildren });
              } catch (err) {
                console.error('[ParentProfile] 연동 해제 실패:', err);
                Alert.alert(strings.common.error, strings.profile.unlinkFailed);
              }
            },
          },
        ]
      );
    },
    [user, setUser]
  );

  // ── 자녀 추가 연동 모달 열기 ───────────────────────────
  const handleAddChild = useCallback(() => {
    setLinkCodeInput('');
    setLinkError(null);
    setAddChildModalVisible(true);
  }, []);

  // ── 연동코드 확인 및 자녀 추가 ─────────────────────────
  const handleConfirmAddChild = useCallback(async () => {
    if (!user || !linkCodeInput.trim()) return;

    setIsLinking(true);
    setLinkError(null);

    try {
      const code = linkCodeInput.trim().toUpperCase();

      // 학생 uid 조회
      const studentUid = await validateLinkCode(code);
      if (!studentUid) {
        setLinkError(strings.errors.invalidCode);
        return;
      }

      // 이미 연동된 자녀인지 확인
      if (user.children?.includes(studentUid)) {
        setLinkError('이미 연동된 자녀예요.');
        return;
      }

      // 학생 문서 조회 (학원 ID + guardian_phone 기록용)
      const studentSnap = await getDoc(Collections.user(studentUid));
      if (!studentSnap.exists()) {
        setLinkError(strings.errors.invalidCode);
        return;
      }
      const studentData = studentSnap.data() as User;

      // 학부모 children 배열에 자녀 uid 추가
      await updateDoc(Collections.user(user.uid), {
        children: arrayUnion(studentUid),
        // 첫 자녀 연동 시 academy_id가 없을 경우 자동 설정
        ...(user.academy_id ? {} : { academy_id: studentData.academy_id }),
      });

      // guardian_phone 기록 — 법정 출석부 보호자 연락처용 (논블로킹)
      if (user.phone_number) {
        updateDoc(Collections.user(studentUid), {
          guardian_phone: user.phone_number,
        }).catch((e) => {
          console.warn('[ParentProfile] guardian_phone 기록 실패:', e);
        });
      }

      // 로컬 상태 업데이트
      const updatedChildren = [...(user.children ?? []), studentUid];
      setUser({ ...user, children: updatedChildren });

      // 자녀 목록 UI 갱신 (반 이름 포함)
      let className = strings.profile.noClass;
      if (studentData.class_id) {
        const classSnap = await getDoc(Collections.class(studentData.class_id));
        if (classSnap.exists()) className = (classSnap.data() as Class).name;
      }
      setChildren((prev) => [
        ...prev,
        { uid: studentUid, name: studentData.name, className },
      ]);

      setAddChildModalVisible(false);
    } catch (e) {
      console.error('[ParentProfile] 자녀 추가 연동 실패:', e);
      setLinkError(strings.common.error);
    } finally {
      setIsLinking(false);
    }
  }, [user, linkCodeInput, setUser]);

  // ── 문의하기 ───────────────────────────────────────────
  const handleInquiry = useCallback(() => {
    Alert.alert(
      strings.profile.inquiry,
      `이메일로 문의해 주세요.\n${strings.profile.inquiryEmail}`,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: '이메일 보내기',
          onPress: () => Linking.openURL(`mailto:${strings.profile.inquiryEmail}`),
        },
      ]
    );
  }, []);

  // ── 로그아웃 ───────────────────────────────────────────
  const handleLogout = useCallback(() => {
    Alert.alert(strings.auth.logout, '정말 로그아웃 하시겠어요?', [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.auth.logout,
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          clearUser();
          // app/_layout.tsx의 onAuthStateChanged가 /(auth)로 자동 이동
        },
      },
    ]);
  }, [clearUser]);

  const childrenCount = children.length;

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>

      {/* ── 자녀 추가 연동 모달 ── */}
      <Modal
        visible={addChildModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddChildModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBox}>
            {/* 헤더 */}
            <Text style={styles.modalTitle}>자녀 추가 연동</Text>
            <Text style={styles.modalDesc}>
              {'자녀 앱 → 내정보에서\n6자리 연동코드를 확인하세요.'}
            </Text>

            {/* 코드 입력 */}
            <TextInput
              style={[styles.codeInput, linkError ? styles.codeInputError : null]}
              value={linkCodeInput}
              onChangeText={(t) => {
                setLinkCodeInput(t.toUpperCase());
                setLinkError(null);
              }}
              placeholder="예: A1B2C3"
              placeholderTextColor="#94A3B8"
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />

            {/* 에러 메시지 */}
            {linkError && (
              <Text style={styles.errorText}>{linkError}</Text>
            )}

            {/* 버튼 */}
            <TouchableOpacity
              style={[
                styles.modalConfirmBtn,
                (!linkCodeInput.trim() || isLinking) && styles.modalConfirmBtnDisabled,
              ]}
              onPress={handleConfirmAddChild}
              disabled={!linkCodeInput.trim() || isLinking}
              activeOpacity={0.8}
            >
              {isLinking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>연동하기</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setAddChildModalVisible(false)}
              disabled={isLinking}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>{strings.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 주황 그라데이션 프로필 영역 ── */}
      <LinearGradient
        colors={['#F59E0B', '#D97706']}
        style={[styles.gradientHeader, { paddingTop: top + 12 }]}
      >
        {/* 타이틀 */}
        <Text style={styles.headerTitle}>{strings.profile.title}</Text>

        {/* 아바타 원형 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>👨‍👦</Text>
          </View>
        </View>

        {/* 이름 + 역할/자녀수 */}
        <Text style={styles.profileName}>{user?.name ?? '부모님'}</Text>
        <Text style={styles.profileSubtitle}>
          {strings.profile.childrenCount(childrenCount)}
        </Text>
      </LinearGradient>

      {/* ── 연동된 자녀 카드 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.profile.linkedChildren}</Text>
        <View style={styles.card}>
          {isLoadingChildren ? (
            <ActivityIndicator color="#F59E0B" style={{ paddingVertical: 20 }} />
          ) : children.length === 0 ? (
            <Text style={styles.emptyText}>{strings.profile.noChildren}</Text>
          ) : (
            children.map((child, idx) => (
              <View key={child.uid}>
                <View style={styles.childRow}>
                  {/* 자녀 아바타 */}
                  <View style={styles.childAvatar}>
                    <Text style={styles.childAvatarEmoji}>👦</Text>
                  </View>

                  {/* 자녀 이름 + 반·학원 정보 */}
                  <View style={styles.childInfo}>
                    <Text style={styles.childName}>{child.name}</Text>
                    <Text style={styles.childDetail}>
                      {child.className} · {academy?.name ?? ''}
                    </Text>
                  </View>

                  {/* 연동해제 버튼 */}
                  <TouchableOpacity
                    style={styles.unlinkBtn}
                    onPress={() => handleUnlink(child)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.unlinkText}>{strings.profile.unlink}</Text>
                  </TouchableOpacity>
                </View>

                {/* 자녀 사이 구분선 (마지막 제외) */}
                {idx < children.length - 1 && <View style={styles.childDivider} />}
              </View>
            ))
          )}

          {/* 자녀 추가 연동 버튼 */}
          <TouchableOpacity
            style={styles.addChildBtn}
            onPress={handleAddChild}
            activeOpacity={0.7}
          >
            <Text style={styles.addChildText}>{strings.profile.addChild}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 알림 설정 + 문의하기 카드 ── */}
      <View style={styles.menuCard}>
        {/* 숙제 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuLabel}>{strings.profile.homeworkNotif}</Text>
          </View>
          <Switch
            value={homeworkNotif}
            onValueChange={handleHomeworkNotifToggle}
            trackColor={{ false: '#E2E8F0', true: '#F59E0B' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuDivider} />

        {/* 공지 알림 토글 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>📢</Text>
            <Text style={styles.menuLabel}>{strings.profile.noticeNotif}</Text>
          </View>
          <Switch
            value={noticeNotif}
            onValueChange={handleNoticeNotifToggle}
            trackColor={{ false: '#E2E8F0', true: '#F59E0B' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.menuDivider} />

        {/* 문의하기 */}
        <TouchableOpacity style={styles.menuItem} onPress={handleInquiry} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={styles.menuLabel}>{strings.profile.inquiry}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
        </TouchableOpacity>
      </View>

      {/* ── 로그아웃 버튼 ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>{strings.auth.logout}</Text>
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

  // ── 그라데이션 헤더 ──────────────────────────────────
  gradientHeader: {
    paddingBottom: 32,
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
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  profileSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },

  // ── 섹션 ──────────────────────────────────────────────
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },

  // ── 자녀 카드 ──────────────────────────────────────────
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // 자녀 행
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  childAvatarEmoji: {
    fontSize: 22,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  childDetail: {
    fontSize: 13,
    color: '#64748B',
  },
  unlinkBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unlinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  childDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
  },

  // 자녀 추가 연동 버튼
  addChildBtn: {
    margin: 12,
    height: 44,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
  },
  addChildText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
  },

  // ── 설정 메뉴 카드 ──────────────────────────────────────
  menuCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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

  // ── 자녀 추가 연동 모달 ────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  codeInput: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '800',
    color: '#3730A3',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
  },
  codeInputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalConfirmBtn: {
    height: 52,
    backgroundColor: '#F59E0B',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  modalConfirmBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  modalCancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '600',
  },

  // ── 로그아웃 버튼 ──────────────────────────────────────
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
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
});
