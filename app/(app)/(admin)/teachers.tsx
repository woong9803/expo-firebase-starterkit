/**
 * app/(app)/(admin)/teachers.tsx — 선생님 관리 화면
 *
 * 소속 학원의 선생님 목록을 표시하고, 담당 반 정보를 함께 보여준다.
 * 탭바에는 노출하지 않고 홈 화면의 빠른 이동 버튼으로 진입한다.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { User, Class } from '../../../types';

interface TeacherWithClass extends User {
  classNames: string[]; // 담당 반 이름 목록 (없으면 빈 배열)
}

export default function AdminTeachersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [teachers, setTeachers] = useState<TeacherWithClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 선생님 목록 + 담당 반 이름 로드
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      try {
        // 1. 선생님 목록 조회
        const teacherSnap = await getDocs(
          query(
            Collections.users(),
            where('academy_id', '==', user.academy_id),
            where('role', '==', 'teacher'),
            where('is_active', '==', true),
          )
        );
        const teacherList = teacherSnap.docs.map(d => d.data() as User);

        // 2. 반 목록 조회 (classId → 반 이름 맵 생성)
        const classSnap = await getDocs(
          query(
            Collections.classes(),
            where('academy_id', '==', user.academy_id),
          )
        );
        const classMap: Record<string, string> = {};
        classSnap.docs.forEach(d => {
          // classId → 반 이름 매핑 (선생님의 assigned_class_ids 배열 변환용)
          classMap[d.id] = (d.data() as Class).name;
        });

        // 3. 선생님에 담당 반 이름 목록 합성
        const enriched: TeacherWithClass[] = teacherList.map(t => ({
          ...t,
          classNames: (t.assigned_class_ids ?? [])
            .map(id => classMap[id])
            .filter(Boolean),
        }));

        setTeachers(enriched);
      } catch (e) {
        console.error('[AdminTeachers] 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.academy_id]);

  // 선생님 비활성화(내보내기) 처리
  const handleRemove = (teacher: TeacherWithClass) => {
    Alert.alert(
      '선생님 내보내기',
      `${teacher.name} 선생님을 학원에서 내보낼까요?\n내보낸 후에도 계정은 유지됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '내보내기',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(Collections.user(teacher.uid), { is_active: false });
              setTeachers(prev => prev.filter(t => t.uid !== teacher.uid));
            } catch (e) {
              console.error('[AdminTeachers] 내보내기 실패:', e);
              Alert.alert('오류', '처리에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>선생님 관리</Text>
          {!isLoading && (
            <Text style={styles.headerSub}>총 {teachers.length}명</Text>
          )}
        </View>
      </View>

      {/* ── 콘텐츠 ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5B50E8" />
        </View>
      ) : teachers.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>👩‍🏫</Text>
          <Text style={styles.emptyTitle}>등록된 선생님이 없어요</Text>
          <Text style={styles.emptyDesc}>
            학원 코드를 공유하면 선생님이 가입할 수 있어요.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {teachers.map((t) => (
            <View key={t.uid} style={styles.row}>
              {/* 아바타 */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{t.name?.charAt(0) ?? '?'}</Text>
              </View>

              {/* 이름 + 담당 반 */}
              <View style={styles.info}>
                <Text style={styles.name}>{t.name}</Text>
                <View style={styles.tagRow}>
                  {t.classNames.length > 0 ? (
                    t.classNames.map((cn) => (
                      <View key={cn} style={styles.classTag}>
                        <Text style={styles.classTagText}>{cn}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noClass}>담당 반 없음</Text>
                  )}
                  {t.phone_number ? (
                    <Text style={styles.phone}>{t.phone_number}</Text>
                  ) : null}
                </View>
              </View>

              {/* 내보내기 버튼 */}
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(t)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-remove-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // ── 헤더 ──
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#64748B', marginTop: 1 },

  // ── 빈 화면 ──
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  // ── 목록 ──
  list: { padding: 16, gap: 10, paddingBottom: 32 },

  // 선생님 카드
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },

  // 아바타
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#5B50E8',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: '#fff' },

  // 이름 + 반
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  classTag: {
    backgroundColor: '#EEEDF9',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  classTagText: { fontSize: 12, fontWeight: '700', color: '#5B50E8' },
  noClass: { fontSize: 12, color: '#94A3B8' },
  phone: { fontSize: 12, color: '#64748B' },

  // 내보내기 버튼
  removeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
});
