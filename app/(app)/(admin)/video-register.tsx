/**
 * app/(app)/(teacher)/video-register.tsx — 영상 등록 화면
 *
 * 선생님이 담당 반과 YouTube URL·영상 제목을 입력하여 영상을 등록한다.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import firestore from '@react-native-firebase/firestore';
import { Collections } from '../../../lib/firestore';

// RN Firebase serverTimestamp 헬퍼 (orderBy 기준 필드용)
const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
import { useAuthStore } from '../../../store/useAuthStore';
import ClassPickerSheet from '../../../components/ClassPickerSheet';
import ProUpgradeSheet from '../../../components/ProUpgradeSheet';
import { useProCheck } from '../../../hooks/useProCheck';
import { parseYouTubeVideoId, getYouTubeThumbnailUrl } from '../../../lib/youtube';
import { Class } from '../../../types';
import { Image } from 'react-native';

export default function VideoRegisterScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  // ─── 스탠다드+ 플랜 체크 ─────────────────────────────────────────────
  // 영상 기능은 standard/pro 전용 — Firestore Rules 에서도 차단되지만
  // 사용자에게는 화면 진입 즉시 시트로 명확히 안내한다.
  const { isPro, isLoaded: isProLoaded, upgradeSheetVisible, showUpgradeSheet, hideUpgradeSheet } =
    useProCheck();

  // 화면 진입 시 Pro 가 아니면 시트 표시 (academy 로드 완료 후)
  useEffect(() => {
    if (isProLoaded && !isPro) showUpgradeSheet();
    // showUpgradeSheet 는 useProCheck 내부에서 안정화됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProLoaded, isPro]);

  // ─── 입력 상태 ───────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // ─── 반 목록 ────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<Class[]>([]);

  // ─── 로딩 ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);

  // URL에서 파싱된 videoId (미리보기용)
  const parsedVideoId = parseYouTubeVideoId(youtubeUrl.trim());

  // 담당 반 목록 불러오기
  useEffect(() => {
    if (!user?.academy_id) return;
    (async () => {
      try {
        const snap = await Collections.classes()
          .where('academy_id', '==', user.academy_id)
          .get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        // 선생님이면 assigned_class_ids에 있는 반만 필터
        const filtered =
          user.assigned_class_ids?.length
            ? list.filter(c => user.assigned_class_ids!.includes(c.id))
            : list;
        setClasses(filtered);
        if (filtered.length === 1) setSelectedClassId(filtered[0].id);
      } catch (e) {
        console.error('[VideoRegister] 반 목록 조회 실패:', e);
      }
    })();
  }, [user?.academy_id]);

  // ─── 유효성 검사 ──────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!title.trim()) return '영상 제목을 입력해주세요.';
    if (!youtubeUrl.trim()) return 'YouTube URL을 입력해주세요.';
    if (!parsedVideoId) return '올바른 YouTube URL을 입력해주세요.\n(youtube.com 또는 youtu.be 링크)';
    if (!selectedClassId) return '반을 선택해주세요.';
    return null;
  };

  // ─── 등록 ─────────────────────────────────────────────────────────
  const handleRegister = async () => {
    // Pro 가드 — 무료/체험판/스타터 학원은 시트 표시 후 차단 (Rules 도 차단하지만 UX 보강)
    if (isProLoaded && !isPro) {
      showUpgradeSheet();
      return;
    }
    const error = validate();
    if (error) { Alert.alert('입력 오류', error); return; }
    if (!user?.uid || !parsedVideoId || !selectedClassId) return;

    setIsLoading(true);
    try {
      await Collections.videos().add({
        title: title.trim(),
        youtube_url: youtubeUrl.trim(),
        video_id: parsedVideoId,
        class_id: selectedClassId,
        academy_id: user.academy_id,
        created_by: user.uid,
        created_at: serverTimestamp(), // orderBy 기준 필드 — 반드시 serverTimestamp 사용
      });

      // 폼 초기화
      setTitle('');
      setYoutubeUrl('');
      setSelectedClassId(classes.length === 1 ? classes[0].id : null);

      Alert.alert('등록 완료', '영상이 등록되었어요.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('[VideoRegister] 등록 실패:', e);
      Alert.alert('오류', '영상 등록에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = !!title.trim() && !!parsedVideoId && !!selectedClassId && !isLoading;

  return (
    <>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>영상 등록</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── YouTube URL ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            YouTube URL <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              // URL이 입력됐지만 파싱 실패 시 빨간 테두리
              youtubeUrl.trim() && !parsedVideoId && styles.inputError,
            ]}
            placeholder="https://youtu.be/..."
            placeholderTextColor="#94A3B8"
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />
          {/* URL 유효성 안내 */}
          {youtubeUrl.trim() && (
            <Text style={parsedVideoId ? styles.urlValid : styles.urlInvalid}>
              {parsedVideoId
                ? '✓ 올바른 YouTube URL이에요'
                : '올바른 YouTube URL을 입력해주세요'}
            </Text>
          )}
        </View>

        {/* ── 썸네일 미리보기 (URL 파싱 성공 시) ── */}
        {parsedVideoId && (
          <View style={styles.previewWrapper}>
            <Image
              source={{ uri: getYouTubeThumbnailUrl(parsedVideoId, 'hq') }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <View style={styles.previewOverlay}>
              <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
        )}

        {/* ── 영상 제목 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            영상 제목 <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="영상 제목을 입력해주세요"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            returnKeyType="done"
          />
        </View>

        {/* ── 반 선택 ── */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            대상 반 <Text style={styles.required}>*</Text>
          </Text>
          <ClassPickerSheet
            mode="single"
            classes={classes}
            selectedId={selectedClassId}
            onSelect={setSelectedClassId}
            placeholder="반을 선택해주세요"
          />
        </View>

        {/* ── 등록 버튼 ── */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleRegister}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>영상 등록하기</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>

    {/* ── Pro 업그레이드 시트 ── */}
    <ProUpgradeSheet
      visible={upgradeSheetVisible}
      onClose={() => {
        hideUpgradeSheet();
        // Pro 가 아닌 사용자가 시트를 닫으면 화면 사용 의미 없음 → 뒤로 이동
        if (!isPro) router.back();
      }}
      featureName="영상 등록"
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

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
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  // ── 폼 ──
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569' },
  required: { color: '#EF4444' },

  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0F172A',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },

  // URL 유효성 안내 텍스트
  urlValid: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  urlInvalid: { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  // ── 썸네일 미리보기 ──
  previewWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  previewImage: { width: '100%', height: '100%' },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 등록 버튼 ──
  submitBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
