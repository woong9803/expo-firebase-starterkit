/**
 * app/(app)/(admin)/video-list.tsx — 원장님 영상 관리 화면
 *
 * 학원 전체 반에 등록된 YouTube 영상 목록을 조회하고,
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
  Image,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { parseYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeWatchUrl } from '../../../lib/youtube';
import { Video, Class } from '../../../types';

// 목록 아이템에 반 이름을 합쳐서 표시
interface VideoItem extends Video {
  className: string;
}

export default function AdminVideoListScreen() {
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
  const [classIds, setClassIds] = useState<string[]>([]);
  // 오류 시 "다시 시도" 버튼이 재조회를 트리거하도록 카운터 사용
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user?.academy_id) return;
    Collections.classes()
      .where('academy_id', '==', user.academy_id)
      .get()
      .then(snap => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.id] = (d.data() as Class).name; });
      classMapRef.current = map;
      const ids = snap.docs.map(d => d.id);
      setClassIds(ids);
      if (ids.length === 0) {
        setVideos([]);
        setIsLoading(false);
      }
    }).catch(e => {
      console.error('[AdminVideoList] 반 목록 조회 실패:', e);
      setError(true);
      setIsLoading(false);
    });
  }, [user?.academy_id, retryKey]);

  // ── 2단계: 영상 실시간 구독 ───────────────────────────────────────────
  // classIds 변경 시 재구독, 선생님/어드민의 영상 추가·삭제·수정 즉시 반영
  useEffect(() => {
    if (classIds.length === 0) return;

    setIsLoading(true);
    setError(false);

    // RN Firebase 체이닝 API — where('in')은 최대 30개까지 지원
    const unsubscribe = Collections.videos()
      .where('class_id', 'in', classIds.slice(0, 30))
      .orderBy('created_at', 'desc')
      .onSnapshot(
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
          console.error('[AdminVideoList] 영상 실시간 구독 실패:', e);
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
              await Collections.video(video.id).delete();
            } catch {
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
    if (!editTarget || !editTitle.trim() || !editParsedId) return;
    setIsSaving(true);
    try {
      // onSnapshot이 수정 내용을 자동으로 감지해 목록에 반영함
      await Collections.video(editTarget.id).update({
        title: editTitle.trim(),
        youtube_url: editUrl.trim(),
        video_id: editParsedId,
      });
      setEditTarget(null);
    } catch {
      Alert.alert('오류', '수정에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 카드 렌더링 ───────────────────────────────────────────────────────
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
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)} activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={14} color="#5B50E8" />
            <Text style={styles.editBtnText}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)} activeOpacity={0.8}>
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
      <View style={[styles.header, { paddingTop: 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>영상 관리</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(app)/(admin)/video-register')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#5B50E8" />
        </TouchableOpacity>
      </View>

      {/* ── 콘텐츠 ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>불러오기 실패</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setError(false); setIsLoading(true); setRetryKey(k => k + 1); }}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="videocam-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>등록된 영상이 없어요</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/(app)/(admin)/video-register')}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyBtnText}>영상 등록하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
            <Text style={styles.modalTitle}>영상 수정</Text>

            {/* URL 입력 */}
            <Text style={styles.modalLabel}>YouTube URL</Text>
            <TextInput
              style={[styles.modalInput, editUrl.trim() && !editParsedId && styles.inputError]}
              value={editUrl}
              onChangeText={setEditUrl}
              placeholder="https://youtu.be/..."
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {editUrl.trim() && (
              <Text style={editParsedId ? styles.urlValid : styles.urlInvalid}>
                {editParsedId ? '✓ 올바른 YouTube URL이에요' : '올바른 YouTube URL을 입력해주세요'}
              </Text>
            )}

            {/* 썸네일 미리보기 */}
            {editParsedId && (
              <View style={styles.editPreview}>
                <Image
                  source={{ uri: getYouTubeThumbnailUrl(editParsedId, 'hq') }}
                  style={styles.editPreviewImg}
                  resizeMode="cover"
                />
                <View style={styles.editPreviewOverlay}>
                  <Ionicons name="play-circle" size={28} color="rgba(255,255,255,0.9)" />
                </View>
              </View>
            )}

            {/* 제목 입력 */}
            <Text style={styles.modalLabel}>영상 제목</Text>
            <TextInput
              style={styles.modalInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="영상 제목을 입력해주세요"
              placeholderTextColor="#94A3B8"
            />

            {/* 저장 버튼 */}
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!editTitle.trim() || !editParsedId || isSaving) && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={!editTitle.trim() || !editParsedId || isSaving}
              activeOpacity={0.85}
            >
              {isSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>저장하기</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // ── 헤더 ──
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEEDF9',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 목록 ──
  list: { padding: 16, gap: 12, paddingBottom: 32 },

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
    height: undefined,
    alignSelf: 'stretch',
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
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEEDF9', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  // ── 상태 ──
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#475569' },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#5B50E8',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  errorText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
  retryBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { fontSize: 14, color: '#5B50E8', fontWeight: '700' },

  // ── 수정 모달 ──
  modalOverlay: { flex: 1 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingBottom: 40, paddingHorizontal: 20,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  modalInput: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: '#0F172A',
  },
  inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  urlValid: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  urlInvalid: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  editPreview: {
    width: '100%', aspectRatio: 16 / 9,
    borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  editPreviewImg: { width: '100%', height: '100%' },
  editPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
