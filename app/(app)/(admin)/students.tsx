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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { User, Class, AttendanceRecord } from '../../../types';

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

  // ── 반이동 모달 ──
  const [moveTargetStudent, setMoveTargetStudent] = useState<User | null>(null);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [isMoving, setIsMoving]                   = useState(false);

  // ── 초대코드 모달 (+ 추가) ──
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);

  // ── 1. 학생 + 반 목록 로드 (활성/비활성 모두) ──
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      try {
        const [activeSnap, inactiveSnap, classSnap] = await Promise.all([
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'student'),
              where('is_active', '==', true),
            )
          ),
          getDocs(
            query(
              Collections.users(),
              where('academy_id', '==', user.academy_id),
              where('role', '==', 'student'),
              where('is_active', '==', false),
            )
          ),
          getDocs(
            query(Collections.classes(), where('academy_id', '==', user.academy_id))
          ),
        ]);

        const allStudents: User[] = [
          ...activeSnap.docs.map(d => ({ uid: d.id, ...d.data() } as User)),
          ...inactiveSnap.docs.map(d => ({ uid: d.id, ...d.data() } as User)),
        ];
        const classList = classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class));

        setStudents(allStudents);
        setClasses(classList);
      } catch (e) {
        console.error('[AdminStudents] 로드 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id]);

  // ── 2. 반 목록 로드 완료 후 이번달 출석 집계 ──
  useEffect(() => {
    if (classes.length === 0) return;

    const { year, month, day } = getTodayInfo();
    setDaysElapsed(day);
    setIsLoadingAttendance(true);

    // 활성 학생이 있는 반만 집계 (비활성 학생 제외)
    const activeClassIds = [...new Set(
      students.filter(s => s.is_active && s.class_id).map(s => s.class_id!)
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
          return getDocs(Collections.attendanceRecords(classId, dateStr));
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
    if (!student.class_id || !student.is_active) return null;
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
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = !searchText.trim()
        || s.name?.toLowerCase().includes(searchText.toLowerCase());
      const matchClass = !selectedClassId || s.class_id === selectedClassId;
      return matchSearch && matchClass;
    });
  }, [students, searchText, selectedClassId]);

  // ── 반이동: 확인 후 Firestore 업데이트 ──
  const handleMoveClass = useCallback(async (targetClassId: string) => {
    if (!moveTargetStudent) return;

    setIsMoving(true);
    try {
      await updateDoc(Collections.user(moveTargetStudent.uid), { class_id: targetClassId });
      // 로컬 상태 업데이트
      setStudents(prev =>
        prev.map(s => s.uid === moveTargetStudent.uid ? { ...s, class_id: targetClassId } : s)
      );
      setIsMoveModalVisible(false);
      setMoveTargetStudent(null);
    } catch (e) {
      console.error('[AdminStudents] 반이동 실패:', e);
      Alert.alert('오류', '반이동에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsMoving(false);
    }
  }, [moveTargetStudent]);

  // ── 비활성: 확인 후 Firestore 업데이트 ──
  const handleDeactivate = useCallback((student: User) => {
    Alert.alert(
      '학생 비활성화',
      `${student.name} 학생을 비활성화할까요?\n비활성화된 학생은 앱에 접속할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '비활성화',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(Collections.user(student.uid), { is_active: false });
              setStudents(prev =>
                prev.map(s => s.uid === student.uid ? { ...s, is_active: false } : s)
              );
            } catch (e) {
              console.error('[AdminStudents] 비활성화 실패:', e);
              Alert.alert('오류', '비활성화에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }, []);

  // ── 로딩 ──
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  const activeCount = students.filter(s => s.is_active).length;

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>학생 관리</Text>
          <Text style={styles.headerSub}>전체 {activeCount}명</Text>
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

      {/* ── 반 필터 탭 ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabContent}
      >
        <TouchableOpacity
          style={[styles.tab, !selectedClassId && styles.tabActive]}
          onPress={() => setSelectedClassId(null)}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, !selectedClassId && styles.tabTextActive]}>전체</Text>
        </TouchableOpacity>
        {classes.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.tab, selectedClassId === c.id && styles.tabActive]}
            onPress={() => setSelectedClassId(c.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, selectedClassId === c.id && styles.tabTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 학생 목록 ── */}
      {filteredStudents.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {searchText ? '검색 결과가 없어요' : '등록된 학생이 없어요'}
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
                      : !isActive ? ' · 비활성' : ''}
                  </Text>
                </View>

                {/* 액션 버튼 (활성 학생만) */}
                {isActive && (
                  <View style={styles.actions}>
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
                      <Text style={styles.deactivateBtnText}>비활성</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

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

  // ── 반 필터 탭 ──
  tabBar:    { maxHeight: 44, marginBottom: 4 },
  tabContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  tabActive:     { backgroundColor: '#5B50E8', borderColor: '#5B50E8' },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#fff' },

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
  nameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:       { fontSize: 16, fontWeight: '700', color: '#0F172A' },
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
  actions: { flexDirection: 'row', gap: 6 },
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
