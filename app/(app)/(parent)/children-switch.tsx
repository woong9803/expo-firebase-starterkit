/**
 * app/(app)/(parent)/children-switch.tsx — 다자녀 전환 UI (비탭 화면)
 *
 * - user.children 배열 순회 → 각 uid로 User 문서 조회
 * - 자녀 카드 목록 (이름, 반 이름)
 * - 카드 탭 → homework 화면으로 childUid 파라미터와 함께 이동
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDoc, getDocs, query, where } from 'firebase/firestore';

import { useAuthStore } from '../../../store/useAuthStore';
import { Collections } from '../../../lib/firestore';
import { strings } from '../../../constants/strings';
import type { User, Class } from '../../../types';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

interface ChildWithClass extends User {
  className: string | null;
}

// ─────────────────────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────────────────────

export default function ChildrenSwitchScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [children, setChildren] = useState<ChildWithClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── 자녀 목록 + 반 이름 로드 ────────────────────────────────
  useEffect(() => {
    if (!user?.children?.length) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        // 자녀 User 문서 일괄 조회
        const snaps = await Promise.all(
          user.children.map((uid) => getDoc(Collections.user(uid)))
        );
        const loaded = snaps
          .filter((snap) => snap.exists())
          .map((snap) => ({ uid: snap.id, ...snap.data() } as User));

        // 각 자녀의 반 이름 조회
        const classIds = [...new Set(loaded.map((c) => c.class_id).filter(Boolean) as string[])];
        const classMap: Record<string, string> = {};

        if (classIds.length > 0) {
          // class_id 배열로 한 번에 조회 (최대 10개 — Firestore 'in' 제한)
          const classSnaps = await getDocs(
            query(Collections.classes(), where('__name__', 'in', classIds.slice(0, 10)))
          );
          classSnaps.forEach((d) => {
            classMap[d.id] = (d.data() as Class).name;
          });
        }

        const withClass: ChildWithClass[] = loaded.map((c) => ({
          ...c,
          className: c.class_id ? (classMap[c.class_id] ?? null) : null,
        }));

        setChildren(withClass);
      } catch (e) {
        console.warn('[ChildrenSwitch] 자녀 로드 오류:', e);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [user?.children]);

  // ── 자녀 선택 → homework 화면으로 이동 ──────────────────────
  function handleSelectChild(childUid: string) {
    // homework 탭으로 childUid 파라미터와 함께 이동
    router.replace({
      pathname: '/(app)/(parent)/homework',
      params: { childUid },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.navigate('/(app)/(parent)/homework')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.parent.switchChild}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ── 로딩 ── */}
      {isLoading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#F59E0B" size="large" />
        </View>
      )}

      {/* ── 자녀 없음 ── */}
      {!isLoading && children.length === 0 && (
        <View style={styles.centerBox}>
          <Text style={styles.emptyIcon}>👨‍👧</Text>
          <Text style={styles.emptyText}>{strings.parent.noChildren}</Text>
        </View>
      )}

      {/* ── 자녀 목록 ── */}
      {!isLoading && children.length > 0 && (
        <FlatList
          data={children}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.childCard}
              onPress={() => handleSelectChild(item.uid)}
              activeOpacity={0.75}
            >
              {/* 아바타 */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
              </View>

              {/* 이름 + 반 */}
              <View style={styles.childInfo}>
                <Text style={styles.childName}>{item.name}</Text>
                {item.className && (
                  <Text style={styles.childClass}>{item.className}</Text>
                )}
              </View>

              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  headerRight: {
    width: 30,
  },

  // ── 중앙 배치 ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },

  // ── 목록 ──
  listContent: {
    padding: 16,
    gap: 10,
  },

  // ── 자녀 카드 ──
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F59E0B',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  childClass: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
  },
});
