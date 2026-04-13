import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { query, where, getDocs, orderBy } from 'firebase/firestore';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Colors, FontSize, FontWeight } from '../../../constants/theme';
import { User } from '../../../types';

export default function AdminStudentsScreen() {
  const { user, academy } = useAuthStore();
  const [students, setStudents] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.academy_id) return;

    const fetchStudents = async () => {
      try {
        const q = query(
          Collections.users(),
          where('academy_id', '==', user.academy_id),
          where('role', '==', 'student'),
          where('is_active', '==', true),
        );
        const snap = await getDocs(q);
        setStudents(snap.docs.map(d => d.data() as User));
      } catch (e) {
        console.error('[AdminStudents] 조회 실패:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [user?.academy_id]);

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>학생 관리</Text>
        <Text style={styles.headerSub}>총 {students.length}명</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.blue500} />
        </View>
      ) : students.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>등록된 학생이 없어요</Text>
          <Text style={styles.emptySub}>학원 코드를 공유해 학생을 초대하세요</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {students.map((s) => (
            <View key={s.uid} style={styles.row}>
              <View style={styles.rowAvatar}>
                <Text style={styles.rowAvatarText}>{s.name?.charAt(0) ?? '?'}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{s.name}</Text>
                <Text style={styles.rowSub}>{s.class_id ? '반 배정됨' : '반 미배정'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: { fontSize: FontSize.xl4, fontWeight: FontWeight.extrabold, color: Colors.gray900 },
  headerSub: { fontSize: FontSize.base, color: Colors.gray500 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray700 },
  emptySub: { fontSize: FontSize.base, color: Colors.gray400 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray900 },
  rowSub: { fontSize: FontSize.base, color: Colors.gray500, marginTop: 1 },
});
