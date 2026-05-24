import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Platform,
  ActivityIndicator, KeyboardAvoidingView, Alert,
  InputAccessoryView,
} from 'react-native';

// iOS 숫자 키보드 Done 툴바 제거용 ID
const ACCESSORY_ID = 'createStudent';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebase as fbFunctions } from '@react-native-firebase/functions';
import firestore, { documentId } from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Collections } from '../../../lib/firestore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useStudentLimit } from '../../../hooks/useStudentLimit';
import { Class } from '../../../types';
import {
  resolveTuitionOnClassChange,
  formatTuitionInput,
  parseTuitionInput,
  tuitionToInputString,
} from '../../../lib/tuitionFormat';
import { calculateAge, isUnder14 } from '../../../lib/age';
import { strings } from '../../../constants/strings';

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
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  // 학원 학생 수 한도 — 화면 진입 시 사전 안내 + 한도 도달 시 버튼 차단
  const { limit, count, isAtLimit, remaining, isUnlimited, limitLabel, isLoaded: isLimitLoaded } =
    useStudentLimit();

  // ─── 입력 상태 ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  // 수강료 — 콤마 포함 문자열로 보관, 저장 시 number|null 로 변환
  const [tuitionFee, setTuitionFee] = useState('');
  // 사용자가 수강료를 직접 수정한 적이 있는지 — 반 변경 시 덮어쓰기 방지
  const [tuitionTouched, setTuitionTouched] = useState(false);
  // 만 14세 미만 학생 등록 시 보호자(법정대리인) 동의 체크 (PIPA 제22조)
  const [guardianConsent, setGuardianConsent] = useState(false);

  // 생년월일 입력 기반 만 14세 미만 여부 — 유효하지 않으면 null
  const trimmedBirthDate = birthDate.trim();
  const ageValid = trimmedBirthDate.length > 0 && calculateAge(trimmedBirthDate) !== null;
  const showConsent = ageValid && isUnder14(trimmedBirthDate);
  const birthDateInvalid = trimmedBirthDate.length > 0 && !ageValid;

  // 반 선택 변경 시 수강료를 새 반의 default 로 자동 채움
  // 사용자가 수강료를 직접 수정한 적이 있으면 보존 (학생별 커스터마이즈 의도 존중)
  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    if (!tuitionTouched) {
      const selected = classes.find((c) => c.id === classId);
      setTuitionFee(tuitionToInputString(selected?.default_tuition_fee));
    }
  };

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
        const snap = await Collections.classes()
          .where(documentId(), 'in', classIds)
          .get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
        setClasses(list);
        if (list.length > 0) {
          // 첫 반 자동 선택 + 수강료 default 자동 채움
          setSelectedClassId(list[0].id);
          setTuitionFee(tuitionToInputString(list[0].default_tuition_fee));
        }
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
    // 생년월일 형식이 유효하지 않으면 차단 (입력했을 때만)
    if (birthDateInvalid) {
      Alert.alert('입력 오류', strings.createStudent.birthDateInvalid);
      return;
    }
    // 만 14세 미만인데 보호자 동의 미체크 → 차단 (PIPA 제22조)
    if (showConsent && !guardianConsent) {
      Alert.alert('보호자 동의 필요', strings.createStudent.guardianConsentRequired);
      return;
    }

    setIsLoading(true);
    try {
      // CF region: asia-northeast3 (서울) — PIPA 국외 이전 회피
      const createFn = fbFunctions
        .app()
        .functions('asia-northeast3')
        .httpsCallable('createStudentAccount');

      const res = (await createFn({
        name: name.trim(),
        classId: selectedClassId,
        academyId: user?.academy_id ?? '',
        birthDate: trimmedBirthDate || undefined,
        // 만 14세 미만일 때만 동의 플래그 전달 → CF 측에서 검증·저장
        guardianConsent: showConsent ? guardianConsent : undefined,
      })) as { data: CreateStudentResult };

      // 주소·수강료 — CF 가 처리하지 않는 필드는 클라이언트에서 별도 update (RTT 1회로 묶음)
      // 수강료: 사용자가 직접 수정한 값(parseTuitionInput) 우선,
      // 손대지 않았으면 반 default 자동 채움 (resolveTuitionOnClassChange)
      if (res.data.uid) {
        const selectedClass = classes.find(c => c.id === selectedClassId);
        const newFee = tuitionTouched
          ? parseTuitionInput(tuitionFee)
          : resolveTuitionOnClassChange(undefined, selectedClass?.default_tuition_fee);

        const extraPayload: Record<string, unknown> = {};
        if (address.trim()) extraPayload.address = address.trim();
        // newFee 는 number 또는 null — null 도 명시적 미설정 의미로 저장
        if (newFee !== undefined) extraPayload.tuition_fee = newFee;
        if (Object.keys(extraPayload).length > 0) {
          await Collections.user(res.data.uid).update(extraPayload);
        }
      }

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
    setAddress('');
    setGuardianConsent(false);
    // 수강료는 현재 선택된 반의 default 로 다시 채움 (다음 학생도 같은 반일 가능성 高)
    const selected = classes.find((c) => c.id === selectedClassId);
    setTuitionFee(tuitionToInputString(selected?.default_tuition_fee));
    setTuitionTouched(false);
  };

  // ─── 결과 화면 ──────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: top + 12 }]}>
          <TouchableOpacity
            onPress={handleReset}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
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
              <Text style={styles.resultCardTitle}>학생 계정 정보</Text>
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
    <>
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
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
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
                  onPress={() => handleSelectClass(c.id)}
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

        {/* 생년월일 (선택) — 입력 시 14세 미만이면 보호자 동의 체크박스 노출 (PIPA 제22조) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>생년월일 <Text style={styles.optional}>(선택)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD (예: 2015-03-15)"
            placeholderTextColor="#94A3B8"
            value={birthDate}
            onChangeText={(t) => {
              setBirthDate(t);
              // 생년월일 변경 시 이전 동의 상태 초기화 (다른 학생 등록 방지)
              setGuardianConsent(false);
            }}
            keyboardType="numbers-and-punctuation"
            inputAccessoryViewID={ACCESSORY_ID}
          />
          {birthDateInvalid && (
            <Text style={styles.errorHint}>
              {strings.createStudent.birthDateInvalid}
            </Text>
          )}
        </View>

        {/* ── 만 14세 미만 보호자 동의 체크박스 (PIPA 제22조) ── */}
        {showConsent && (
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>
              {strings.createStudent.guardianConsentTitle}
            </Text>
            <Text style={styles.consentDesc}>
              {strings.createStudent.guardianConsentDesc}
            </Text>
            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setGuardianConsent((v) => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, guardianConsent && styles.checkboxChecked]}>
                {guardianConsent && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
              <Text style={styles.consentLabel}>
                {strings.createStudent.guardianConsentLabel}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 주소 (선택) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>주소 <Text style={styles.optional}>(선택)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="예: 서울시 강남구 …"
            placeholderTextColor="#94A3B8"
            value={address}
            onChangeText={setAddress}
            autoCorrect={false}
          />
        </View>

        {/* 수강료 (선택) — 반 선택 시 default 자동 채움, 사용자 수정 가능 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>수강료 <Text style={styles.optional}>(선택)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="예: 290,000원"
            placeholderTextColor="#94A3B8"
            value={tuitionFee}
            onChangeText={(t) => {
              setTuitionFee(formatTuitionInput(t));
              setTuitionTouched(true);
            }}
            keyboardType="numeric"
            inputAccessoryViewID={ACCESSORY_ID}
          />
        </View>

        {/* 안내 박스 */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            ℹ️ 가상 이메일과 임시 비밀번호는 자동으로 생성돼요.{'\n'}
            생성 후 학생에게 인쇄물 또는 캡처로 전달하면 돼요.
          </Text>
        </View>

        {/* 학생 수 한도 안내 — 한도 도달 시 빨간 카드, 임박 시 노란 카드 */}
        {isLimitLoaded && !isUnlimited && (
          <View
            style={[
              styles.limitCard,
              isAtLimit ? styles.limitCardDanger : remaining <= 3 ? styles.limitCardWarning : styles.limitCardInfo,
            ]}
          >
            <Text
              style={[
                styles.limitTitle,
                isAtLimit ? styles.limitTitleDanger : remaining <= 3 ? styles.limitTitleWarning : styles.limitTitleInfo,
              ]}
            >
              {limitLabel === 'pending'
                ? `승인 전 학원 — 학생 ${count ?? 0} / ${limit}명`
                : `${limitLabel} 플랜 — 학생 ${count ?? 0} / ${limit}명`}
            </Text>
            <Text style={styles.limitDesc}>
              {isAtLimit
                ? limitLabel === 'pending'
                  ? '승인 완료 후 추가로 등록할 수 있어요. 카카오톡으로 문의해주세요.'
                  : '한도에 도달했어요. 더 등록하려면 상위 플랜으로 업그레이드해주세요.'
                : `남은 자리 ${remaining}명`}
            </Text>
          </View>
        )}

        {/* 생성 버튼 — 14세 미만 동의 미체크/형식 오류 시 비활성 */}
        <TouchableOpacity
          style={[
            styles.createBtn,
            (!name.trim() ||
              !selectedClassId ||
              isAtLimit ||
              birthDateInvalid ||
              (showConsent && !guardianConsent)) && styles.createBtnDisabled,
          ]}
          onPress={handleCreate}
          disabled={
            isLoading ||
            !name.trim() ||
            !selectedClassId ||
            isAtLimit ||
            birthDateInvalid ||
            (showConsent && !guardianConsent)
          }
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>
              {isAtLimit ? '학생 수 한도에 도달했어요' : '계정 만들기'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    {Platform.OS === 'ios' && (
      <InputAccessoryView nativeID={ACCESSORY_ID}>
        <View />
      </InputAccessoryView>
    )}
    </>
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

  // 생년월일 형식 오류 힌트
  errorHint: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 4,
  },

  // 만 14세 미만 보호자 동의 카드 (PIPA 제22조)
  consentCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  consentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
  },
  consentDesc: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 19,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#5B50E8',
    borderColor: '#5B50E8',
  },
  consentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },

  // 학생 수 한도 카드
  limitCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  limitCardInfo: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  limitCardWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  limitCardDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  limitTitle: { fontSize: 14, fontWeight: '700' },
  limitTitleInfo: { color: '#0F172A' },
  limitTitleWarning: { color: '#78350F' },
  limitTitleDanger: { color: '#991B1B' },
  limitDesc: { fontSize: 13, color: '#64748B', lineHeight: 18 },

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
