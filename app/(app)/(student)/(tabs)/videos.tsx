/**
 * app/(app)/(student)/videos.tsx — 학생 수업 영상 목록
 *
 * 내 반에 등록된 YouTube 영상 목록을 조회하고,
 * 카드 탭 시 YouTube 앱(또는 브라우저)으로 이동한다.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../../lib/firestore';
import { useAuthStore } from '../../../../store/useAuthStore';
import { getYouTubeWatchUrl, getYouTubeThumbnailUrl } from '../../../../lib/youtube';
import { Video } from '../../../../types';

export default function StudentVideosScreen() {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // 내 반 영상 실시간 구독
  // - 구독을 한 번만 만들고 계속 유지 → 선생님/어드민의 추가·수정·삭제를 즉시 반영
  // - subscriptionKey / useFocusEffect 재구독 방식은 이벤트를 놓쳐 제거함
  useEffect(() => {
    if (!user?.class_id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(false);

    const unsubscribe = Collections.videos()
      .where('class_id', '==', user.class_id)
      .orderBy('created_at', 'desc')
      .onSnapshot(
        snap => {
          setVideos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Video)));
          setIsLoading(false);
        },
        e => {
          console.error('[StudentVideos] 영상 목록 구독 실패:', e);
          setError(true);
          setIsLoading(false);
        }
      );

    // class_id 변경 또는 언마운트 시에만 구독 해제
    return () => unsubscribe();
  }, [user?.class_id]);

  // 영상 카드 탭 — YouTube 앱 또는 브라우저로 이동
  const handleVideoPress = async (video: Video) => {
    const url = getYouTubeWatchUrl(video.video_id);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('오류', 'YouTube를 열 수 없어요. YouTube 앱을 설치해주세요.');
    }
  };

  // ── 로딩 ──
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#5B50E8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <View>
          <Text style={styles.greeting}>수업 자료</Text>
          <Text style={styles.title}>수업 영상</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="play-circle-outline" size={24} color="#5B50E8" />
        </View>
      </View>

      {/* ── 오류 ── */}
      {error && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>영상을 불러오지 못했어요</Text>
          <Text style={styles.errorSub}>잠시 후 다시 시도해주세요</Text>
        </View>
      )}

      {/* ── 반 미배정 안내 ── */}
      {!error && !user?.class_id && (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>반에 배정된 후 영상이 표시돼요</Text>
        </View>
      )}

      {/* ── 영상 없음 ── */}
      {!error && user?.class_id && videos.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="videocam-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>등록된 영상이 없어요</Text>
          <Text style={styles.emptySub}>선생님이 영상을 등록하면 여기에 표시돼요</Text>
        </View>
      )}

      {/* ── 영상 목록 ── */}
      {!error && videos.length > 0 && (
        <FlatList
          data={videos}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
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
              {/* 제목 */}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  greeting: { fontSize: 13, color: '#64748B' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#EEEDF9',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 목록 ──
  list: {
    padding: 16,
    paddingBottom: 32,
  },

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
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20 },

  // ── 빈 상태 ──
  emptyText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94A3B8' },

  // ── 오류 ──
  errorText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  errorSub: { fontSize: 13, color: '#94A3B8' },
});
