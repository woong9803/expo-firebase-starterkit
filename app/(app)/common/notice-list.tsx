/**
 * app/(app)/common/notice-list.tsx — 공지사항 목록 (전 역할 공유)
 *
 * showCreateButton=true 이면 우상단에 '+' 버튼 표시 (선생님/admin 전용).
 * 역할별 notices.tsx에서 이 화면을 래핑해서 사용한다.
 *
 * 사용 예시:
 *   // (teacher)/notices.tsx
 *   <NoticeListScreen showCreateButton onCreatePress={() => router.push('...')} />
 *
 *   // (parent)/notices.tsx
 *   <NoticeListScreen />
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../../../store/useAuthStore';
import { subscribeNotices, updateNotice, deleteNotice } from '../../../lib/notice';
import NoticeCard from '../../../components/NoticeCard';
import { strings } from '../../../constants/strings';
import type { Notice } from '../../../types';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface Props {
  showCreateButton?: boolean;  // true면 우상단 '+' 버튼 표시
  onCreatePress?: () => void;  // '+' 버튼 탭 콜백
  showEditButtons?: boolean;   // true면 각 카드에 수정/삭제 버튼 표시 (선생님/admin)
}

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 유틸
// ─────────────────────────────────────────────────────────────

function formatDate(notice: Notice): string {
  if (!notice.created_at) return '';
  const d = notice.created_at.toDate();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// ─────────────────────────────────────────────────────────────
// NoticeListScreen
// ─────────────────────────────────────────────────────────────

export default function NoticeListScreen({ showCreateButton, onCreatePress, showEditButtons }: Props) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const navigation = useNavigation();
  // 이전 화면이 있으면(탭이 아닌 push 진입) 뒤로가기 버튼 표시
  const canGoBack = navigation.canGoBack();

  const [notices, setNotices]     = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── 수정 모달 상태 ──
  const [editTarget, setEditTarget]         = useState<Notice | null>(null);
  const [editTitle, setEditTitle]           = useState('');
  const [editContent, setEditContent]       = useState('');
  const [editIsImportant, setEditIsImportant] = useState(false);
  const [isSaving, setIsSaving]             = useState(false);

  // ── 실시간 공지 목록 구독 ──
  useEffect(() => {
    if (!user?.academy_id) return;

    setIsLoading(true);
    // 학생: 본인 반 공지만, 학부모: 역할 기반 필터링
    const viewerClassId = user.role === 'student' ? (user.class_id ?? null) : null;
    const viewerRole = (user.role === 'student' || user.role === 'parent') ? user.role : null;
    const unsub = subscribeNotices(user.academy_id, (list) => {
      setNotices(list);
      setIsLoading(false);
    }, viewerClassId, viewerRole);

    // cleanup — 화면 언마운트 시 구독 해제
    return () => unsub();
  // user.class_id(반 배정 변경)·role 변화 시 구독 갱신이 필요하므로 의존성 포함
  }, [user?.academy_id, user?.class_id, user?.role]);

  // ── 중요 공지 상단 정렬 (subscribeNotices가 이미 is_important desc로 정렬하지만
  //    클라이언트에서 한 번 더 보장) ──
  const sortedNotices = useMemo(() => {
    const important = notices.filter((n) => n.is_important);
    const normal    = notices.filter((n) => !n.is_important);
    return [...important, ...normal];
  }, [notices]);

  // ── 공지 카드 탭 → 상세 화면 이동 ──
  const handleNoticePress = (noticeId: string) => {
    router.push(`/common/notice-detail?noticeId=${noticeId}`);
  };

  // ── 수정 모달 열기 ──
  const openEdit = (notice: Notice) => {
    setEditTarget(notice);
    setEditTitle(notice.title);
    setEditContent(notice.content);
    setEditIsImportant(notice.is_important);
  };

  // ── 수정 저장 ──
  const handleSave = async () => {
    if (!editTarget || !editTitle.trim() || !editContent.trim()) return;
    setIsSaving(true);
    try {
      await updateNotice(editTarget.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        isImportant: editIsImportant,
      });
      setEditTarget(null);
    } catch {
      Alert.alert('오류', '수정에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 삭제 ──
  const handleDelete = (notice: Notice) => {
    Alert.alert(
      '공지 삭제',
      `"${notice.title}" 공지를 삭제할까요?\n삭제한 공지는 복구할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotice(notice.id);
            } catch {
              Alert.alert('오류', '삭제에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        {/* 뒤로가기 버튼 — push로 진입한 경우(학생 등)에만 표시 */}
        {canGoBack && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{strings.notice.title}</Text>
        {showCreateButton && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={onCreatePress}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={26} color="#5B50E8" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#5B50E8" size="large" />
        </View>
      )}

      {/* ── 목록 ── */}
      {!isLoading && (
        <FlatList
          data={sortedNotices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <NoticeCard
              title={item.title}
              content={item.content}
              isImportant={item.is_important}
              createdAt={formatDate(item)}
              onPress={() => handleNoticePress(item.id)}
              onEdit={showEditButtons ? () => openEdit(item) : undefined}
              onDelete={showEditButtons ? () => handleDelete(item) : undefined}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{strings.notice.noNotice}</Text>
            </View>
          }
        />
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
          <TouchableOpacity
            style={styles.modalBg}
            activeOpacity={1}
            onPress={() => setEditTarget(null)}
          />
          <View style={styles.modalSheet}>
            {/* 핸들바 */}
            <View style={styles.modalHandle} />

            {/* 헤더 */}
            <View style={styles.modalBar}>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.modalSideBtn}>
                <Text style={styles.modalCancel}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>공지 수정</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving || !editTitle.trim() || !editContent.trim()}
                style={styles.modalSideBtn}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#5B50E8" />
                  : <Text style={[
                      styles.modalSave,
                      (!editTitle.trim() || !editContent.trim()) && styles.modalSaveDisabled,
                    ]}>저장</Text>
                }
              </TouchableOpacity>
            </View>

            {/* 중요 공지 토글 */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>중요 공지</Text>
              <Switch
                value={editIsImportant}
                onValueChange={setEditIsImportant}
                trackColor={{ false: '#E2E8F0', true: '#EF4444' }}
                thumbColor="#fff"
              />
            </View>

            {/* 제목 입력 */}
            <Text style={styles.inputLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="공지 제목"
              placeholderTextColor="#94A3B8"
              maxLength={100}
            />

            {/* 내용 입력 */}
            <Text style={styles.inputLabel}>내용</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={editContent}
              onChangeText={setEditContent}
              placeholder="공지 내용"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 4,
    marginRight: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  createBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 로딩/빈 상태 중앙 박스 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 목록 ──
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // ── 빈 상태 ──
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },

  // ── 수정 모달 ──
  modalOverlay: { flex: 1 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, paddingHorizontal: 20,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  modalSideBtn: { minWidth: 44 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  modalCancel: { fontSize: 15, color: '#64748B' },
  modalSave: { fontSize: 15, fontWeight: '700', color: '#5B50E8' },
  modalSaveDisabled: { color: '#CBD5E1' },

  // 중요 공지 토글 행
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },

  // 입력 필드
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: '#0F172A',
    marginBottom: 16,
  },
  inputMulti: {
    height: 120,
    textAlignVertical: 'top',
  },
});
