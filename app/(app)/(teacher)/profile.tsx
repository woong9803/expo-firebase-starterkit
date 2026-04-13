/**
 * app/(app)/(teacher)/profile.tsx — 선생님 내정보 화면
 *
 * 프로필 정보, 담당반 목록 표시 및 변경 진입점, 로그아웃 기능을 제공한다.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { getDocs, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../lib/firebase';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class } from '../../../types';

export default function TeacherProfileScreen() {
  const router = useRouter();
  const { user, academy, clearUser } = useAuthStore();

  const [classNames, setClassNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 담당반 이름 목록 로드
  useEffect(() => {
    const classIds = user?.assigned_class_ids ?? [];
    if (classIds.length === 0) { setClassNames([]); return; }

    setIsLoading(true);
    (async () => {
      try {
        // classId 배열로 반 이름 조회
        const snap = await getDocs(
          query(Collections.classes(), where('academy_id', '==', user?.academy_id ?? ''))
        );
        const names = snap.docs
          .filter(d => classIds.includes(d.id))
          .map(d => (d.data() as Class).name);
        setClassNames(names);
      } catch (e) {
        console.error('[TeacherProfile] 담당반 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.assigned_class_ids?.join(',')]);

  const handleLogout = async () => {
    await signOut(auth);
    clearUser();
    // app/_layout.tsx의 onAuthStateChanged가 /(auth)로 자동 이동
  };

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내정보</Text>
      </View>

      {/* ── 프로필 카드 ── */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? '선'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.name ?? '선생님'}</Text>
          <Text style={styles.role}>선생님 · {academy?.name ?? ''}</Text>
        </View>
      </View>

      {/* ── 담당반 섹션 ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>담당반</Text>
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={() => router.push('/(app)/(teacher)/class-select')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={13} color="#5B50E8" />
            <Text style={styles.changeBtnText}>변경</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#5B50E8" style={{ marginTop: 8 }} />
        ) : classNames.length > 0 ? (
          <View style={styles.chipRow}>
            {classNames.map((cn) => (
              <View key={cn} style={styles.chip}>
                <Text style={styles.chipText}>{cn}</Text>
              </View>
            ))}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.emptyClass}
            onPress={() => router.push('/(app)/(teacher)/class-select')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyClassText}>담당반이 없어요. 탭하여 선택하기 →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 로그아웃 ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
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
    paddingTop: 52,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  // ── 프로필 카드 ──
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  role: { fontSize: 13, color: '#64748B', marginTop: 2 },

  // ── 담당반 섹션 ──
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569' },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#EEEDF9',
    borderRadius: 8,
  },
  changeBtnText: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },

  // 반 칩
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: '#EEEDF9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },

  // 담당반 없을 때
  emptyClass: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  emptyClassText: { fontSize: 13, color: '#94A3B8' },

  // ── 로그아웃 ──
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
});
