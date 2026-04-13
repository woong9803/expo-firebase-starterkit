import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../store/useAuthStore';
import { strings } from '../../../constants/strings';

// 결석 사유 목록 — strings.ts에서 관리
const REASONS = strings.attendance.absenceReasons;

export default function ParentHomeScreen() {
  const { user } = useAuthStore();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const parentName = user?.name ?? '부모님';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>자녀 현황을 확인하세요</Text>
          <Text style={styles.name}>{parentName} 부모님 👋</Text>
          <View style={styles.childTabs}>
            <TouchableOpacity style={styles.childTabActive}>
              <Text style={styles.childTabActiveText}>자녀 없음</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.childTabAdd}>
              <Text style={styles.childTabAddText}>+ 자녀 추가</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.bellBtn}>
          <Text style={styles.bellEmoji}>🔔</Text>
        </View>
      </View>

      <View style={styles.body}>

        {/* ── 오늘 출결 (주황 그라데이션) ── */}
        <LinearGradient
          colors={['#F59E0B', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.attendCard}
        >
          <View style={styles.attendLeft}>
            <Text style={styles.attendEmoji}>❓</Text>
            <View>
              <Text style={styles.attendStatus}>미확인</Text>
              <Text style={styles.attendTime}>자녀 연동 후 표시</Text>
            </View>
          </View>
          <View style={styles.attendRight}>
            <Text style={styles.attendRateLabel}>이번달 출석률</Text>
            <Text style={styles.attendRate}>-</Text>
          </View>
        </LinearGradient>

        {/* ── 오늘 숙제 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 오늘 숙제</Text>

          <Text style={styles.emptyText}>자녀 연동 후 숙제 현황이 표시돼요</Text>
        </View>

        {/* ── 결석 사유 전송 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 결석 사유 전송</Text>
          <Text style={styles.reasonDesc}>오늘 결석하나요? 선생님께 사유를 보내주세요.</Text>
          <View style={styles.reasonRow}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, selectedReason === r && styles.reasonChipSel]}
                onPress={() => setSelectedReason(selectedReason === r ? null : r)}
                activeOpacity={0.8}
              >
                <Text style={[styles.reasonChipText, selectedReason === r && styles.reasonChipTextSel]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !selectedReason && styles.sendBtnOff]}
            disabled={!selectedReason}
            activeOpacity={0.85}
          >
            <Text style={styles.sendBtnText}>선생님께 전송하기</Text>
          </TouchableOpacity>
        </View>

        {/* ── 최근 피드백 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 최근 피드백</Text>
          <Text style={styles.emptyText}>피드백이 없어요</Text>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  content: { paddingBottom: 32 },

  // 헤더
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 13, color: '#64748B' },
  name: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 2, letterSpacing: -0.5 },
  childTabs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  childTabActive: { backgroundColor: '#F59E0B', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  childTabActiveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  childTabAdd: { backgroundColor: '#F1F5F9', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  childTabAddText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center' },
  bellEmoji: { fontSize: 18 },

  body: { paddingHorizontal: 16 },

  // 출결 카드
  attendCard: { borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  attendLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attendEmoji: { fontSize: 36 },
  attendStatus: { fontSize: 18, fontWeight: '800', color: '#fff' },
  attendTime: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  attendRight: { alignItems: 'flex-end' },
  attendRateLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  attendRate: { fontSize: 22, fontWeight: '800', color: '#fff' },

  // 섹션
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },

  // 숙제 공통
  hwRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hwTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  hwSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  barTrack: { height: 5, backgroundColor: '#FECACA', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', borderRadius: 3 },

  // 미제출 카드
  hwMissing: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 14, padding: 14, marginBottom: 10 },
  chipMissing: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  chipMissingText: { fontSize: 10, fontWeight: '700', color: '#991B1B' },
  warningText: { fontSize: 11, fontWeight: '600', color: '#991B1B', marginTop: 6 },

  // 완료 카드
  hwDone: { backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#A7F3D0', borderRadius: 14, padding: 14 },
  chipDone: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  chipDoneText: { fontSize: 10, fontWeight: '700', color: '#065F46' },
  doneConfirm: { fontSize: 12, fontWeight: '600', color: '#10B981', marginTop: 8 },

  // 결석 사유
  reasonDesc: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  reasonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  reasonChip: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  reasonChipSel: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  reasonChipText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  reasonChipTextSel: { color: '#fff' },
  sendBtn: { height: 50, borderRadius: 9, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.45 },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // 피드백
  feedbackCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14 },
  feedbackTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chipGood: { backgroundColor: '#D1FAE5', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  chipGoodText: { fontSize: 10, fontWeight: '700', color: '#065F46' },
  feedbackDate: { fontSize: 10, color: '#64748B' },
  feedbackDesc: { fontSize: 12, color: '#64748B', marginTop: 4 },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },
});
