/**
 * app/(app)/(teacher)/video-list.tsx — 선생님 영상 관리 화면
 *
 * 담당 반에 등록된 YouTube 영상 목록을 조회하고,
 * 제목·URL 수정 및 삭제 기능을 제공한다.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { parseYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeWatchUrl } from '../../../lib/youtube';
import { Video, Class } from '../../../types';
import { Image } from 'react-native';

// 목록 아이템에 반 이름을 합쳐서 표시
interface VideoItem extends Video {
  className: string;
}

export default function VideoListScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── 수정 모달 상태 ────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<VideoItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 파싱된 videoId (수정 모달 미리보기용)
  const editParsedId = parseYouTubeVideoId(editUrl.trim());

  // 반 이름 조회용 Map — ref로 관리해 불필요한 리렌더 방지
  const classMapRef = useRef<Record<string, string>>({});

  // ── 1단계: 학원 전체 반 목록 조회 ────────────────────────────────────
  // classIds state 변경 시 2단계 onSnapshot이 자동으로 재구독됨
  const [classIds, setClassIds] = useState<string[]>([]);
  // 오류 시 "다시 시도" 버튼이 재조회를 트리거하도록 카운터 사용
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user?.academy_id) return;
    getDocs(
      query(Collections.classes(), where('academy_id', '==', user.academy_id))
    ).then(snap => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.id] = d.data().name; });
      classMapRef.current = map;
      const ids = snap.docs.map(d => d.id);
      setClassIds(ids);
      if (ids.length === 0) {
        // 반이 없으면 빈 목록으로 로딩 종료
        setVideos([]);
        setIsLoading(false);
      }
    }).catch(e => {
      console.error('[VideoList] 반 목록 조회 실패:', e);
      setError(true);
      setIsLoading(false);
    });
  }, [user?.academy_id, retryKey]);

  // ── 2단계: 영상 실시간 구독 ───────────────────────────────────────────
  // classIds 변경 시 재구독, 영상 추가·삭제·수정 즉시 반영
  useEffect(() => {
    if (classIds.length === 0) return;

    setIsLoading(true);
    setError(false);

    const q = query(
      Collections.videos(),
      where('class_id', 'in', classIds.slice(0, 30)),
      orderBy('created_at', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          className: classMapRef.current[d.data().class_id] ?? '알 수 없는 반',
        } as VideoItem));
        setVideos(list);
        setIsLoading(false);
      },
      e => {
        console.error('[VideoList] 영상 실시간 구독 실패:', e);
        setError(true);
        setIsLoading(false);
      }
    );

    // 컴포넌트 언마운트 또는 classIds 변경 시 구독 해제
    return () => unsubscribe();
  }, [classIds]);

  // ── 삭제 ─────────────────────────────────────────────────────────────
  const handleDelete = (video: VideoItem) => {
    Alert.alert(
      '영상 삭제',
      `"${video.title}" 영상을 삭제할까요?\n학생들도 더 이상 볼 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              // onSnapshot이 삭제를 자동으로 감지해 목록에서 제거함
              await deleteDoc(Collections.video(video.id));
            } catch (e) {
              console.error('[VideoList] 삭제 실패:', e);
              Alert.alert('오류', '삭제에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  };

  // ── YouTube 열기 ─────────────────────────────────────────────────────
  const handleVideoPress = async (video: VideoItem) => {
    const url = getYouTubeWatchUrl(video.video_id);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('오류', 'YouTube를 열 수 없어요. YouTube 앱을 설치해주세요.');
    }
  };

  // ── 수정 모달 열기 ────────────────────────────────────────────────────
  const openEdit = (video: VideoItem) => {
    setEditTarget(video);
    setEditTitle(video.title);
    setEditUrl(video.youtube_url);
  };

  // ── 수정 저장 ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editTarget) return;

    if (!editTitle.trim()) {
      Alert.alert('입력 오류', '영상 제목을 입력해주세요.');
      return;
    }
    if (!editParsedId) {
      Alert.alert('입력 오류', '올바른 YouTube URL을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      // onSnapshot이 수정 내용을 자동으로 감지해 목록에 반영함
      await updateDoc(Collections.video(editTarget.id), {
        title: editTitle.trim(),
        youtube_url: editUrl.trim(),
        video_id: editParsedId,
      });
      setEditTarget(null);
    } catch (e) {
      console.error('[VideoList] 수정 실패:', e);
      Alert.alert('오류', '수정에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 렌더: 영상 카드 ───────────────────────────────────────────────────
  const renderItem = ({ item }: { item: VideoItem }) => (
    // 카드 탭 → YouTube 앱(또는 브라우저)으로 이동
    // 내부 수정/삭제 버튼은 중첩 TouchableOpacity로 별도 처리
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleVideoPress(item)}
      activeOpacity={0.85}
    >
      {/* 썸네일 */}
      <Image
        source={{ uri: getYouTubeThumbnailUrl(item.video_id, 'hq') }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      {/* 정보 + 버튼 */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardClass}>{item.className}</Text>
        <View style={styles.cardActions}>
          {/* 수정 */}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openEdit(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={14} color="#5B50E8" />
            <Text style={styles.editBtnText}>수정</Text>
          </TouchableOpacity>
          {/* 삭제 */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={styles.deleteBtnText}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>영상 관리</Text>
        {/* 영상 등록 버튼 */}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(app)/(teacher)/video-register')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#5B50E8" />
        </TouchableOpacity>
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      )}

      {/* ── 오류 ── */}
      {!isLoading && error && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.emptyText}>목록을 불러오지 못했어요</Text>
          <TouchableOpacity
            onPress={() => { setError(false); setIsLoading(true); setRetryKey(k => k + 1); }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 빈 목록 ── */}
      {!isLoading && !error && videos.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="videocam-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>등록된 영상이 없어요</Text>
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => router.push('/(app)/(teacher)/video-register')}
            activeOpacity={0.85}
          >
            <Text style={styles.registerBtnText}>영상 등록하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 목록 ── */}
      {!isLoading && !error && videos.length > 0 && (
        <FlatList
          data={videos}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
          <View style={styles.modalSheet}>
            {/* 핸들바 */}
            <View style={styles.modalHandle} />

            {/* 타이틀 + 닫기 */}
            <View style={styles.modalBar}>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.modalSideBtn}>
                <Text style={styles.modalCancel}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>영상 수정</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving || !editTitle.trim() || !editParsedId}
                style={styles.modalSideBtn}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#5B50E8" />
                  : <Text style={[
                      styles.modalConfirm,
                      (!editTitle.trim() || !editParsedId) && styles.modalConfirmDisabled,
                    ]}>저장</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {/* YouTube URL */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>YouTube URL</Text>
                <TextInput
                  style={[
                    styles.input,
                    editUrl.trim() && !editParsedId && styles.inputError,
                  ]}
                  value={editUrl}
                  onChangeText={setEditUrl}
                  placeholder="https://youtu.be/..."
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {editUrl.trim() && (
                  <Text style={editParsedId ? styles.urlValid : styles.urlInvalid}>
                    {editParsedId ? '✓ 올바른 YouTube URL이에요' : '올바른 YouTube URL을 입력해주세요'}
                  </Text>
                )}
              </View>

              {/* 썸네일 미리보기 */}
              {editParsedId && (
                <Image
                  source={{ uri: getYouTubeThumbnailUrl(editParsedId, 'hq') }}
                  style={styles.previewThumb}
                  resizeMode="cover"
                />
              )}

              {/* 제목 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>영상 제목</Text>
                <TextInput
                  style={styles.input}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="영상 제목을 입력해주세요"
                  placeholderTextColor="#94A3B8"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22, fontWeight: '800', color: '#0F172A',
    letterSpacing: -0.5, marginLeft: 12,
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEEDF9',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 목록 ──
  list: { padding: 16, paddingBottom: 32 },

  // ── 카드 ──
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  thumbnail: {
    width: 110,
    aspectRatio: 16 / 9,
    height: undefined, // aspectRatio로 자동 높이
    alignSelf: 'stretch', // 카드 높이에 맞게 늘림
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 4,
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20 },
  cardClass: { fontSize: 12, color: '#64748B' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEEDF9',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  // ── 빈 상태 ──
  emptyText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  registerBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  registerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── 재시도 ──
  retryBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { fontSize: 14, fontWeight: '600', color: '#475569' },

  // ── 수정 모달 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  modalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSideBtn: { minWidth: 44 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  modalCancel: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  modalConfirm: { fontSize: 16, color: '#5B50E8', fontWeight: '700', textAlign: 'right' },
  modalConfirmDisabled: { color: '#CBD5E1' },

  modalContent: { padding: 20, gap: 16 },

  // ── 입력 필드 ──
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  urlValid: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  urlInvalid: { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  // 수정 모달 썸네일 미리보기
  previewThumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
});
