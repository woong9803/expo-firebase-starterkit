import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
  InputAccessoryView,
} from 'react-native';

// iOS 숫자/전화 키보드 Done 툴바 제거용 ID
const ACCESSORY_ID = 'adminStudents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { firebase as fbFunctions } from '@react-native-firebase/functions';
import { Collections } from '../../../../lib/firestore';

// RN Firebase 타입 별칭 — 기존 firebase/firestore의 Timestamp 사용처와 호환
type Timestamp = FirebaseFirestoreTypes.Timestamp;
const Timestamp = firestore.Timestamp;
const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
import { useAuthStore } from '../../../../store/useAuthStore';
import { User, Class, AttendanceRecord } from '../../../../types';
import {
  resolveTuitionOnClassChange,
  formatTuitionInput,
  parseTuitionInput,
  tuitionToInputString,
} from '../../../../lib/tuitionFormat';

// ─────────────────────────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────────────────────────

function getTodayInfo() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 퇴원일 라벨 변환 — 카드 부제목용.
 * Timestamp 있으면 "퇴원일 5/15", 없으면 "퇴원" 만 반환.
 */
function formatWithdrawalLabel(ts: Timestamp | null | undefined): string {
  if (!ts) return '퇴원';
  try {
    const d = ts.toDate();
    return `퇴원일 ${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '퇴원';
  }
}

// ─────────────────────────────────────────────────────────────
// 아바타 색상 (이름 기반)
// ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#E6F1FB', '#ECFDF5', '#FFFBEB', '#EDE9FE', '#FEF2F2'];
const AVATAR_TEXT_COLORS = ['#1D4ED8', '#065F46', '#78350F', '#4C1D95', '#991B1B'];

function getAvatarStyle(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return { bg: AVATAR_COLORS[idx], text: AVATAR_TEXT_COLORS[idx] };
}

// ─────────────────────────────────────────────────────────────
// AdminStudentsScreen
// ─────────────────────────────────────────────────────────────

export default function AdminStudentsScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  // ── 데이터 상태 ──
  const [students, setStudents]         = useState<User[]>([]);
  const [classes, setClasses]           = useState<Class[]>([]);
  // { classId: { studentUid: presentDays } }
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, number>>>({});
  // 이번달 경과일 (출석률 분모)
  const [daysElapsed, setDaysElapsed]   = useState(1);

  // ── 로딩 상태 ──
  const [isLoading, setIsLoading]               = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);

  // ── UI 상태 ──
  const [searchText, setSearchText]         = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null); // null = 전체
  const [isClassPickerVisible, setIsClassPickerVisible] = useState(false); // 반 선택 바텀시트
  // 학생 목록 모드: 'active' = 재원생, 'inactive' = 퇴원생 (세그먼트 토글)
  const [studentMode, setStudentMode] = useState<'active' | 'inactive'>('active');

  // ── 반이동 모달 ──
  const [moveTargetStudent, setMoveTargetStudent] = useState<User | null>(null);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [isMoving, setIsMoving]                   = useState(false);

  // ── 초대코드 모달 (+ 추가) ──
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);

  // ── 피드백 모달 ──
  const [feedbackTarget, setFeedbackTarget]     = useState<User | null>(null);
  const [feedbackText, setFeedbackText]         = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // ── 학생 정보 수정 모달 ──
  const [editTarget, setEditTarget]               = useState<User | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editBirthDate, setEditBirthDate]         = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');
  const [editEnrollDate, setEditEnrollDate]       = useState(''); // YYYY-MM-DD 문자열
  const [editAddress, setEditAddress]             = useState('');
  // 수강료 — 콤마 포함 문자열로 보관, 저장 시 number|null 로 변환
  const [editTuitionFee, setEditTuitionFee]       = useState('');
  // 수정 모달 진입 시 초기 수강료 입력 문자열 — 저장 시 변경 여부 판단용 (변경 없으면 페이로드 제외)
  const [editTuitionInitial, setEditTuitionInitial] = useState('');
  const [isSavingEdit, setIsSavingEdit]           = useState(false);

  // ── 1. 학생 + 반 목록 실시간 구독 (활성/비활성 모두) ──
  useEffect(() => {
    if (!user?.academy_id) return;

    const unsubStudents = Collections.users()
      .where('academy_id', '==', user.academy_id)
      .where('role', '==', 'student')
      .onSnapshot(
        (snap) => {
          // 탈퇴 처리된 학생(deleted_at != null) 제외
          setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)).filter(s => !s.deleted_at));
          setIsLoading(false);
        },
        (e) => { console.error('[AdminStudents] 학생 구독 실패:', e); setIsLoading(false); }
      );

    const unsubClasses = Collections.classes()
      .where('academy_id', '==', user.academy_id)
      .onSnapshot(
        (snap) => setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class))),
        (e) => console.error('[AdminStudents] 반 구독 실패:', e)
      );

    return () => { unsubStudents(); unsubClasses(); };
  }, [user?.academy_id]);

  // ── 2. 반 목록 로드 완료 후 이번달 출석 집계 ──
  useEffect(() => {
    if (classes.length === 0) return;

    const { year, month, day } = getTodayInfo();
    setDaysElapsed(day);
    setIsLoadingAttendance(true);

    // 활성 학생이 있는 반만 집계 (비활성화된 학생 제외, 자가 가입 학생 포함)
    const activeClassIds = [...new Set(
      students.filter(s => s.is_active !== false && s.class_id).map(s => s.class_id!)
    )];

    if (activeClassIds.length === 0) {
      setIsLoadingAttendance(false);
      return;
    }

    // 반별로 이번달 1일~오늘까지 records 병렬 조회
    Promise.all(
      activeClassIds.map(async (classId) => {
        const presentCounts: Record<string, number> = {};

        // 1일~오늘까지 각 날짜의 records 조회
        const dayPromises = Array.from({ length: day }, (_, i) => {
          const dateStr = toDateStr(year, month, i + 1);
          return Collections.attendanceRecords(classId, dateStr).get();
        });

        const snaps = await Promise.all(dayPromises);
        snaps.forEach(snap => {
          snap.forEach(d => {
            const record = d.data() as AttendanceRecord;
            if (record.status === 'present') {
              presentCounts[d.id] = (presentCounts[d.id] ?? 0) + 1;
            }
          });
        });

        return { classId, presentCounts };
      })
    ).then(results => {
      const map: Record<string, Record<string, number>> = {};
      results.forEach(({ classId, presentCounts }) => {
        map[classId] = presentCounts;
      });
      setAttendanceMap(map);
    }).catch(e => {
      console.error('[AdminStudents] 출결 집계 실패:', e);
    }).finally(() => {
      setIsLoadingAttendance(false);
    });
  }, [classes, students]);

  // ── 출석률 계산 (특정 학생) ──
  const getAttendanceRate = useCallback((student: User): number | null => {
    if (!student.class_id || student.is_active === false) return null;
    const classCounts = attendanceMap[student.class_id];
    if (!classCounts) return null;
    const present = classCounts[student.uid] ?? 0;
    return daysElapsed > 0 ? Math.round((present / daysElapsed) * 100) : 0;
  }, [attendanceMap, daysElapsed]);

  // ── 반 이름 조회 ──
  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c])),
    [classes]
  );

  // ── 검색 + 필터 적용 ──
  // 모드별 분기: 재원생(is_active !== false) vs 퇴원생(is_active === false)
  // 반 필터는 재원생 모드에서만 적용 — 퇴원생은 반 무관 전체 노출
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchMode = studentMode === 'active'
        ? s.is_active !== false
        : s.is_active === false;
      if (!matchMode) return false;
      const matchSearch = !searchText.trim()
        || s.name?.toLowerCase().includes(searchText.toLowerCase());
      const matchClass = studentMode === 'inactive' || !selectedClassId || s.class_id === selectedClassId;
      return matchSearch && matchClass;
    });
  }, [students, searchText, selectedClassId, studentMode]);

  // ── 반이동: 확인 후 Firestore 업데이트 ──
  // 수강료 자동 채움 정책: 학생 tuition_fee 가 비어있으면 새 반 default_tuition_fee 로 채움.
  // 이미 값(0 포함)이 있으면 보존 — 학생별 설정 유지 (resolveTuitionOnClassChange 가 결정).
  const handleMoveClass = useCallback(async (targetClassId: string) => {
    if (!moveTargetStudent) return;

    setIsMoving(true);
    try {
      // 새 반의 default_tuition_fee 조회 (이미 onSnapshot 캐시 보유 — 추가 RTT 없음)
      const newClass = classes.find(c => c.id === targetClassId);
      const newFee = resolveTuitionOnClassChange(
        moveTargetStudent.tuition_fee,
        newClass?.default_tuition_fee,
      );

      // 페이로드 조립 — undefined = 페이로드 제외(보존), null = 명시적 미설정 저장
      const payload: Record<string, unknown> = { class_id: targetClassId };
      if (newFee !== undefined) payload.tuition_fee = newFee;

      await Collections.user(moveTargetStudent.uid).update(payload);

      // 로컬 상태 업데이트 — class_id + (변경된 경우만) tuition_fee 반영
      setStudents(prev =>
        prev.map(s => {
          if (s.uid !== moveTargetStudent.uid) return s;
          const updated: User = { ...s, class_id: targetClassId };
          if (newFee !== undefined) updated.tuition_fee = newFee;
          return updated;
        })
      );
      setIsMoveModalVisible(false);
      setMoveTargetStudent(null);
    } catch (e) {
      console.error('[AdminStudents] 반이동 실패:', e);
      Alert.alert('오류', '반이동에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsMoving(false);
    }
  }, [moveTargetStudent, classes]);

  // ── 퇴원 처리: 확인 후 Firestore 업데이트 (is_active: false) ──
  const handleDeactivate = useCallback((student: User) => {
    Alert.alert(
      '학생 퇴원 처리',
      `${student.name} 학생을 퇴원 처리할까요?\n퇴원 처리된 학생은 앱에 접속할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '퇴원 처리',
          style: 'destructive',
          onPress: async () => {
            try {
              // 퇴원 처리: is_active=false + withdrawal_date 자동 기록 (법정 출석부 수강기간 종료일용)
              await Collections.user(student.uid).update({
                is_active: false,
                withdrawal_date: serverTimestamp(),
              });
              // 로컬 상태 미러링 — serverTimestamp는 즉시 Timestamp 객체로 안 오므로 클라이언트 시간으로 임시 반영
              const localWithdrawalTs = Timestamp.now();
              setStudents(prev =>
                prev.map(s => s.uid === student.uid
                  ? { ...s, is_active: false, withdrawal_date: localWithdrawalTs }
                  : s)
              );
            } catch (e) {
              console.error('[AdminStudents] 퇴원 처리 실패:', e);
              Alert.alert('오류', '퇴원 처리에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }, []);

  // ── 재원 복구: Cloud Function 호출 (서버에서 플랜별 학생 수 한도 재검증) ──
  //
  // 직접 updateDoc 사용 금지 — Rules는 컬렉션 카운트 쿼리를 지원하지 않아
  // 다운그레이드 후 한도 초과 복구를 막을 수 없음. 따라서 onCall CF에서
  // 서버 측 학생 수 카운트 + 플랜 한도 검증을 수행한다.
  const handleReactivate = useCallback((student: User) => {
    Alert.alert(
      '재원 복구',
      `${student.name} 학생을 다시 재원 처리할까요?\n재원 처리 시 다시 앱에 접속할 수 있어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '재원 복구',
          onPress: async () => {
            try {
              // CF region: asia-northeast3 (서울)
              const restore = fbFunctions
                .app()
                .functions('asia-northeast3')
                .httpsCallable('restoreStudent');
              await restore({ studentUid: student.uid });
              // 성공 — 로컬 상태 즉시 반영 (서버 onSnapshot 갱신 전이라도 UI 일관성 유지)
              setStudents(prev =>
                prev.map(s => s.uid === student.uid
                  ? { ...s, is_active: true, withdrawal_date: null }
                  : s)
              );
            } catch (e: unknown) {
              console.error('[AdminStudents] 재원 복구 실패:', e);
              // CF에서 던지는 사용자 친화 메시지(플랜 한도 초과 등)를 그대로 노출
              const message =
                (e as { message?: string })?.message ??
                '재원 복구에 실패했어요. 다시 시도해주세요.';
              Alert.alert('재원 복구 실패', message);
            }
          },
        },
      ]
    );
  }, []);

  // ── 피드백 모달 열기 ──
  const openFeedbackModal = useCallback((student: User) => {
    setFeedbackTarget(student);
    setFeedbackText(student.teacher_feedback?.text ?? '');
  }, []);

  // ── 피드백 저장 ──
  const handleSaveFeedback = useCallback(async () => {
    if (!feedbackTarget || !user) return;
    setIsSavingFeedback(true);
    try {
      await Collections.user(feedbackTarget.uid).update({
        teacher_feedback: feedbackText.trim()
          ? {
              text: feedbackText.trim(),
              author_name: user.name,
              created_at: serverTimestamp(),
            }
          : null,
      });
      setStudents(prev =>
        prev.map(s =>
          s.uid === feedbackTarget.uid
            ? {
                ...s,
                teacher_feedback: feedbackText.trim()
                  ? { text: feedbackText.trim(), author_name: user.name, created_at: null as any }
                  : undefined,
              }
            : s
        )
      );
      setFeedbackTarget(null);
    } catch (e) {
      console.error('[AdminStudents] 피드백 저장 실패:', e);
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSavingFeedback(false);
    }
  }, [feedbackTarget, feedbackText, user]);

  // ── 정보 수정 모달 열기 ──
  const openEditModal = useCallback((student: User) => {
    setEditTarget(student);
    // 기존 값을 입력창에 미리 채움
    setEditBirthDate(student.birth_date ?? '');
    setEditGuardianPhone(student.guardian_phone ?? '');
    setEditAddress(student.address ?? '');
    // 수강료 — 학생이 값 가지면 콤마 문자열로 채움, 없으면 빈 칸 (placeholder가 반 default 힌트)
    const tuitionInput = tuitionToInputString(student.tuition_fee);
    setEditTuitionFee(tuitionInput);
    setEditTuitionInitial(tuitionInput);
    // enrollment_date Timestamp → YYYY-MM-DD 문자열 변환
    if (student.enrollment_date) {
      const d = student.enrollment_date.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setEditEnrollDate(`${y}-${m}-${day}`);
    } else {
      setEditEnrollDate('');
    }
    setIsEditModalVisible(true);
  }, []);

  // ── 정보 수정 저장 ──
  const handleSaveEdit = useCallback(async () => {
    if (!editTarget) return;
    setIsSavingEdit(true);
    try {
      // enrollment_date: YYYY-MM-DD 문자열 → Firestore Timestamp 변환
      let enrollTimestamp: Timestamp | null = null;
      if (editEnrollDate.trim()) {
        const d = new Date(editEnrollDate.trim() + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          enrollTimestamp = Timestamp.fromDate(d);
        }
      }

      // 수강료: 입력값이 초기값과 동일 → undefined (건드리지 않음, 페이로드 제외)
      // 변경됨 → parseTuitionInput (number|null) — 빈 칸=null=반 default 따라감, "0"=무료
      const tuitionFeeChanged = editTuitionFee !== editTuitionInitial;
      const newTuition = tuitionFeeChanged ? parseTuitionInput(editTuitionFee) : undefined;

      const payload: Record<string, unknown> = {
        birth_date:      editBirthDate.trim() || null,
        guardian_phone:  editGuardianPhone.trim() || null,
        enrollment_date: enrollTimestamp,
        address:         editAddress.trim() || null,
      };
      if (newTuition !== undefined) payload.tuition_fee = newTuition;

      await Collections.user(editTarget.uid).update(payload);

      // 로컬 상태 동기화
      setStudents(prev =>
        prev.map(s => {
          if (s.uid !== editTarget.uid) return s;
          const updated: User = {
            ...s,
            birth_date:      editBirthDate.trim() || null,
            guardian_phone:  editGuardianPhone.trim() || null,
            enrollment_date: enrollTimestamp,
            address:         editAddress.trim() || null,
          };
          if (newTuition !== undefined) updated.tuition_fee = newTuition;
          return updated;
        })
      );
      setIsEditModalVisible(false);
      setEditTarget(null);
    } catch (e) {
      console.error('[AdminStudents] 정보 수정 실패:', e);
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSavingEdit(false);
    }
  }, [editTarget, editBirthDate, editGuardianPhone, editEnrollDate, editAddress, editTuitionFee, editTuitionInitial]);

  // ── 로딩 ──
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  // is_active !== false: 자가 가입 학생(undefined) + 선생님 생성 학생(true) 모두 포함, 탈퇴 학생 제외
  const activeCount = students.filter(s => s.is_active !== false && !s.deleted_at).length;
  // 퇴원생 카운트 (is_active === false, 탈퇴 학생 제외)
  const inactiveCount = students.filter(s => s.is_active === false && !s.deleted_at).length;

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>학생 관리</Text>
          <Text style={styles.headerSub}>재원생 {activeCount}명 · 퇴원생 {inactiveCount}명</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setIsInviteModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {/* ── 검색창 ── */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="학생 검색..."
            placeholderTextColor="#94A3B8"
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 재원/퇴원 세그먼트 토글 ── */}
      <View style={styles.segmentWrapper}>
        <View style={styles.segmentBox}>
          <TouchableOpacity
            style={[styles.segmentTab, studentMode === 'active' && styles.segmentTabActive]}
            onPress={() => setStudentMode('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentTabText, studentMode === 'active' && styles.segmentTabTextActive]}>
              재원생 {activeCount}명
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentTab, studentMode === 'inactive' && styles.segmentTabActive]}
            onPress={() => setStudentMode('inactive')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentTabText, studentMode === 'inactive' && styles.segmentTabTextActive]}>
              퇴원생 {inactiveCount}명
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 반 필터 드롭다운 (재원생 모드에서만) ── */}
      {studentMode === 'active' && (
        <View style={styles.classPickerWrapper}>
          <TouchableOpacity
            style={styles.classPickerBtn}
            onPress={() => setIsClassPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="people-outline" size={15} color={selectedClassId ? '#5B50E8' : '#64748B'} />
            <Text style={[styles.classPickerBtnText, selectedClassId && styles.classPickerBtnTextActive]}>
              {selectedClassId ? (classMap[selectedClassId]?.name ?? '반 선택') : '전체 반'}
            </Text>
            <Ionicons name="chevron-down" size={15} color={selectedClassId ? '#5B50E8' : '#64748B'} />
          </TouchableOpacity>
          {/* 선택 중일 때 초기화 버튼 */}
          {selectedClassId && (
            <TouchableOpacity
              style={styles.classPickerClearBtn}
              onPress={() => setSelectedClassId(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── 학생 목록 ── */}
      {filteredStudents.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {searchText
              ? '검색 결과가 없어요'
              : studentMode === 'inactive'
                ? '퇴원 처리된 학생이 없어요'
                : '등록된 학생이 없어요'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = item.is_active !== false;
            const cls = item.class_id ? classMap[item.class_id] : null;
            const rate = getAttendanceRate(item);
            const avatarStyle = getAvatarStyle(item.name ?? '?');

            return (
              <View style={[styles.row, !isActive && styles.rowInactive]}>
                {/* 아바타 */}
                <View style={[styles.avatar, { backgroundColor: avatarStyle.bg }]}>
                  <Text style={[styles.avatarText, { color: avatarStyle.text }]}>
                    {item.name?.charAt(0) ?? '?'}
                  </Text>
                </View>

                {/* 이름 + 서브 정보 */}
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, !isActive && styles.nameInactive]}>
                      {item.name}
                    </Text>
                    {!!item.school_name && (
                      <Text style={styles.schoolTag}>{item.school_name}</Text>
                    )}
                    {!isActive && (
                      <View style={styles.retiredTag}>
                        <Text style={styles.retiredTagText}>퇴원</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.sub, !isActive && styles.subInactive]}>
                    {cls ? cls.name : '반 미배정'}
                    {isActive && rate !== null
                      ? ` · 출석률 ${isLoadingAttendance ? '-' : `${rate}%`}`
                      : !isActive
                        ? ` · ${formatWithdrawalLabel(item.withdrawal_date)}`
                        : ''}
                  </Text>
                </View>

                {/* 액션 버튼 — 재원생: 피드백/수정/반이동/퇴원, 퇴원생: 수정/재원 */}
                {isActive ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.feedbackBtn, !!item.teacher_feedback?.text && styles.feedbackBtnFilled]}
                      onPress={() => openFeedbackModal(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.feedbackBtnText, !!item.teacher_feedback?.text && styles.feedbackBtnTextFilled]}>
                        {item.teacher_feedback?.text ? '피드백✓' : '피드백'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditModal(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.editBtnText}>수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.moveBtn}
                      onPress={() => { setMoveTargetStudent(item); setIsMoveModalVisible(true); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.moveBtnText}>반이동</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deactivateBtn}
                      onPress={() => handleDeactivate(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deactivateBtnText}>퇴원</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditModal(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.editBtnText}>수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.reactivateBtn}
                      onPress={() => handleReactivate(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reactivateBtnText}>재원</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ── 피드백 모달 ── */}
      <Modal
        visible={!!feedbackTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setFeedbackTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setFeedbackTarget(null)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>학생 피드백</Text>
          <Text style={styles.modalSub}>
            {feedbackTarget?.name} 학생에게 전달할 메모를 입력하세요
          </Text>

          <TextInput
            style={styles.feedbackInput}
            value={feedbackText}
            onChangeText={setFeedbackText}
            placeholder="예: 수학 개념 이해도 좋아지고 있어요. 문제풀이 속도를 높여봅시다."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={300}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{feedbackText.length}/300</Text>

          <TouchableOpacity
            style={styles.feedbackSaveBtn}
            onPress={handleSaveFeedback}
            disabled={isSavingFeedback}
            activeOpacity={0.85}
          >
            {isSavingFeedback
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.editSaveBtnText}>저장</Text>
            }
          </TouchableOpacity>

          {!!feedbackTarget?.teacher_feedback?.text && (
            <TouchableOpacity
              style={styles.feedbackDeleteBtn}
              onPress={() => setFeedbackText('')}
              activeOpacity={0.8}
            >
              <Text style={styles.feedbackDeleteBtnText}>피드백 삭제</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setFeedbackTarget(null)}
          >
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── 반이동 모달 ── */}
      <Modal
        visible={isMoveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsMoveModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsMoveModalVisible(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>반 이동</Text>
          <Text style={styles.modalSub}>
            {moveTargetStudent?.name} 학생을 이동할 반을 선택하세요
          </Text>

          {isMoving ? (
            <ActivityIndicator color="#5B50E8" style={{ paddingVertical: 24 }} />
          ) : (
            classes.map(c => {
              const isCurrent = moveTargetStudent?.class_id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.classOption, isCurrent && styles.classOptionCurrent]}
                  onPress={() => !isCurrent && handleMoveClass(c.id)}
                  activeOpacity={isCurrent ? 1 : 0.7}
                >
                  <Text style={[styles.classOptionText, isCurrent && styles.classOptionTextCurrent]}>
                    {c.name}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.classOptionCurrentLabel}>현재 반</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setIsMoveModalVisible(false)}
          >
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── 학생 정보 수정 모달 ── */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsEditModalVisible(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>학생 정보 수정</Text>
          <Text style={styles.modalSub}>{editTarget?.name} 학생의 법정 출석부 정보</Text>

          {/* 생년월일 */}
          <Text style={styles.editFieldLabel}>생년월일</Text>
          <TextInput
            style={styles.editInput}
            placeholder="YYYY-MM-DD (예: 2015-03-15)"
            placeholderTextColor="#94A3B8"
            value={editBirthDate}
            onChangeText={setEditBirthDate}
            keyboardType="numbers-and-punctuation"
            inputAccessoryViewID={ACCESSORY_ID}
          />

          {/* 보호자 연락처 */}
          <Text style={styles.editFieldLabel}>보호자 연락처</Text>
          <TextInput
            style={styles.editInput}
            placeholder="01012345678"
            placeholderTextColor="#94A3B8"
            value={editGuardianPhone}
            onChangeText={setEditGuardianPhone}
            keyboardType="phone-pad"
            inputAccessoryViewID={ACCESSORY_ID}
          />

          {/* 수강 시작일 */}
          <Text style={styles.editFieldLabel}>수강 시작일</Text>
          <TextInput
            style={styles.editInput}
            placeholder="YYYY-MM-DD (예: 2026-03-01)"
            placeholderTextColor="#94A3B8"
            value={editEnrollDate}
            onChangeText={setEditEnrollDate}
            keyboardType="numbers-and-punctuation"
            inputAccessoryViewID={ACCESSORY_ID}
          />

          {/* 주소 (선택) */}
          <Text style={styles.editFieldLabel}>주소 (선택)</Text>
          <TextInput
            style={styles.editInput}
            placeholder="예: 서울시 강남구 …"
            placeholderTextColor="#94A3B8"
            value={editAddress}
            onChangeText={setEditAddress}
            autoCorrect={false}
          />

          {/* 수강료 (선택) — 학생 값 있으면 그 값, 없으면 빈 칸 + placeholder가 반 default 힌트
              빈 칸 저장 = 반 default 따라가는 학생(null), "0" = 무료(면제) */}
          <Text style={styles.editFieldLabel}>수강료 (선택)</Text>
          {(() => {
            // 학생 현재 반의 default_tuition_fee 조회 (onSnapshot 캐시 — 추가 RTT 0)
            const studentClass = editTarget?.class_id ? classMap[editTarget.class_id] : null;
            const classDefault = studentClass?.default_tuition_fee;
            const tuitionPlaceholder = classDefault !== null && classDefault !== undefined
              ? `반 기본 수강료: ${classDefault.toLocaleString()}원 (비우면 반 기준 적용)`
              : '비우면 미설정 (선택)';
            return (
              <TextInput
                style={styles.editInput}
                placeholder={tuitionPlaceholder}
                placeholderTextColor="#94A3B8"
                value={editTuitionFee}
                onChangeText={(t) => setEditTuitionFee(formatTuitionInput(t))}
                keyboardType="numeric"
                inputAccessoryViewID={ACCESSORY_ID}
              />
            );
          })()}
          <Text style={styles.editTuitionHelp}>
            비우면 반 기본 수강료 적용 · 0 입력 시 무료(면제)
          </Text>

          <TouchableOpacity
            style={styles.editSaveBtn}
            onPress={handleSaveEdit}
            disabled={isSavingEdit}
            activeOpacity={0.85}
          >
            {isSavingEdit
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.editSaveBtnText}>저장</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setIsEditModalVisible(false)}
          >
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── 반 선택 바텀시트 ── */}
      <Modal
        visible={isClassPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsClassPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsClassPickerVisible(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>반 선택</Text>
          <Text style={styles.modalSub}>학생을 필터링할 반을 선택하세요</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.classPickerList}>
            {/* 전체 항목 */}
            <TouchableOpacity
              style={[styles.classOption, !selectedClassId && styles.classOptionCurrent]}
              onPress={() => { setSelectedClassId(null); setIsClassPickerVisible(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.classOptionText, !selectedClassId && styles.classOptionTextCurrent]}>
                전체 반
              </Text>
              {!selectedClassId && (
                <Ionicons name="checkmark" size={18} color="#5B50E8" />
              )}
            </TouchableOpacity>

            {/* 반 목록 */}
            {classes.map(c => {
              const isSelected = selectedClassId === c.id;
              const studentCount = students.filter(s => s.class_id === c.id && s.is_active !== false).length;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.classOption, isSelected && styles.classOptionCurrent]}
                  onPress={() => { setSelectedClassId(c.id); setIsClassPickerVisible(false); }}
                  activeOpacity={0.7}
                >
                  <View>
                    <Text style={[styles.classOptionText, isSelected && styles.classOptionTextCurrent]}>
                      {c.name}
                    </Text>
                    <Text style={styles.classOptionSub}>{studentCount}명</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color="#5B50E8" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setIsClassPickerVisible(false)}
          >
            <Text style={styles.modalCancelText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── 학생 초대 코드 모달 (+ 추가) ── */}
      <Modal
        visible={isInviteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsInviteModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsInviteModalVisible(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>학생 초대</Text>
          <Text style={styles.modalSub}>반별 초대 코드를 학생에게 공유하세요</Text>

          {classes.length === 0 ? (
            <Text style={styles.emptyText}>등록된 반이 없어요</Text>
          ) : (
            classes.map(c => (
              <View key={c.id} style={styles.inviteRow}>
                <View style={styles.inviteInfo}>
                  <Text style={styles.inviteClassName}>{c.name}</Text>
                  <Text style={styles.inviteCode}>{c.invite_code}</Text>
                </View>
                <Ionicons name="copy-outline" size={16} color="#5B50E8" />
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setIsInviteModalVisible(false)}
          >
            <Text style={styles.modalCancelText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    {/* iOS: 숫자/전화 키보드 Done 툴바 제거 */}
    {Platform.OS === 'ios' && (
      <InputAccessoryView nativeID={ACCESSORY_ID}>
        <View />
      </InputAccessoryView>
    )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSub:   { fontSize: 14, color: '#64748B', marginTop: 2 },
  addBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── 검색창 ──
  searchWrapper: { paddingHorizontal: 16, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F0FB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    padding: 0,
  },

  // ── 재원/퇴원 세그먼트 토글 ──
  segmentWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  segmentBox: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: '#fff',
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#5B50E8',
    fontWeight: '700',
  },

  // ── 반 필터 드롭다운 ──
  classPickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  classPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  classPickerBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  classPickerBtnTextActive: { color: '#5B50E8' },
  classPickerClearBtn: { padding: 4 },
  classPickerList: { maxHeight: 320 },
  classOptionSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // ── 학생 목록 ──
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  separator:   { height: 1, backgroundColor: '#F1F5F9' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowInactive: { opacity: 0.5 },

  // 아바타
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },

  // 이름 + 서브
  info:       { flex: 1, gap: 2 },
  nameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name:       { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  schoolTag:  { fontSize: 11, color: '#94A3B8' },
  nameInactive: { color: '#94A3B8' },
  sub:        { fontSize: 13, color: '#64748B' },
  subInactive: { color: '#94A3B8' },

  // (퇴원) 태그
  retiredTag: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  retiredTagText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },

  // 액션 버튼
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  feedbackBtn: {
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  feedbackBtnFilled: { backgroundColor: '#EEEDF9', borderColor: '#5B50E8' },
  feedbackBtnText:       { fontSize: 13, fontWeight: '600', color: '#64748B' },
  feedbackBtnTextFilled: { color: '#5B50E8' },
  editBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  moveBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  moveBtnText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  deactivateBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deactivateBtnText: { fontSize: 13, fontWeight: '600', color: '#991B1B' },

  // 재원 복구 버튼 (퇴원생 카드 전용) — Primary 보라 톤
  reactivateBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#5B50E8',
  },
  reactivateBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── 빈 화면 ──
  emptyText: { fontSize: 15, fontWeight: '600', color: '#94A3B8', textAlign: 'center' },

  // ── 모달 공통 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 16,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  modalSub:   { fontSize: 14, color: '#64748B', marginBottom: 16 },

  // 반이동 — 반 선택 항목
  classOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  classOptionCurrent: {
    backgroundColor: '#EEEDF9',
    borderWidth: 1.5,
    borderColor: '#5B50E8',
  },
  classOptionText:        { fontSize: 16, fontWeight: '600', color: '#334155' },
  classOptionTextCurrent: { color: '#5B50E8' },
  classOptionCurrentLabel: { fontSize: 13, color: '#5B50E8', fontWeight: '600' },

  // 초대 코드 행
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  inviteInfo:      { gap: 2 },
  inviteClassName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  inviteCode: {
    fontSize: 20, fontWeight: '800',
    color: '#5B50E8', letterSpacing: 3,
  },

  // 피드백 모달 내 필드
  feedbackInput: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    padding: 14, fontSize: 15, color: '#0F172A', minHeight: 120,
  },
  charCount: { fontSize: 12, color: '#94A3B8', textAlign: 'right', marginTop: 6, marginBottom: 4 },
  feedbackSaveBtn: {
    marginTop: 8, height: 50, borderRadius: 14,
    backgroundColor: '#5B50E8', alignItems: 'center', justifyContent: 'center',
  },
  feedbackDeleteBtn: {
    marginTop: 8, paddingVertical: 14,
    backgroundColor: '#FEF2F2', borderRadius: 14, alignItems: 'center',
  },
  feedbackDeleteBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // 정보 수정 모달 내 필드
  editFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 12,
  },
  editInput: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  editTuitionHelp: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
  },
  editSaveBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 모달 취소 버튼
  modalCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 16, fontWeight: '700', color: '#334155' },
});
