import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onSnapshot } from 'firebase/firestore';
import { Collections } from '../../lib/firestore';
import { useAuthStore } from '../../store/useAuthStore';
import { Academy } from '../../types';

// 신청일 Timestamp → "YYYY.MM.DD" 포맷
function formatDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '-';
  try {
    const d = ts.toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return '-';
  }
}

export default function PendingScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { user, academy: storeAcademy, setAcademy: setStoreAcademy, setPendingExploreGranted } = useAuthStore();

  // 화면 표시용 로컬 상태 — 변수명 충돌 방지
  const [localAcademy, setLocalAcademy] = useState<Academy | null>(storeAcademy);
  const [isLoading, setIsLoading] = useState(!storeAcademy);

  // 학원 상태 실시간 구독 — approved(active)되면 앱 홈으로 자동 이동
  useEffect(() => {
    if (!user?.academy_id) { setIsLoading(false); return; }

    const unsub = onSnapshot(
      Collections.academy(user.academy_id),
      (snap) => {
        setIsLoading(false);
        if (!snap.exists()) return;
        const data = { id: snap.id, ...snap.data() } as Academy;

        // 로컬 상태 + Zustand 스토어 모두 업데이트
        // Zustand 업데이트가 없으면 "시작하기" 후 AppLayout이 여전히 pending으로
        // 판단해 다시 이 화면으로 돌아오는 버그 발생
        setLocalAcademy(data);
        setStoreAcademy(data);

        if (data.status === 'active') {
          AsyncStorage.setItem(`approved_shown_${snap.id}`, '1');
          Alert.alert(
            '🎉 학원 승인 완료!',
            `${data.name} 학원이 승인되었어요.\n이제 모든 기능을 사용할 수 있어요!`,
            [{ text: '시작하기', onPress: () => router.replace('/(app)/(admin)') }],
            { cancelable: false },
          );
        }
      },
      (e) => {
        console.error('[Pending] 학원 정보 구독 실패:', e);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [user?.academy_id]);

  // 카카오톡 문의 (채널 URL 연결, 없으면 안내)
  const handleKakaoContact = async () => {
    const url = 'https://pf.kakao.com/_placeholder'; // TODO: 실제 채널 URL 입력
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('문의', '카카오톡 채널 URL을 설정해주세요.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: top + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 아이콘 + 제목 ── */}
      <View style={styles.heroArea}>
        <View style={styles.iconBox}>
          <Text style={styles.iconEmoji}>⏳</Text>
        </View>
        <Text style={styles.title}>승인 대기 중</Text>
        <Text style={styles.subtitle}>
          운영자가 학원 정보를 확인 중이에요.{'\n'}
          보통 1~2 영업일 내 연락드려요!
        </Text>
      </View>

      {/* ── 신청 정보 카드 ── */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>📋 신청 정보</Text>

        {isLoading ? (
          <ActivityIndicator color="#F59E0B" style={{ marginTop: 8 }} />
        ) : (
          <>
            <InfoRow label="학원 유형" value={localAcademy?.academy_type ?? '-'} />
            <InfoRow label="학원명" value={localAcademy?.name ?? '-'} />
            <InfoRow label="대표자" value={localAcademy?.owner_name ?? '-'} />
            <InfoRow
              label="신청일"
              value={formatDate(localAcademy?.submitted_at as any)}
              isLast
            />
          </>
        )}
      </View>

      {/* ── 승인 전 사용 가능한 기능 카드 ── */}
      <View style={styles.limitCard}>
        <Text style={styles.limitCardTitle}>승인 전 사용 가능한 기능</Text>

        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>학생 등록</Text>
          <Text style={styles.limitValueAmber}>최대 3명</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>반 생성</Text>
          <Text style={styles.limitValueAmber}>1개</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>선생님 초대</Text>
          <Text style={styles.limitValueRed}>불가</Text>
        </View>
      </View>

      {/* ── 버튼 2개 ── */}
      <View style={styles.btnArea}>
        <TouchableOpacity
          style={styles.btnOutline}
          onPress={handleKakaoContact}
          activeOpacity={0.85}
        >
          <Text style={styles.btnOutlineText}>카카오톡으로 문의</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => {
            // AppLayout의 pending 체크를 이 세션 동안 우회하도록 허용
            setPendingExploreGranted(true);
            router.replace('/(app)/(admin)');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>미리 탐색해보기</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── 신청 정보 행 컴포넌트 ──────────────────────────────────────────
function InfoRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // ── 히어로 ──
  heroArea: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },

  // ── 신청 정보 카드 ──
  infoCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── 제한 기능 카드 ──
  limitCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  limitCardTitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  limitLabel: {
    fontSize: 14,
    color: '#0F172A',
  },
  limitValueAmber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  limitValueRed: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },

  // ── 버튼 ──
  btnArea: {
    gap: 10,
  },
  btnOutline: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  btnPrimary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
