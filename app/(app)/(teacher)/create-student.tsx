import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Platform,
  ActivityIndicator, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDocs, query, where, documentId } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Class } from '../../../types';

// Cloud Function 반환 타입
interface CreateStudentResult {
  name: string;
  email: string;
  tempPassword: string;
  linkCode: string;
  uid: string;
}

export default function CreateStudentScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  // ─── 입력 상태 ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // ─── 로딩 / 결과 ───────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CreateStudentResult | null>(null);

  // 담당 반 목록 로드
  useEffect(() => {
    if (!user?.uid || !user?.academy_id) return;
    (async () => {
      try {
        // assigned_class_ids 배열로 직접 반 문서 조회
        const classIds = user.assigned_class_ids ?? [];
        if (classIds.length === 0) { setClasses([]); return; }
        const snap = await getDocs(
          query(Collections.classes(), where(documentId(), 'in', classIds))
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(list);
        if (list.length > 0) setSelectedClassId(list[0].id);
      } catch (e) {
        console.error('[CreateStudent] 반 목록 조회 실패:', e);
      }
    })();
  }, [user?.uid, user?.academy_id]);

  // ─── 계정 생성 ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('입력 오류', '학생 이름을 입력해주세요.');
      return;
    }
    if (!selectedClassId) {
      Alert.alert('입력 오류', '반을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const createFn = httpsCallable<
        { name: string; classId: string; academyId: string; birthDate?: string },
        CreateStudentResult
      >(functions, 'createStudentAccount');

      const res = await createFn({
        name: name.trim(),
        classId: selectedClassId,
        academyId: user?.academy_id ?? '',
        birthDate: birthDate.trim() || undefined,
      });

      setResult(res.data);
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert('오류', err.message ?? '계정 생성에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── 다시 만들기 ────────────────────────────────────────────────────
  const handleReset = () => {
    setResult(null);
    setName('');
    setBirthDate('');
  };

  // ─── 결과 화면 ──────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleReset}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>계정 생성 완료</Text>
        </View>

        <ScrollView contentContainerStyle={styles.resultContent}>
          <Text style={styles.resultDesc}>
            아래 정보를 학생에게 전달해주세요.{'\n'}
            캡처하거나 프린트해서 배부할 수 있어요.
          </Text>

          {/* 계정 카드 */}
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultCardTitle}>📋 학생 계정 정보</Text>
              <View style={styles.resultBadge}>
                <Text style={styles.resultBadgeText}>임시 계정</Text>
              </View>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>이름</Text>
              <Text style={styles.resultValue}>{result.name}</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>이메일 (ID)</Text>
              <Text style={[styles.resultValue, styles.monoText]}>{result.email}</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>임시 비밀번호</Text>
              <Text style={[styles.resultValue, styles.monoText, styles.passwordText]}>
                {result.tempPassword}
              </Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>연동코드</Text>
              <Text style={[styles.resultValue, styles.monoText, styles.linkCodeText]}>
                {result.linkCode}
              </Text>
            </View>
          </View>

          {/* 안내 메시지 */}
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              💡 연동코드는 학부모가 자녀 계정을 연결할 때 사용해요.{'\n'}
              학생이 실제 이메일이 생기면 앱 내 설정에서 변경할 수 있어요.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>완료</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── 입력 화면 ──────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>학생 계정 만들기</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formDesc}>
          이메일이 없는 학생을 위해 선생님이 계정을 직접 만들 수 있어요.{'\n'}
          가상 이메일과 임시 비밀번호가 자동 생성돼요.
        </Text>

        {/* 학생 이름 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>학생 이름 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="이름을 입력해주세요"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* 반 선택 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>반 선택 <Text style={styles.required}>*</Text></Text>
          {classes.length === 0 ? (
            <View style={styles.emptyClass}>
              <Text style={styles.emptyClassText}>담당 반이 없어요</Text>
            </View>
          ) : (
            <View style={styles.classChips}>
              {classes.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.classChip, selectedClassId === c.id && styles.classChipActive]}
                  onPress={() => setSelectedClassId(c.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.classChipText, selectedClassId === c.id && styles.classChipTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* 생년월일 (선택) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>생년월일 <Text style={styles.optional}>(선택)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD (예: 2015-03-15)"
            placeholderTextColor="#94A3B8"
            value={birthDate}
            onChangeText={setBirthDate}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        {/* 안내 박스 */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            ℹ️ 가상 이메일과 임시 비밀번호는 자동으로 생성돼요.{'\n'}
            생성 후 학생에게 인쇄물 또는 캡처로 전달하면 돼요.
          </Text>
        </View>

        {/* 생성 버튼 */}
        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || !selectedClassId) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={isLoading || !name.trim() || !selectedClassId}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>계정 만들기</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // 헤더 — homework-create.tsx와 동일한 구조 (아이콘 + 타이틀 인라인)
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

  // 입력 폼
  formContent: { padding: 20, gap: 20, paddingBottom: 40 },
  formDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },

  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569' },
  required: { color: '#EF4444' },
  optional: { color: '#94A3B8', fontWeight: '400' },
  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },

  // 반 선택 칩
  classChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  classChipActive: { backgroundColor: '#EEEDF9', borderColor: '#5B50E8' },
  classChipText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  classChipTextActive: { color: '#5B50E8' },
  emptyClass: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  emptyClassText: { fontSize: 14, color: '#94A3B8' },

  // 안내 카드
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  infoText: { fontSize: 13, color: '#64748B', lineHeight: 18 },

  // 생성 버튼
  createBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 결과 화면
  resultContent: { padding: 20, gap: 16, paddingBottom: 40 },
  resultDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },

  resultCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultCardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  resultBadge: {
    backgroundColor: '#EEEDF9',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  resultBadgeText: { fontSize: 11, fontWeight: '700', color: '#5B50E8' },

  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  resultLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  resultValue: { fontSize: 15, fontWeight: '700', color: '#0F172A', textAlign: 'right', flex: 1, marginLeft: 16 },
  monoText: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  passwordText: { color: '#5B50E8', letterSpacing: 1 },
  linkCodeText: { color: '#10B981', letterSpacing: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  // 완료 버튼
  doneBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
