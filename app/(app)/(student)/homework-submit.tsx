/**
 * app/(app)/(student)/homework-submit.tsx — 학생 숙제 카메라 스캔 + 제출 화면
 *
 * 플로우: 카메라 촬영 → 미리보기 → 압축(200KB) → Storage 업로드 → Firestore 저장
 * 최대 5장, 재제출 시 확인 다이얼로그, 마감 초과 시 is_late: true 자동 기록
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Homework, Submission } from '../../../types';

// AsyncStorage 키 — 업로드 실패 시 임시저장용
const PENDING_KEY = 'pendingSubmission';

// ── 상수 ───────────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 5;
const TARGET_SIZE_KB = 200;

// ── 화면 단계 ──────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'camera' | 'preview' | 'uploading' | 'done';

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function HomeworkSubmitScreen() {
  const router = useRouter();
  const { hwId, skipAlert, restorePending } = useLocalSearchParams<{
    hwId: string;
    skipAlert?: string;
    restorePending?: string; // 'true' 이면 AsyncStorage에서 사진 복원
  }>();
  const { user } = useAuthStore();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [homework, setHomework] = useState<Homework | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);
  const [photos, setPhotos] = useState<string[]>([]); // 로컬 URI 배열
  const [uploadProgress, setUploadProgress] = useState(0); // 0~1

  // 카메라 시작 트리거: 데이터 로드 완료 후 true로 세팅
  // (permission이 아직 null일 수 있으므로 별도 effect에서 처리)
  const [shouldStartCamera, setShouldStartCamera] = useState(false);

  // 연속 업로드 실패 횟수 (3회 이상이면 안내 토스트만 표시)
  const failCountRef = useRef(0);

  // ── 초기 데이터 로드 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hwId || !user?.uid) return;

    (async () => {
      try {
        // 숙제 정보 조회
        const hwSnap = await getDoc(Collections.homework(hwId));
        if (!hwSnap.exists()) {
          Alert.alert('오류', '숙제를 찾을 수 없어요.');
          router.back();
          return;
        }
        setHomework({ id: hwSnap.id, ...hwSnap.data() } as Homework);

        // 임시저장본 복원 (homework.tsx에서 restorePending=true로 진입한 경우)
        if (restorePending === 'true') {
          const json = await AsyncStorage.getItem(PENDING_KEY);
          if (json) {
            const saved = JSON.parse(json);
            if (saved.hwId === hwId && Array.isArray(saved.uris) && saved.uris.length > 0) {
              setPhotos(saved.uris);
              setPhase('preview'); // 미리보기 화면으로 바로 이동
              return;
            }
          }
        }

        // 기존 제출물 확인
        const subSnap = await getDoc(Collections.submission(hwId, user.uid));
        if (subSnap.exists()) {
          setExistingSubmission(subSnap.data() as Submission);
          if (skipAlert === 'true') {
            // 수정하기/다시제출하기에서 진입 → 알림 없이 카메라로
            setShouldStartCamera(true);
          } else {
            Alert.alert(
              '이미 제출했어요',
              '다시 제출하면 이전 제출물이 사라져요. 재제출할까요?',
              [
                { text: '취소', style: 'cancel', onPress: () => router.back() },
                { text: '재제출', style: 'destructive', onPress: () => setShouldStartCamera(true) },
              ]
            );
          }
        } else {
          setShouldStartCamera(true);
        }
      } catch (e) {
        console.error('[HomeworkSubmit] 초기 로드 실패:', e);
        Alert.alert('오류', '데이터를 불러오지 못했어요.');
        router.back();
      }
    })();
  }, [hwId, user?.uid, skipAlert, restorePending, router]);

  // ── 카메라 시작 effect — permission 로드 완료 후 실행 ───────────────────────
  // permission이 null이면 useCameraPermissions가 아직 초기화 중이므로 대기
  useEffect(() => {
    if (!shouldStartCamera || permission === null) return;

    setShouldStartCamera(false);

    if (permission.granted) {
      setPhase('camera');
    } else {
      requestPermission().then((result) => {
        if (result.granted) {
          setPhase('camera');
        } else {
          Alert.alert(
            '카메라 권한 필요',
            '설정에서 카메라 권한을 허용해주세요.',
            [{ text: '확인', onPress: () => router.back() }]
          );
        }
      });
    }
  }, [shouldStartCamera, permission, requestPermission, router]);

  // ── 사진 촬영 ────────────────────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || photos.length >= MAX_PHOTOS) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setPhotos(prev => [...prev, photo.uri]);
      }
    } catch (e) {
      console.error('[HomeworkSubmit] 촬영 실패:', e);
    }
  }, [photos.length]);

  // ── 사진 삭제 ────────────────────────────────────────────────────────────
  const removePhoto = useCallback((index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── 이미지 압축 (목표 200KB 이하) ──────────────────────────────────────────
  const compressImage = async (uri: string): Promise<string> => {
    // 1단계: 리사이즈 (최대 1280px)
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 2단계: 200KB 초과면 추가 압축
    const response = await fetch(resized.uri);
    const blob = await response.blob();
    if (blob.size > TARGET_SIZE_KB * 1024) {
      const compressed = await ImageManipulator.manipulateAsync(
        resized.uri,
        [],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      return compressed.uri;
    }
    return resized.uri;
  };

  // ── 제출하기 ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!hwId || !user?.uid || photos.length === 0 || !homework) return;

    setPhase('uploading');
    setUploadProgress(0);

    try {
      const downloadUrls: string[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < photos.length; i++) {
        // 압축
        const compressedUri = await compressImage(photos[i]);

        // Storage 업로드
        const storageRef = ref(
          storage,
          `homeworks/${hwId}/${user.uid}/${timestamp}_${i}.jpg`
        );
        const imageBlob = await (await fetch(compressedUri)).blob();
        await uploadBytes(storageRef, imageBlob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(storageRef);
        downloadUrls.push(url);

        setUploadProgress((i + 1) / photos.length);
      }

      // 마감 초과 여부 판단
      const now = new Date();
      const dueDate = (homework.due_date as any).toDate() as Date;
      const isLate = now > dueDate;

      // Firestore 저장 (재제출 시 덮어쓰기)
      await setDoc(Collections.submission(hwId, user.uid), {
        image_urls: downloadUrls,
        status: 'submitted',
        is_late: isLate,
        feedback: null,
        submitted_at: serverTimestamp(),
      });

      // 업로드 성공 → 임시저장본 삭제, 실패 카운터 초기화
      await AsyncStorage.removeItem(PENDING_KEY);
      failCountRef.current = 0;

      setPhase('done');
    } catch (e) {
      console.error('[HomeworkSubmit] 제출 실패:', e);

      // 실패 시 사진 URI를 AsyncStorage에 임시저장
      try {
        await AsyncStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ hwId, uris: photos, title: homework?.title ?? '' })
        );
      } catch (storageErr) {
        console.warn('[HomeworkSubmit] 임시저장 실패:', storageErr);
      }

      failCountRef.current += 1;
      setPhase('preview');

      if (failCountRef.current >= 3) {
        // 3회 연속 실패 → 나중에 이어서 제출 안내
        Alert.alert(
          '임시 저장됨',
          '계속 실패해서 사진을 임시 저장했어요.\n숙제 화면에서 다시 이어서 제출할 수 있어요.',
          [{ text: '확인', style: 'default' }]
        );
      } else {
        // 1~2회 실패 → 재시도 안내
        Alert.alert(
          '제출 실패',
          '사진이 임시 저장됐어요.\n네트워크를 확인하고 아래 제출하기를 눌러주세요.',
          [{ text: '확인', style: 'default' }]
        );
      }
    }
  }, [hwId, user?.uid, photos, homework]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  // 초기 로딩
  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  // 완료 화면
  if (phase === 'done') {
    return (
      <SafeAreaView style={styles.doneContainer}>
        <View style={styles.doneContent}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          </View>
          <Text style={styles.doneTitle}>제출 완료!</Text>
          <Text style={styles.doneDesc}>
            선생님이 확인하면{'\n'}피드백을 알려드릴게요
          </Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.navigate('/(app)/(student)/homework')}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>숙제 목록으로</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 업로드 중
  if (phase === 'uploading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#5B50E8" size="large" />
        <Text style={styles.uploadingText}>제출 중...</Text>
        <Text style={styles.uploadingProgress}>
          {Math.round(uploadProgress * 100)}%
        </Text>
        <View style={styles.uploadProgressTrack}>
          <View style={[styles.uploadProgressFill, { width: `${uploadProgress * 100}%` as any }]} />
        </View>
      </View>
    );
  }

  // 미리보기 화면
  if (phase === 'preview') {
    return (
      <SafeAreaView style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPhase('camera')} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>미리보기</Text>
            <Text style={styles.headerSub}>{photos.length}장 · {homework?.title}</Text>
          </View>
        </View>

        {/* 사진 그리드 */}
        <ScrollView contentContainerStyle={styles.previewGrid}>
          {photos.map((uri, idx) => (
            <View key={idx} style={styles.previewItem}>
              <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => removePhoto(idx)}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle" size={22} color="#EF4444" />
              </TouchableOpacity>
              <View style={styles.previewIndex}>
                <Text style={styles.previewIndexText}>{idx + 1}</Text>
              </View>
            </View>
          ))}
          {/* 사진 추가 버튼 (5장 미만일 때) */}
          {photos.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addMoreBtn} onPress={() => setPhase('camera')} activeOpacity={0.8}>
              <Ionicons name="add" size={32} color="#94A3B8" />
              <Text style={styles.addMoreText}>추가</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* 제출 버튼 */}
        <View style={styles.previewFooter}>
          <TouchableOpacity style={styles.retakeBtn} onPress={() => setPhase('camera')} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={16} color="#5B50E8" />
            <Text style={styles.retakeBtnText}>다시 찍기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, photos.length === 0 && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={photos.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={16} color="#fff" />
            <Text style={styles.submitBtnText}>제출하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 카메라 화면
  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* 상단 오버레이 */}
        <SafeAreaView style={styles.cameraTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cameraCloseBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.cameraInfo}>
            <Text style={styles.cameraTitle}>{homework?.title ?? '숙제 제출'}</Text>
            <Text style={styles.cameraCount}>{photos.length} / {MAX_PHOTOS}장</Text>
          </View>
        </SafeAreaView>

        {/* 촬영한 사진 썸네일 목록 */}
        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbnailBar}
            contentContainerStyle={styles.thumbnailBarContent}
          >
            {photos.map((uri, idx) => (
              <TouchableOpacity key={idx} onPress={() => setPhase('preview')} activeOpacity={0.85}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity style={styles.thumbDeleteBtn} onPress={() => removePhoto(idx)}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 하단: 촬영 버튼 */}
        <SafeAreaView style={styles.cameraBottom}>
          {photos.length > 0 && (
            <TouchableOpacity
              style={styles.previewGoBtn}
              onPress={() => setPhase('preview')}
              activeOpacity={0.85}
            >
              <Text style={styles.previewGoBtnText}>미리보기 →</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.shutterBtn, photos.length >= MAX_PHOTOS && styles.shutterBtnDisabled]}
            onPress={takePhoto}
            disabled={photos.length >= MAX_PHOTOS}
            activeOpacity={0.85}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <Text style={styles.shutterHint}>
            {photos.length >= MAX_PHOTOS ? '최대 5장까지 가능해요' : '탭하여 촬영'}
          </Text>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // 로딩 / 완료 공통 중앙 정렬
  center: {
    flex: 1, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },

  // ── 완료 화면
  doneContainer: { flex: 1, backgroundColor: '#fff' },
  doneContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  doneIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  doneTitle: { fontSize: 26, fontWeight: '800', color: '#0F172A' },
  doneDesc: { fontSize: 16, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    marginTop: 16,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── 업로드 중
  uploadingText: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  uploadingProgress: { fontSize: 30, fontWeight: '800', color: '#5B50E8' },
  uploadProgressTrack: {
    width: 200, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden',
  },
  uploadProgressFill: { height: '100%', backgroundColor: '#5B50E8', borderRadius: 3 },

  // ── 헤더 (미리보기)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 13, color: '#64748B', marginTop: 2 },

  // ── 미리보기 그리드
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  previewItem: { width: '47%', aspectRatio: 1, position: 'relative' },
  previewImage: { width: '100%', height: '100%', borderRadius: 12 },
  deleteBtn: { position: 'absolute', top: 6, right: 6, zIndex: 1 },
  previewIndex: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  previewIndexText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  addMoreBtn: {
    width: '47%', aspectRatio: 1,
    borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addMoreText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },

  // ── 미리보기 하단 버튼
  previewFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#5B50E8',
    backgroundColor: '#fff',
  },
  retakeBtnText: { fontSize: 15, fontWeight: '700', color: '#5B50E8' },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
  },
  submitBtnDisabled: { backgroundColor: '#CBD5E1' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── 카메라
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cameraCloseBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraInfo: { alignItems: 'flex-end' },
  cameraTitle: { fontSize: 15, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  cameraCount: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // 썸네일 바
  thumbnailBar: { position: 'absolute', bottom: 160, left: 0, right: 0 },
  thumbnailBarContent: { paddingHorizontal: 16, gap: 8 },
  thumbImg: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  thumbDeleteBtn: { position: 'absolute', top: -6, right: -6 },

  // 카메라 하단
  cameraBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingBottom: 24,
    gap: 12,
  },
  previewGoBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  previewGoBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterBtnDisabled: { opacity: 0.4 },
  shutterInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#E2E8F0',
  },
  shutterHint: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
});
