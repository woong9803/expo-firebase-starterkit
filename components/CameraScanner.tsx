/**
 * components/CameraScanner.tsx — 카메라 스캔 UI 컴포넌트
 *
 * 숙제 스캔 제출에 사용되는 카메라 뷰 컴포넌트.
 * 가이드 프레임, 셔터 버튼, 흑백/컬러 토글, 미리보기 스트립을 포함한다.
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** 촬영 완료 시 호출 — uri 전달 */
  onCapture: (uri: string) => void;
  /** 최대 촬영 장수 (기본 5) */
  maxPhotos?: number;
  /** 현재까지 촬영된 이미지 URI 배열 */
  capturedUris: string[];
  /** 흑백 모드 여부 */
  grayscale: boolean;
  /** 흑백/컬러 토글 콜백 */
  onToggleGrayscale: () => void;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function CameraScanner({
  onCapture,
  maxPhotos = 5,
  capturedUris,
  grayscale,
  onToggleGrayscale,
}: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // ── 권한 로딩 중 ──────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // ── 권한 미허용 시 안내 화면 ──────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>카메라 권한이 필요해요</Text>
        <Text style={styles.permissionDesc}>
          숙제 사진을 촬영하려면{'\n'}카메라 접근 권한을 허용해주세요.
        </Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Text style={styles.permissionBtnText}>권한 허용하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 촬영 ──────────────────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (capturedUris.length >= maxPhotos) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch (e) {
      console.error('[CameraScanner] 촬영 실패:', e);
    }
  };

  const isMaxReached = capturedUris.length >= maxPhotos;

  return (
    <View style={styles.container}>
      {/* ── 카메라 뷰 ── */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* ── 가이드 프레임 (4모서리 코너) ── */}
        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            {/* 좌상단 */}
            <View style={[styles.corner, styles.cornerTL]} />
            {/* 우상단 */}
            <View style={[styles.corner, styles.cornerTR]} />
            {/* 좌하단 */}
            <View style={[styles.corner, styles.cornerBL]} />
            {/* 우하단 */}
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.guideText}>문서를 프레임 안에 맞춰주세요</Text>
        </View>

        {/* ── 우상단: 흑백/컬러 토글 + 장수 카운터 ── */}
        <View style={styles.topControls}>
          <TouchableOpacity
            style={styles.togglePill}
            onPress={onToggleGrayscale}
            activeOpacity={0.8}
          >
            <Text style={styles.toggleText}>
              {grayscale ? '⬛ 흑백' : '🎨 컬러'}
            </Text>
          </TouchableOpacity>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {capturedUris.length}/{maxPhotos}장
            </Text>
          </View>
        </View>
      </CameraView>

      {/* ── 하단 컨트롤 영역 ── */}
      <View style={styles.bottomControls}>
        {/* 미리보기 스트립 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewStrip}
          contentContainerStyle={styles.previewStripContent}
        >
          {capturedUris.map((uri, index) => (
            <Image
              key={index}
              source={{ uri }}
              style={styles.previewThumb}
            />
          ))}
          {/* 빈 슬롯 표시 */}
          {Array.from({ length: maxPhotos - capturedUris.length }, (_, i) => (
            <View key={`empty-${i}`} style={styles.previewEmpty} />
          ))}
        </ScrollView>

        {/* 셔터 버튼 */}
        <TouchableOpacity
          style={[styles.shutterBtn, isMaxReached && styles.shutterBtnDisabled]}
          onPress={handleCapture}
          disabled={isMaxReached}
          activeOpacity={0.85}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        {isMaxReached && (
          <Text style={styles.maxReachedText}>
            최대 {maxPhotos}장까지 촬영할 수 있어요
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 24;
const CORNER_WIDTH = 2.5;
const CORNER_COLOR = '#5B50E8';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },

  // 로딩 / 권한 화면
  center: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionBtn: {
    backgroundColor: '#5B50E8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // 카메라 뷰
  camera: {
    flex: 1,
  },

  // 가이드 프레임
  frameContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 300,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: CORNER_COLOR,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: CORNER_COLOR,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: CORNER_COLOR,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: CORNER_COLOR,
    borderBottomRightRadius: 4,
  },
  guideText: {
    marginTop: 16,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  // 우상단 컨트롤
  topControls: {
    position: 'absolute',
    top: 16,
    right: 16,
    gap: 8,
    alignItems: 'flex-end',
  },
  togglePill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  counterPill: {
    backgroundColor: 'rgba(91,80,232,0.8)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // 하단 컨트롤
  bottomControls: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },

  // 미리보기 스트립
  previewStrip: {
    width: '100%',
    maxHeight: 60,
  },
  previewStripContent: {
    gap: 8,
    paddingHorizontal: 4,
  },
  previewThumb: {
    width: 44,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#1F2937',
  },
  previewEmpty: {
    width: 44,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#1F2937',
    borderWidth: 1.5,
    borderColor: '#374151',
    borderStyle: 'dashed',
  },

  // 셔터 버튼
  shutterBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBtnDisabled: {
    opacity: 0.3,
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
  },
  maxReachedText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
