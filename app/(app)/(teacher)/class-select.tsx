/**
 * app/(app)/(teacher)/class-select.tsx — 선생님 담당반 선택 화면
 *
 * 온보딩(가입 직후)과 프로필 화면 두 곳에서 진입 가능한 공용 화면.
 * - fromOnboarding=true: "건너뛰기" 버튼 노출, 저장 후 홈으로 이동
 * - fromOnboarding 없음: "건너뛰기" 숨김, 저장 후 이전 화면으로 복귀
 *
 * 저장 시 Firestore users/{uid}.assigned_class_ids 업데이트 + store 반영
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDocs, query, where, updateDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class } from '../../../types';

export default function ClassSelectScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { fromOnboarding } = useLocalSearchParams<{ fromOnboarding?: string }>();
  const isOnboarding = fromOnboarding === 'true';

  const { user, setAssignedClassIds } = useAuthStore();

  const [classes, setClasses] = useState<Class[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 학원 내 전체 반 목록 로드 + 기존 담당반 초기 선택 상태 반영
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      try {
        const snap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user.academy_id))
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(list);

        // 이미 담당반이 있으면 초기 선택 상태로 반영
        const existing = user.assigned_class_ids ?? [];
        setSelected(new Set(existing));
      } catch (e) {
        console.error('[ClassSelect] 반 목록 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id]);

  // 반 선택/해제 토글
  const toggleClass = (classId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  // 저장하기
  const handleSave = async () => {
    if (!user?.uid) return;

    setIsSaving(true);
    try {
      const ids = Array.from(selected);
      // Firestore 업데이트
      await updateDoc(Collections.user(user.uid), { assigned_class_ids: ids });
      // store 즉시 반영
      setAssignedClassIds(ids);

      if (isOnboarding) {
        // 온보딩 완료 → 홈으로 이동
        router.replace('/(app)');
      } else {
        // 프로필에서 진입 → 이전 화면으로 복귀
        router.back();
      }
    } catch (e) {
      console.error('[ClassSelect] 저장 실패:', e);
      Alert.alert('오류', '저장에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  // 건너뛰기 (온보딩에서만)
  const handleSkip = () => {
    router.replace('/(app)');
  };

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        {!isOnboarding && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>담당반 선택</Text>
          <Text style={styles.headerSub}>
            {isOnboarding
              ? '담당하는 반을 선택해주세요. 나중에 변경할 수 있어요.'
              : '담당반을 선택·해제할 수 있어요.'}
          </Text>
        </View>
        {isOnboarding && (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 반 목록 ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : classes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>등록된 반이 없어요</Text>
          <Text style={styles.emptyDesc}>원장님께 반 생성을 요청해주세요.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {classes.map((c) => {
            const isSelected = selected.has(c.id);
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => toggleClass(c.id)}
                activeOpacity={0.8}
              >
                {/* 반 이름 */}
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, isSelected && styles.rowNameSelected]}>
                    {c.name}
                  </Text>
                  <Text style={styles.rowCode}>초대코드 {c.invite_code}</Text>
                </View>

                {/* 선택 체크 */}
                <View style={[styles.check, isSelected && styles.checkSelected]}>
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── 저장하기 버튼 ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>
              {selected.size > 0
                ? `${selected.size}개 반 저장하기`
                : '선택 없이 저장하기'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },

  // ── 헤더 ──
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#64748B', lineHeight: 17 },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 2, marginTop: 4 },
  skipText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },

  // ── 빈 화면 ──
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center' },

  // ── 목록 ──
  list: { padding: 16, gap: 10, paddingBottom: 16 },

  // 반 카드
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  rowSelected: {
    backgroundColor: '#EEEDF9',
    borderColor: '#5B50E8',
  },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  rowNameSelected: { color: '#5B50E8' },
  rowCode: { fontSize: 12, color: '#94A3B8' },

  // 체크 원
  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkSelected: {
    backgroundColor: '#5B50E8',
    borderColor: '#5B50E8',
  },

  // ── 하단 버튼 ──
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  saveBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
