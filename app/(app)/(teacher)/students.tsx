/**
 * app/(app)/(teacher)/students.tsx — 선생님 학생 관리 화면
 *
 * - 담당반(assigned_class_ids) 학생 목록 조회
 * - admin 학생 탭과 동일한 UI
 * - 피드백 작성 기능 추가 (teacher_feedback 필드 업데이트)
 */

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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { User, Class } from '../../../types';

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
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────

export default function TeacherStudentsScreen() {
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  // URL 파라미터 — 프로필에서 특정 반 클릭 시 classId가 전달됨
  const { classId: initClassId } = useLocalSearchParams<{ classId?: string }>();

  // ── 데이터 상태 ──
  const [students, setStudents] = useState<User[]>([]);
  const [classes, setClasses]   = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── UI 상태 — initClassId가 있으면 해당 반을 초기 선택으로 설정 ──
  const [searchText, setSearchText]         = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(initClassId ?? null);

  // ── 피드백 모달 ──
  const [feedbackTarget, setFeedbackTarget]   = useState<User | null>(null);
  const [feedbackText, setFeedbackText]       = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // ── 학생 + 담당반 목록 로드 ──
  useEffect(() => {
    if (!user?.academy_id || !user?.assigned_class_ids?.length) {
      setIsLoading(false);
      return;
    }

    const assignedIds = user.assigned_class_ids;

    (async () => {
      try {
        // 담당반 정보 조회
        const classSnap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user.academy_id))
        );
        const allClasses = classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        const assignedClasses = allClasses.filter(c => assignedIds.includes(c.id));
        setClasses(assignedClasses);

        // 담당반 학생 조회 (활성만)
        const studentSnap = await getDocs(
          query(
            Collections.users(),
            where('academy_id', '==', user.academy_id),
            where('role', '==', 'student'),
            where('is_active', '==', true),
          )
        );
        const allStudents = studentSnap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
        // 담당반 학생만 필터링
        const myStudents = allStudents.filter(s => s.class_id && assignedIds.includes(s.class_id));
        setStudents(myStudents);
      } catch (e) {
        console.error('[TeacherStudents] 로드 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id, user?.assigned_class_ids?.join(',')]);

  // ── 반 이름 맵 ──
  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c])),
    [classes]
  );

  // ── 검색 + 반 필터 ──
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = !searchText.trim()
        || s.name?.toLowerCase().includes(searchText.toLowerCase());
      const matchClass = !selectedClassId || s.class_id === selectedClassId;
      return matchSearch && matchClass;
    });
  }, [students, searchText, selectedClassId]);

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
      await updateDoc(Collections.user(feedbackTarget.uid), {
        teacher_feedback: feedbackText.trim()
          ? {
              text: feedbackText.trim(),
              author_name: user.name,
              created_at: serverTimestamp(),
            }
          : null,
      });
      // 로컬 상태 업데이트
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
      console.error('[TeacherStudents] 피드백 저장 실패:', e);
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSavingFeedback(false);
    }
  }, [feedbackTarget, feedbackText, user]);

  // ── 로딩 ──
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.navigate('/(app)/(teacher)/profile')}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>학생 관리</Text>
          <Text style={styles.headerSub}>담당반 학생 {students.length}명</Text>
        </View>
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

      {/* ── 담당반 없음 안내 ── */}
      {classes.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>담당반이 없어요</Text>
        </View>
      )}

      {/* ── 학생 목록 ── */}
      {classes.length > 0 && filteredStudents.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {searchText ? '검색 결과가 없어요' : '담당반 학생이 없어요'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const cls = item.class_id ? classMap[item.class_id] : null;
            const avatarStyle = getAvatarStyle(item.name ?? '?');
            const hasFeedback = !!item.teacher_feedback?.text;

            return (
              <View style={styles.row}>
                {/* 아바타 */}
                <View style={[styles.avatar, { backgroundColor: avatarStyle.bg }]}>
                  <Text style={[styles.avatarText, { color: avatarStyle.text }]}>
                    {item.name?.charAt(0) ?? '?'}
                  </Text>
                </View>

                {/* 이름 + 서브 정보 */}
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>{cls ? cls.name : '반 미배정'}</Text>
                  {/* 저장된 피드백 미리보기 */}
                  {hasFeedback && (
                    <Text style={styles.feedbackPreview} numberOfLines={1}>
                      📝 {item.teacher_feedback!.text}
                    </Text>
                  )}
                </View>

                {/* 피드백 버튼 */}
                <TouchableOpacity
                  style={[styles.feedbackBtn, hasFeedback && styles.feedbackBtnFilled]}
                  onPress={() => openFeedbackModal(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.feedbackBtnText, hasFeedback && styles.feedbackBtnTextFilled]}>
                    {hasFeedback ? '수정' : '피드백'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ── 피드백 작성 모달 ── */}
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
            style={styles.saveBtn}
            onPress={handleSaveFeedback}
            disabled={isSavingFeedback}
            activeOpacity={0.85}
          >
            {isSavingFeedback
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>저장</Text>
            }
          </TouchableOpacity>

          {/* 피드백 삭제 (기존 피드백 있을 때만) */}
          {!!feedbackTarget?.teacher_feedback?.text && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => {
                setFeedbackText('');
                // 빈 값으로 저장하면 null 처리됨
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteBtnText}>피드백 삭제</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setFeedbackTarget(null)}
          >
            <Text style={styles.cancelBtnText}>취소</Text>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSub:   { fontSize: 13, color: '#64748B', marginTop: 2 },

  // ── 검색창 ──
  searchWrapper: { paddingHorizontal: 16, paddingVertical: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F0FB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A', padding: 0 },

  // ── 반 필터 탭 ──
  tabBar:    { maxHeight: 44, marginBottom: 4 },
  tabContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 6, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  tabActive:     { backgroundColor: '#5B50E8', borderColor: '#5B50E8' },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#fff' },

  // ── 학생 목록 ──
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  separator:   { height: 1, backgroundColor: '#F1F5F9' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },

  // 아바타
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },

  // 이름 + 서브
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  sub:  { fontSize: 13, color: '#64748B' },
  feedbackPreview: { fontSize: 12, color: '#5B50E8', marginTop: 2 },

  // 피드백 버튼
  feedbackBtn: {
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  feedbackBtnFilled: { backgroundColor: '#EEEDF9', borderColor: '#5B50E8' },
  feedbackBtnText:       { fontSize: 13, fontWeight: '600', color: '#64748B' },
  feedbackBtnTextFilled: { color: '#5B50E8' },

  emptyText: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },

  // ── 모달 ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 16,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  modalSub:   { fontSize: 14, color: '#64748B', marginBottom: 16 },

  feedbackInput: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    padding: 14, fontSize: 15, color: '#0F172A',
    minHeight: 120,
  },
  charCount: { fontSize: 12, color: '#94A3B8', textAlign: 'right', marginTop: 6, marginBottom: 4 },

  saveBtn: {
    marginTop: 8, height: 52, borderRadius: 14,
    backgroundColor: '#5B50E8', alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  deleteBtn: {
    marginTop: 8, paddingVertical: 14,
    backgroundColor: '#FEF2F2', borderRadius: 14, alignItems: 'center',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  cancelBtn: {
    marginTop: 8, paddingVertical: 14,
    backgroundColor: '#F1F5F9', borderRadius: 14, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '700', color: '#334155' },
});
