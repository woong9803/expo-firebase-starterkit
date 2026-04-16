/**
 * app/(app)/(teacher)/homework.tsx — 선생님 숙제 목록 화면
 *
 * PRD: 선생님은 담당반 여부와 무관하게 학원 내 전체 반 숙제에 접근 가능.
 * 카드 탭 → 검사·피드백 화면, 우상단 버튼 → 숙제 출제 화면
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { useHomeworkStore } from '../../../../store/useHomeworkStore';
import { useProCheck } from '../../../../hooks/useProCheck';
import ProUpgradeSheet from '../../../../components/ProUpgradeSheet';
import HomeworkCard from '../../../../components/HomeworkCard';
import { Homework, Class } from '../../../../types';

// 날짜+시간 포맷
function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const min = date.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${y}년 ${m}월 ${d}일 ${ampm} ${hour12}:${min.toString().padStart(2, '0')}`;
}

// D-Day 계산 (오늘 기준 남은 일수)
function calcDDay(dueDate: { toDate: () => Date }): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = dueDate.toDate();
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function TeacherHomeworkScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { homeworks, setHomeworks, isLoading, setLoading } = useHomeworkStore();
  const { isPro, isLoaded, upgradeSheetVisible, showUpgradeSheet, hideUpgradeSheet } = useProCheck();

  // 학원 내 전체 반 ID 목록 (PRD: 담당반 여부 무관하게 전체 반 접근 가능)
  const [allClassIds, setAllClassIds] = useState<string[]>([]);
  const [classMap, setClassMap] = useState<Record<string, string>>({}); // classId → 반 이름

  // 제출 현황 맵 (hwId → 제출 수)
  const [submitMap, setSubmitMap] = useState<Record<string, number>>({});

  // 반 필터
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null); // null = 전체
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // ── 수정 모달 상태 ──
  const [editTarget, setEditTarget]   = useState<Homework | null>(null);
  const [editTitle, setEditTitle]     = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDueDate, setEditDueDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving]       = useState(false);

  // Pro 체크 — academy 데이터가 로드된 이후에만 판단
  useEffect(() => {
    if (isLoaded && !isPro) showUpgradeSheet();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isPro]);

  // 학원 내 전체 반 목록 1회 로드 (반 이름 맵 + 숙제 구독 기반)
  useEffect(() => {
    if (!user?.academy_id) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user.academy_id))
        );
        const ids = snap.docs.map(d => d.id);
        const map: Record<string, string> = {};
        snap.docs.forEach(d => { map[d.id] = (d.data() as Class).name; });
        setAllClassIds(ids);
        setClassMap(map);
      } catch (e) {
        console.error('[TeacherHomework] 반 목록 조회 실패:', e);
      }
    })();
  }, [user?.academy_id]);

  // 숙제 목록 실시간 구독 (학원 전체 반 기준)
  useEffect(() => {
    if (allClassIds.length === 0) {
      setHomeworks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      Collections.homeworks(),
      where('class_id', 'in', allClassIds),
      orderBy('due_date', 'asc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
      setHomeworks(list);
      setLoading(false);
    }, (e) => {
      console.error('[TeacherHomework] 숙제 구독 실패:', e);
      setLoading(false);
    });

    // 컴포넌트 언마운트 시 구독 해제
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClassIds.join(','), setHomeworks, setLoading]);

  // 각 숙제의 제출 수 실시간 구독
  // 학생이 제출하면 submissions 컬렉션이 변경되어 즉시 반영됨
  useEffect(() => {
    if (homeworks.length === 0) return;

    const unsubs = homeworks.map((hw) =>
      onSnapshot(
        Collections.submissions(hw.id),
        (snap) => {
          setSubmitMap(prev => ({ ...prev, [hw.id]: snap.size }));
        },
        (e) => console.warn(`[TeacherHomework] 제출 구독 실패(${hw.id}):`, e)
      )
    );

    return () => unsubs.forEach(u => u());
  }, [homeworks.map(h => h.id).join(',')]);

  // 선택된 반으로 필터링된 숙제 목록
  // 마감일이 오늘 기준 7일 이전이면 자동 제외 (마감 당일 포함 7일간 표시)
  const filteredHomeworks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7); // 오늘 - 7일 (해당일 포함)

    const visible = homeworks.filter(hw => {
      const due = (hw.due_date as any).toDate();
      due.setHours(0, 0, 0, 0);
      return due >= cutoff; // 마감일이 cutoff 이상이면 표시
    });

    if (!selectedClassId) return visible;
    return visible.filter(hw => hw.class_id === selectedClassId);
  }, [homeworks, selectedClassId]);

  // ── 수정 모달 열기 ──
  const openEdit = (hw: Homework) => {
    setEditTarget(hw);
    setEditTitle(hw.title);
    setEditContent(hw.content ?? '');
    setEditDueDate((hw.due_date as any).toDate());
  };

  // ── 수정 저장 ──
  const handleSave = async () => {
    if (!editTarget || !editTitle.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(Collections.homework(editTarget.id), {
        title: editTitle.trim(),
        content: editContent.trim(),
        due_date: Timestamp.fromDate(editDueDate),
      });
      setEditTarget(null);
    } catch {
      Alert.alert('오류', '수정에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 삭제 ──
  const handleDelete = (hw: Homework) => {
    Alert.alert(
      '숙제 삭제',
      `"${hw.title}" 숙제를 삭제할까요?\n제출된 내용도 모두 사라져요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(Collections.homework(hw.id));
            } catch {
              Alert.alert('오류', '삭제에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  };

  // 선택된 반 이름 (드롭다운 버튼 텍스트)
  const selectedClassName = selectedClassId ? (classMap[selectedClassId] ?? '알 수 없음') : '전체';

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <Text style={styles.headerTitle}>숙제</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/(app)/(teacher)/homework-create')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>출제</Text>
        </TouchableOpacity>
      </View>

      {/* ── 반 필터 드롭다운 버튼 ── */}
      {allClassIds.length > 0 && (
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="filter-outline" size={14} color="#5B50E8" />
            <Text style={styles.filterBtnText}>{selectedClassName}</Text>
            <Ionicons name="chevron-down" size={14} color="#5B50E8" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── 반 선택 Modal ── */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>반 선택</Text>

            {/* 전체 옵션 */}
            <TouchableOpacity
              style={[styles.modalItem, !selectedClassId && styles.modalItemActive]}
              onPress={() => { setSelectedClassId(null); setFilterModalVisible(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalItemText, !selectedClassId && styles.modalItemTextActive]}>
                전체
              </Text>
              {!selectedClassId && <Ionicons name="checkmark" size={16} color="#5B50E8" />}
            </TouchableOpacity>

            {/* 반 목록 */}
            {allClassIds.map(id => (
              <TouchableOpacity
                key={id}
                style={[styles.modalItem, selectedClassId === id && styles.modalItemActive]}
                onPress={() => { setSelectedClassId(id); setFilterModalVisible(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalItemText, selectedClassId === id && styles.modalItemTextActive]}>
                  {classMap[id] ?? id}
                </Text>
                {selectedClassId === id && <Ionicons name="checkmark" size={16} color="#5B50E8" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 콘텐츠 ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : filteredHomeworks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>
            {selectedClassId ? `${selectedClassName} 숙제가 없어요` : '출제된 숙제가 없어요'}
          </Text>
          {!selectedClassId && (
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(app)/(teacher)/homework-create')}
            >
              <Text style={styles.emptyBtnText}>+ 첫 숙제 출제하기</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {filteredHomeworks.map((hw) => {
            const dDay = calcDDay(hw.due_date as any);
            const submitted = submitMap[hw.id] ?? 0;

            return (
              <HomeworkCard
                key={hw.id}
                title={hw.title}
                content={hw.content}
                dDay={dDay}
                dueDate={(hw.due_date as any).toDate().toLocaleDateString('ko-KR')}
                className={classMap[hw.class_id] ?? '-'}
                submitCount={submitted}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/(teacher)/homework-review',
                    params: { hwId: hw.id },
                  })
                }
                onEdit={() => openEdit(hw)}
                onDelete={() => handleDelete(hw)}
              />
            );
          })}
        </ScrollView>
      )}

      {/* ── 수정 모달 ── */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setEditTarget(null)} />
          <View style={styles.editSheet}>
            <View style={styles.editHandle} />

            {/* 헤더 */}
            <View style={styles.editBar}>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.editSideBtn}>
                <Text style={styles.editCancel}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.editTitle}>숙제 수정</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving || !editTitle.trim()}
                style={styles.editSideBtn}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#5B50E8" />
                  : <Text style={[styles.editSave, !editTitle.trim() && styles.editSaveDisabled]}>저장</Text>
                }
              </TouchableOpacity>
            </View>

            {/* 제목 */}
            <Text style={styles.editLabel}>제목</Text>
            <TextInput
              style={styles.editInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="숙제 제목"
              placeholderTextColor="#94A3B8"
              maxLength={100}
            />

            {/* 내용 */}
            <Text style={styles.editLabel}>내용</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={editContent}
              onChangeText={setEditContent}
              placeholder="숙제 내용 (선택)"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* 마감일 */}
            <Text style={styles.editLabel}>마감일</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={16} color="#5B50E8" />
              <Text style={styles.dateBtnText}>{formatDateTime(editDueDate)}</Text>
            </TouchableOpacity>

            {/* DateTimePicker */}
            {showDatePicker && (
              <DateTimePicker
                value={editDueDate}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_: DateTimePickerEvent, date?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) setEditDueDate(date);
                }}
                minimumDate={new Date()}
                locale="ko-KR"
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                style={styles.dateConfirmBtn}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.dateConfirmText}>확인</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pro 업그레이드 바텀시트 */}
      <ProUpgradeSheet
        visible={upgradeSheetVisible}
        onClose={hideUpgradeSheet}
        featureName="숙제 관리"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // 헤더
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#5B50E8',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  createBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // 반 필터
  filterBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#EEEDF9',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  filterBtnText: { fontSize: 14, fontWeight: '700', color: '#5B50E8' },

  // 반 선택 Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 16,
    gap: 4,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  modalItemActive: { backgroundColor: '#EEEDF9' },
  modalItemText: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  modalItemTextActive: { color: '#5B50E8' },

  // 로딩 / 빈 화면
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: '#5B50E8',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // 목록
  list: { padding: 16, gap: 12, paddingBottom: 32 },

  // 수정 모달
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  editSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, paddingHorizontal: 20,
  },
  editHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  editBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 12,
  },
  editSideBtn: { minWidth: 44 },
  editTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  editCancel: { fontSize: 15, color: '#64748B' },
  editSave: { fontSize: 15, fontWeight: '700', color: '#5B50E8' },
  editSaveDisabled: { color: '#CBD5E1' },
  editLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  editInput: {
    backgroundColor: '#F1F0FB', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: '#0F172A', marginBottom: 16,
  },
  editInputMulti: { height: 90, textAlignVertical: 'top' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F1F0FB', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12,
  },
  dateBtnText: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
  dateConfirmBtn: {
    backgroundColor: '#5B50E8', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  dateConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
