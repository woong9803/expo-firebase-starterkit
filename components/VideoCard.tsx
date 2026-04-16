/**
 * components/VideoCard.tsx — YouTube 영상 카드
 *
 * 영상 목록에서 사용하는 재사용 카드.
 * YouTube 썸네일 이미지 + 재생 아이콘 오버레이 + 영상 제목 표시.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { getYouTubeThumbnailUrl } from '../lib/youtube';

interface Props {
  title: string;       // 영상 제목
  videoId: string;     // YouTube videoId (썸네일·재생에 사용)
  className?: string;  // 반 이름 (있으면 제목 아래 표시)
  onPress: () => void; // 카드 탭 시 콜백 (재생 화면 이동)
}

export default function VideoCard({ title, videoId, className, onPress }: Props) {
  // hq 품질 썸네일 URL 생성
  const thumbnailUrl = getYouTubeThumbnailUrl(videoId, 'hq');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* 썸네일 영역 */}
      <View style={styles.thumbnailWrapper}>
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
        {/* 재생 아이콘 오버레이 */}
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            {/* 삼각형 재생 아이콘 */}
            <View style={styles.playTriangle} />
          </View>
        </View>
      </View>

      {/* 제목 + 반 이름 */}
      <View style={styles.infoArea}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {!!className && (
          <Text style={styles.className}>{className}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden', // 썸네일이 카드 모서리를 넘지 않도록
  },

  // 썸네일
  thumbnailWrapper: {
    width: '100%',
    aspectRatio: 16 / 9, // YouTube 표준 비율
    backgroundColor: '#0F172A', // 로딩 중 배경
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },

  // 재생 오버레이 — 썸네일 위에 반투명 레이어 + 버튼
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // CSS 트릭으로 삼각형 재생 버튼 그리기
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#0F172A',
    marginLeft: 3, // 시각적 중앙 보정
  },

  // 하단 정보 영역
  infoArea: {
    padding: 12,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  className: {
    fontSize: 12,
    color: '#64748B',
  },
});
