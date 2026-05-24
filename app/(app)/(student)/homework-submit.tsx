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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  getInfoAsync,
} from 'expo-file-system/legacy';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Homework, Submission } from '../../../types';

// AsyncStorage 키 — 업로드 실패 시 임시저장용
const PENDING_KEY = 'pendingSubmission';

/**
 * Firebase Storage REST API + FormData로 파일 업로드.
 *
 * Firebase JS SDK의 uploadBytes/uploadString은 React Native Hermes 엔진에서
 * 내부적으로 Blob(ArrayBuffer) 생성을 시도해 오류 발생.
 * React Native의 네이티브 네트워킹 레이어는 FormData에 { uri, type, name } 객체를
 * 넣으면 로컬 파일을 직접 읽어 멀티파트로 전송함 — JS 레벨 Blob 불필요.
 *
 * @returns Firebase Storage 다운로드 URL
 */
const uploadToFirebaseStorage = async (
  fileUri: string,
  storagePath: string,
  contentType: string
): Promise<string> => {
  // Firebase 인증 토큰 발급
  const currentUser = auth().currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;
  if (!token) throw new Error('인증 토큰 없음');

  const bucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;

  // React Native FormData — { uri, type, name } 형태로 로컬 파일 직접 첨부
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: contentType,
    name: storagePath.split('/').pop() ?? 'photo.jpg',
  } as any);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage 업로드 실패 (${res.status}): ${err}`);
  }

  const json = await res.json();
  // 다운로드 URL 조립
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${json.downloadTokens}`;
};

// ── 상수 ───────────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 5;
const TARGET_SIZE_KB = 200;

// ── 화면 단계 ──────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'camera' | 'preview' | 'uploading' | 'done';

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function HomeworkSubmitScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
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

    // hwId가 바뀔 때마다 이전 숙제의 사진·상태를 초기화
    // (expo-router가 화면을 캐시하므로 명시적으로 리셋 필요)
    setPhotos([]);
    setExistingSubmission(null);
    setPhase('loading');

    (async () => {
      try {
        // 숙제 정보 조회
        const hwSnap = await Collections.homework(hwId).get();
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
        const subSnap = await Collections.submission(hwId, user.uid).get();
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
  // quality 0.5 + skipProcessing 으로 카메라가 반환하는 이미지 자체를 작게 받아
  // 미리보기 ScrollView에 4~5장 동시 렌더해도 실기기에서 OOM 크래시 안 나도록 함.
  // 최종 압축(200KB 이하)은 제출 직전 compressImage 가 담당.
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || photos.length >= MAX_PHOTOS) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });
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

    // 2단계: 200KB 초과면 추가 압축 (getInfoAsync로 파일 크기 조회 — fetch/XHR 불필요)
    const info = await getInfoAsync(resized.uri);
    const fileSize = (info as any).size ?? 0;
    if (fileSize > TARGET_SIZE_KB * 1024) {
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
        // Firebase SDK Blob 문제 우회 → REST API + FormData로 직접 업로드
        const storagePath = `homeworks/${hwId}/${user.uid}/${timestamp}_${i}.jpg`;
        const url = await uploadToFirebaseStorage(
          compressedUri,
          storagePath,
          'image/jpeg'
        );
        downloadUrls.push(url);

        setUploadProgress((i + 1) / photos.length);
      }

      // is_late 와 streak 는 서버에서 결정한다.
      //   · is_late: onSubmissionCreated 트리거가 서버 시간 vs due_date 로 교정
      //   · streak: 동 트리거가 마감 전 신규 제출에 +1, 지각이면 0 으로 초기화
      // 클라이언트 시계 조작(기기 시간 변경)으로 지각을 회피하거나 스트릭을
      // 부풀리는 공격을 차단하기 위함. 일단 false 로 보내도 서버가 즉시 교정.
      // Firestore 저장
      // 최초 제출: setDoc 으로 전체 필드 생성
      // 재제출(다시풀기 후): updateDoc 으로 변경 허용 필드만 — Rules 정책상
      //   학생은 image_urls/status/submitted_at/is_late/feedback(null로 리셋) 만 변경 가능
      //   feedback_comment 같은 다른 필드를 같이 보내면 permission denied 발생
      if (existingSubmission) {
        await Collections.submission(hwId, user.uid).update({
          image_urls: downloadUrls,
          status: 'submitted',
          is_late: false,    // 서버 트리거가 즉시 교정 — 클라 시계 신뢰 안 함
          submitted_at: serverTimestamp(),
          feedback: null,    // 다시풀기 피드백 리셋 — 새 검사 대기 상태로
          is_retry: true,    // 학생 화면에서 "다시푸는중" 표시 — 선생님 검사 후에도 유지
        });
      } else {
        await Collections.submission(hwId, user.uid).set({
          image_urls: downloadUrls,
          status: 'submitted',
          is_late: false,    // 서버 트리거가 즉시 교정
          feedback: null,
          submitted_at: serverTimestamp(),
        });
      }

      // 스트릭은 onSubmissionCreated 트리거에서 처리 — 클라이언트는 user.streak 에 쓰지 않음
      // (사용자 화면 새로고침 시 서버에서 갱신된 값이 반영됨)

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
            onPress={() => router.back()}
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
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: top + 12 }]}>
          <TouchableOpacity onPress={() => setPhase('camera')} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
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
      </View>
    );
  }

  // 카메라 화면
  // expo-camera v15+ 에서 <CameraView> 는 children 미지원 — 자식으로 넣으면
  // "does not support children" WARN + 일부 상황에서 크래시 유발.
  // 따라서 CameraView 와 오버레이를 형제로 두고 absolute positioning 으로 겹치게 함.
  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      {/* 상단 오버레이 */}
      <SafeAreaView style={styles.cameraTop} pointerEvents="box-none">
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
      <SafeAreaView style={styles.cameraBottom} pointerEvents="box-none">
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
    position: 'absolute', top: 0, left: 0, right: 0,
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

  // 썸네일 바 — bottom: previewGoBtn(36) + shutterBtn(72) + shutterHint(18) + gap*2(24) + paddingBottom(24) + safeArea 여유 = 220
  thumbnailBar: { position: 'absolute', bottom: 220, left: 0, right: 0 },
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
