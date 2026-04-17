import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Share,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import * as Clipboard from 'expo-clipboard';
import {
  query, where, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, getCountFromServer,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { auth } from '../../../../lib/firebase';
import PasswordChangeModal from '../../../../components/PasswordChangeModal';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { User, Class } from '../../../../types';

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

// 6자리 랜덤 영숫자 초대코드 생성
function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Timestamp → MM/DD 형식 날짜 문자열
function toMonthDay(ts: any): string {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 플랜 표시 이름
function planLabel(plan: string): string {
  if (plan === 'pro') return 'Pro 플랜';
  if (plan === 'trial') return 'Trial 플랜';
  return 'Free 플랜';
}

// ─────────────────────────────────────────────────────────────
// AdminSettingsScreen
// ─────────────────────────────────────────────────────────────

export default function AdminSettingsScreen() {
  const { top } = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user, academy, clearUser } = useAuthStore();

  // ── 데이터 상태 ──
  const [classes, setClasses]               = useState<Class[]>([]);
  const [teachers, setTeachers]             = useState<User[]>([]);
  // { classId: studentCount }
  const [studentCounts, setStudentCounts]   = useState<Record<string, number>>({});
  // { classId: teacherName } — 선생님 역매핑
  const [classTeacherMap, setClassTeacherMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading]           = useState(true);
  const [isPwModalVisible, setIsPwModalVisible] = useState(false);

  // ── 새 반 만들기 모달 ──
  const [isNewClassModalVisible, setIsNewClassModalVisible] = useState(false);
  const [newClassName, setNewClassName]     = useState('');
  const [newClassSubject, setNewClassSubject] = useState(''); // 교습과목
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  // ── 반 설정 모달 (이름 편집 / 삭제) ──
  const [editClass, setEditClass]           = useState<Class | null>(null);
  const [isClassSettingVisible, setIsClassSettingVisible] = useState(false);
  const [editClassName, setEditClassName]   = useState('');
  const [editClassSubject, setEditClassSubject] = useState(''); // 교습과목
  const [isSavingClass, setIsSavingClass]   = useState(false);
  const [isReissuingCode, setIsReissuingCode] = useState(false); // 초대코드 재발급 로딩

  // ── 1. 반 목록 실시간 구독 ──
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
            const s = await getCountFromServer(
              query(
                Collections.users(),
                where('academy_id', '==', user.academy_id),
                where('class_id', '==', cls.id),
                where('role', '==', 'student'),
                where('is_active', '==', true),
              )
            );
            return { classId: cls.id, count: s.data().count };
          })
        );
        const cMap: Record<string, number> = {};
        countResults.forEach(({ classId, count }) => { cMap[classId] = count; });
        setStudentCounts(cMap);
        setIsLoading(false);
      },
      (e) => { console.error('[AdminSettings] 반 구독 실패:', e); setIsLoading(false); }
    );

    return () => unsub();
  }, [user?.academy_id]);

  // ── 2. 선생님 목록 실시간 구독 — 신규 가입 즉시 반영 ──
  useEffect(() => {
    if (!user?.academy_id) return;

    const unsub = onSnapshot(
      query(
        Collections.users(),
        where('academy_id', '==', user.academy_id),
        where('role', '==', 'teacher'),
        where('is_active', '==', true),
      ),
      (snap) => {
        const teacherList = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
        setTeachers(teacherList);

        // classId → 첫 번째 담당 선생님 이름 역매핑
        const tMap: Record<string, string> = {};
        [...teacherList]
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
          .forEach(t => {
            (t.assigned_class_ids ?? []).forEach(cid => {
              if (!tMap[cid]) tMap[cid] = t.name;
            });
          });
        setClassTeacherMap(tMap);
      },
      (e) => console.error('[AdminSettings] 선생님 구독 실패:', e)
    );

    return () => unsub();
  }, [user?.academy_id]);

  // ── 새 반 만들기 ──
  const handleCreateClass = async () => {
    const trimmed = newClassName.trim();
    if (!trimmed) {
      Alert.alert('알림', '반 이름을 입력해주세요.');
      return;
    }
    if (!user?.academy_id) return;

    setIsCreatingClass(true);
    try {
      const newCode = generateCode();
      const subjectTrimmed = newClassSubject.trim();
      const docRef = await addDoc(Collections.classes(), {
        name: trimmed,
        academy_id: user.academy_id,
        invite_code: newCode,
        // subject가 비어 있으면 저장하지 않음 (선택 필드)
        ...(subjectTrimmed ? { subject: subjectTrimmed } : {}),
      });
      const newClass: Class = {
        id: docRef.id,
        name: trimmed,
        academy_id: user.academy_id,
        invite_code: newCode,
        ...(subjectTrimmed ? { subject: subjectTrimmed } : {}),
      };
      setClasses(prev => [...prev, newClass]);
      setStudentCounts(prev => ({ ...prev, [docRef.id]: 0 }));
      setIsNewClassModalVisible(false);
      setNewClassName('');
      setNewClassSubject('');
    } catch (e) {
      console.error('[AdminSettings] 반 생성 실패:', e);
      Alert.alert('오류', '반 생성에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsCreatingClass(false);
    }
  };

  // ── 반 이름 수정 ──
  const handleSaveClassName = async () => {
    if (!editClass) return;
    const trimmed = editClassName.trim();
    if (!trimmed) { Alert.alert('알림', '반 이름을 입력해주세요.'); return; }

    setIsSavingClass(true);
    try {
      const subjectTrimmed = editClassSubject.trim();
      // subject는 선택 필드 — 빈 문자열이면 null로 초기화
      await updateDoc(Collections.class(editClass.id), {
        name: trimmed,
        subject: subjectTrimmed || null,
      });
      setClasses(prev => prev.map(c =>
        c.id === editClass.id
          ? { ...c, name: trimmed, subject: subjectTrimmed || undefined }
          : c
      ));
      setIsClassSettingVisible(false);
      setEditClass(null);
    } catch (e) {
      Alert.alert('오류', '반 정보 수정에 실패했어요.');
    } finally {
      setIsSavingClass(false);
    }
  };

  // ── 반 삭제 ──
  const handleDeleteClass = () => {
    if (!editClass) return;
    Alert.alert(
      '반 삭제',
      `"${editClass.name}" 반을 삭제할까요?\n삭제하면 복구할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(Collections.class(editClass.id));
              setClasses(prev => prev.filter(c => c.id !== editClass.id));
              setIsClassSettingVisible(false);
              setEditClass(null);
            } catch (e) {
              Alert.alert('오류', '반 삭제에 실패했어요.');
            }
          },
        },
      ]
    );
  };

  // ── 선생님 삭제 (비활성화) ──
  const handleDeleteTeacher = (teacher: User) => {
    Alert.alert(
      '선생님 삭제',
      `${teacher.name} 선생님을 삭제할까요?\n삭제하면 앱에 접속할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(Collections.user(teacher.uid), { is_active: false });
              setTeachers(prev => prev.filter(t => t.uid !== teacher.uid));
            } catch (e) {
              Alert.alert('오류', '삭제에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  };

  // ── 담당 선생님 지정/해제 토글 ──
  const handleToggleTeacher = async (teacher: User) => {
    if (!editClass) return;
    const isAssigned = (teacher.assigned_class_ids ?? []).includes(editClass.id);

    try {
      if (isAssigned) {
        // 이미 담당 중 → 제거
        await updateDoc(Collections.user(teacher.uid), {
          assigned_class_ids: arrayRemove(editClass.id),
        });
      } else {
        // 미담당 → 추가 (중복 담당 허용)
        await updateDoc(Collections.user(teacher.uid), {
          assigned_class_ids: arrayUnion(editClass.id),
        });
      }

      // 로컬 teachers 상태 갱신
      const updatedTeachers = teachers.map(t => {
        if (t.uid !== teacher.uid) return t;
        const newIds = isAssigned
          ? (t.assigned_class_ids ?? []).filter(id => id !== editClass.id)
          : [...(t.assigned_class_ids ?? []), editClass.id];
        return { ...t, assigned_class_ids: newIds };
      });
      setTeachers(updatedTeachers);

      // classTeacherMap 재계산 (classId → 첫 번째 담당 선생님 이름)
      // 이름 오름차순 정렬 후 매핑 — 2명 이상 배정 시 표시명이 토글마다 바뀌지 않도록 고정
      const tMap: Record<string, string> = {};
      [...updatedTeachers]
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .forEach(t => {
          (t.assigned_class_ids ?? []).forEach(cid => {
            if (!tMap[cid]) tMap[cid] = t.name;
          });
        });
      setClassTeacherMap(tMap);
    } catch (e) {
      Alert.alert('오류', '선생님 지정에 실패했어요. 다시 시도해주세요.');
    }
  };

  // ── 반 초대코드 재발급 ──
  const handleReissueCode = () => {
    if (!editClass) return;
    Alert.alert(
      '코드 재발급',
      '기존 코드로는 더 이상 가입할 수 없어요. 재발급할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '재발급',
          onPress: async () => {
            if (isReissuingCode) return; // 중복 실행 방지
            setIsReissuingCode(true);
            try {
              const newCode = generateCode();
              await updateDoc(Collections.class(editClass.id), { invite_code: newCode });
              // 반 목록 상태 갱신
              setClasses(prev => prev.map(c =>
                c.id === editClass.id ? { ...c, invite_code: newCode } : c
              ));
              // 모달 내 표시 코드도 즉시 갱신
              setEditClass(prev => prev ? { ...prev, invite_code: newCode } : null);
            } catch (e) {
              Alert.alert('오류', '코드 재발급에 실패했어요. 다시 시도해주세요.');
            } finally {
              setIsReissuingCode(false);
            }
          },
        },
      ]
    );
  };

  // ── 코드 클립보드 복사 ──
  const handleCopyCode = async (code: string, label: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('복사 완료', `${label} 코드가 복사됐어요.\n${code}`);
  };

  // ── 초대코드 공유 ──
  const handleShareCode = async (code: string, label: string) => {
    try {
      await Share.share({ message: `${label} 초대 코드: ${code}` });
    } catch {
      Alert.alert('초대 코드', code);
    }
  };

  // ── 로그아웃 ──
  const handleLogout = async () => {
    Alert.alert('로그아웃', '정말 로그아웃하실 건가요?', [
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

  // 선생님별 담당반 수
  const getAssignedCount = (teacher: User) =>
    (teacher.assigned_class_ids ?? []).filter(cid => classes.some(c => c.id === cid)).length;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  const approvedDate = academy?.approved_at
    ? toMonthDay(academy.approved_at)
    : toMonthDay(academy?.created_at);

  return (
    <>
    <ScrollView
      style={[styles.container, { paddingTop: top }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 ── */}
      <Text style={styles.pageTitle}>학원 설정</Text>

      {/* ── 학원 정보 카드 (보라 그라데이션) ── */}
      <LinearGradient
        colors={['#7C3AED', '#5B50E8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.academyCard}
      >
        <View style={styles.academyCardInner}>
          {/* 학원 아이콘 */}
          <View style={styles.academyIconBox}>
            <Ionicons name="business-outline" size={28} color="#fff" />
          </View>

          {/* 학원 정보 */}
          <View style={styles.academyInfo}>
            <Text style={styles.academyName}>{academy?.name ?? '학원'}</Text>
            <Text style={styles.academySub}>
              학원 · {planLabel(academy?.plan ?? 'free')} · 갱신일 {approvedDate}
            </Text>
            {/* 승인 상태 뱃지 */}
            <View style={[
              styles.statusBadge,
              academy?.status === 'active' ? styles.statusBadgeActive : styles.statusBadgePending,
            ]}>
              <Text style={styles.statusBadgeText}>
                {academy?.status === 'active' ? '승인 완료' :
                 academy?.status === 'pending' ? '승인 대기' : '반려'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── 반 관리 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>반 관리</Text>
        <View style={styles.card}>
          {classes.length === 0 ? (
            <Text style={styles.emptyText}>등록된 반이 없어요</Text>
          ) : (
            classes.map((cls, idx) => (
              <View key={cls.id}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.classRow}>
                  {/* 반 정보 */}
                  <View style={styles.classInfo}>
                    <Text style={styles.className}>{cls.name}</Text>
                    <Text style={styles.classSub}>
                      {classTeacherMap[cls.id] ?? '선생님 미배정'} · {studentCounts[cls.id] ?? 0}명
                      {cls.subject ? `\n교습과목: ${cls.subject}` : ''}
                    </Text>
                    {/* 반 초대코드 + 복사 버튼 */}
                    <TouchableOpacity
                      style={styles.codeChip}
                      onPress={() => handleCopyCode(cls.invite_code ?? '', `${cls.name} 학생 초대`)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.codeChipText}>{cls.invite_code}</Text>
                      <Ionicons name="copy-outline" size={12} color="#5B50E8" />
                    </TouchableOpacity>
                  </View>

                  {/* 설정 버튼 */}
                  <TouchableOpacity
                    style={styles.settingBtn}
                    onPress={() => {
                      setEditClass(cls);
                      setEditClassName(cls.name);
                      setEditClassSubject(cls.subject ?? ''); // 기존 교습과목 불러오기
                      setIsClassSettingVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.settingBtnText}>설정</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* 새 반 만들기 버튼 */}
          <View style={classes.length > 0 ? styles.divider : undefined} />
          <TouchableOpacity
            style={styles.newClassBtn}
            onPress={() => setIsNewClassModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.newClassBtnText}>+ 새 반 만들기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 선생님 관리 ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>선생님 관리</Text>
        <View style={styles.card}>
          {teachers.length === 0 ? (
            <Text style={styles.emptyText}>등록된 선생님이 없어요</Text>
          ) : (
            teachers.map((t, idx) => (
              <View key={t.uid}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.teacherRow}>
                  {/* 선생님 정보 */}
                  <View style={styles.teacherInfo}>
                    <Text style={styles.teacherName}>{t.name}</Text>
                    <Text style={styles.teacherSub}>담당반 {getAssignedCount(t)}개</Text>
                  </View>

                  {/* 삭제 버튼 */}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteTeacher(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.deleteBtnText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* 선생님 초대 코드 — 승인 완료 학원만 표시 */}
          {academy?.status === 'active' && (
          <>
          <View style={[styles.divider, { marginBottom: 12 }]} />
          <View style={styles.inviteCodeCard}>
            <View>
              <Text style={styles.inviteCodeLabel}>선생님 초대 코드</Text>
              <Text style={styles.inviteCode}>{academy?.academy_code ?? '------'}</Text>
            </View>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopyCode(academy?.academy_code ?? '', '선생님 초대')}
              activeOpacity={0.8}
            >
              <Text style={styles.copyBtnText}>복사</Text>
            </TouchableOpacity>
          </View>
          </>
          )}
        </View>
      </View>

      {/* ── 계정 설정 (비밀번호 변경 + 로그아웃) ── */}
      <View style={styles.accountSection}>
        <TouchableOpacity
          style={styles.accountBtn}
          onPress={() => setIsPwModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#5B50E8" />
          <Text style={styles.accountBtnText}>비밀번호 변경</Text>
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {/* ── 로그아웃 ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      {/* ── 새 반 만들기 모달 ── */}
      <Modal
        visible={isNewClassModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsNewClassModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsNewClassModalVisible(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>새 반 만들기</Text>

          {/* 반 이름 */}
          <TextInput
            style={styles.modalInput}
            placeholder="반 이름 (예: 초등 A반)"
            placeholderTextColor="#94A3B8"
            value={newClassName}
            onChangeText={setNewClassName}
            autoFocus
          />

          {/* 교습과목 — 법정 출석부 필수 기재항목 */}
          <TextInput
            style={styles.modalInput}
            placeholder="교습과목 (예: 수학, 영어) — 선택"
            placeholderTextColor="#94A3B8"
            value={newClassSubject}
            onChangeText={setNewClassSubject}
          />

          <TouchableOpacity
            style={[styles.modalPrimaryBtn, isCreatingClass && { opacity: 0.6 }]}
            onPress={handleCreateClass}
            disabled={isCreatingClass}
            activeOpacity={0.8}
          >
            {isCreatingClass ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalPrimaryBtnText}>만들기</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => { setIsNewClassModalVisible(false); setNewClassName(''); setNewClassSubject(''); }}
          >
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── 반 설정 모달 ── */}
      <Modal
        visible={isClassSettingVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsClassSettingVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsClassSettingVisible(false)}
        />
        <View style={[styles.modalSheet, { maxHeight: windowHeight * 0.85 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{editClass?.name} 설정</Text>

          {/* 내용이 많으므로 ScrollView로 감쌈 */}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* 반 이름 */}
            <TextInput
              style={styles.modalInput}
              placeholder="반 이름"
              placeholderTextColor="#94A3B8"
              value={editClassName}
              onChangeText={setEditClassName}
            />

            {/* 교습과목 — 법정 출석부 필수 기재항목 */}
            <TextInput
              style={styles.modalInput}
              placeholder="교습과목 (예: 수학, 영어) — 선택"
              placeholderTextColor="#94A3B8"
              value={editClassSubject}
              onChangeText={setEditClassSubject}
            />

            {/* 현재 초대코드 표시 + 재발급 */}
            <View style={styles.codeDisplayRow}>
              <Text style={styles.currentInviteCode}>
                {editClass?.invite_code ?? '------'}
              </Text>
              <TouchableOpacity
                style={[styles.reissueBtn, isReissuingCode && { opacity: 0.6 }]}
                onPress={handleReissueCode}
                disabled={isReissuingCode}
                activeOpacity={0.8}
              >
                {isReissuingCode ? (
                  <ActivityIndicator color="#334155" size="small" />
                ) : (
                  <Text style={styles.reissueBtnText}>코드 재발급</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* 담당 선생님 선택 섹션 */}
            <View style={styles.teacherSection}>
              <Text style={styles.teacherSectionLabel}>담당 선생님</Text>
              {teachers.length === 0 ? (
                <Text style={styles.emptyText}>등록된 선생님이 없어요</Text>
              ) : (
                <View style={styles.teacherChipRow}>
                  {teachers.map(t => {
                    const isAssigned = (t.assigned_class_ids ?? []).includes(editClass?.id ?? '');
                    return (
                      <TouchableOpacity
                        key={t.uid}
                        style={[styles.teacherChip, isAssigned && styles.teacherChipSelected]}
                        onPress={() => handleToggleTeacher(t)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.teacherChipText, isAssigned && styles.teacherChipTextSelected]}>
                          {t.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.modalPrimaryBtn, isSavingClass && { opacity: 0.6 }]}
              onPress={handleSaveClassName}
              disabled={isSavingClass}
              activeOpacity={0.8}
            >
              {isSavingClass ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalPrimaryBtnText}>저장</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalDangerBtn}
              onPress={handleDeleteClass}
              activeOpacity={0.8}
            >
              <Text style={styles.modalDangerText}>반 삭제</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => { setIsClassSettingVisible(false); setEditClass(null); }}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>

    </ScrollView>

    {/* ── 비밀번호 변경 모달 ── */}
    <PasswordChangeModal
      visible={isPwModalVisible}
      onClose={() => setIsPwModalVisible(false)}
    />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 40 },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // 페이지 타이틀
  pageTitle: {
    fontSize: 22, fontWeight: '800', color: '#0F172A',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
  },

  // 학원 정보 카드
  academyCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  academyCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  academyIconBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  academyIconEmoji: { fontSize: 28 },
  academyInfo:      { flex: 1, gap: 3 },
  academyName:      { fontSize: 20, fontWeight: '800', color: '#fff' },
  academySub:       { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  // 승인 상태 뱃지
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    marginTop: 4,
  },
  statusBadgeActive:  { backgroundColor: '#10B981' },
  statusBadgePending: { backgroundColor: '#F59E0B' },
  statusBadgeText:    { fontSize: 13, fontWeight: '700', color: '#fff' },

  // 섹션
  section:      { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 10 },

  // 카드 컨테이너
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 16 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // 반 행
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  classIconEmoji: { fontSize: 20 },
  classInfo:  { flex: 1 },
  className:  { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  classSub:   { fontSize: 13, color: '#64748B', marginTop: 2 },
  codeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: '#EEEDF9', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  codeChipText: { fontSize: 12, fontWeight: '700', color: '#5B50E8', letterSpacing: 1 },
  settingBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0',
  },
  settingBtnText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  // 새 반 만들기 버튼
  newClassBtn: {
    marginHorizontal: 16, marginVertical: 12,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: '#5B50E8', borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
  },
  newClassBtnText: { fontSize: 15, fontWeight: '700', color: '#5B50E8' },

  // 선생님 행
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  teacherInfo:  { flex: 1 },
  teacherName:  { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  teacherSub:   { fontSize: 13, color: '#64748B', marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5,
    borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#991B1B' },

  // 선생님 초대코드 카드
  inviteCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#F1F0FB',
    borderRadius: 12, padding: 14,
  },
  inviteCodeLabel: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  inviteCode: {
    fontSize: 24, fontWeight: '800',
    color: '#5B50E8', letterSpacing: 4,
  },
  copyBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
  },
  copyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // 계정 설정 (비밀번호 변경)
  accountSection: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  accountBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, paddingHorizontal: 18,
  },
  accountBtnText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },

  // 로그아웃
  logoutBtn: {
    marginHorizontal: 16, marginTop: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', backgroundColor: '#fff',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#EF4444' },

  // 모달 공통
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 16,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#F1F0FB',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 16, color: '#0F172A', marginBottom: 12,
  },
  modalPrimaryBtn: {
    backgroundColor: '#5B50E8', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  modalPrimaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalDangerBtn: {
    backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  modalDangerText: { fontSize: 16, fontWeight: '600', color: '#991B1B' },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCancelText: { fontSize: 16, fontWeight: '700', color: '#334155' },

  // 담당 선생님 선택 섹션
  teacherSection: {
    marginBottom: 14,
  },
  teacherSectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#64748B',
    marginBottom: 10,
  },
  teacherChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  teacherChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  teacherChipSelected: {
    borderWidth: 1.5, borderColor: '#5B50E8',
    backgroundColor: '#EEEDF9',
  },
  teacherChipText: {
    fontSize: 14, fontWeight: '600', color: '#334155',
  },
  teacherChipTextSelected: {
    color: '#3730A3',
  },

  // 초대코드 표시 + 재발급 행
  codeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F0FB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  currentInviteCode: {
    fontSize: 20, fontWeight: '800',
    color: '#5B50E8', letterSpacing: 4,
  },
  reissueBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  reissueBtnText: { fontSize: 13, fontWeight: '600', color: '#334155' },
});
