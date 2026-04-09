import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Collections } from '../../lib/firestore';
import { generateLinkCode } from '../../lib/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { AcademyType } from '../../types';
import { strings } from '../../constants/strings';

// 운영 유형 선택 옵션
const ACADEMY_TYPES: AcademyType[] = ['학원', '교습소', '개인과외'];

export default function AcademyRegisterScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [academyType, setAcademyType] = useState<AcademyType | null>(null);
  const [academyName, setAcademyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 유효성 검사 ─────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!academyType) return '운영 유형을 선택해주세요';
    if (!academyName.trim()) return strings.onboarding.allFieldsRequired;
    if (!ownerName.trim()) return strings.onboarding.allFieldsRequired;
    if (!ownerPhone.trim()) return strings.onboarding.allFieldsRequired;
    if (!address.trim()) return strings.onboarding.allFieldsRequired;
    return null;
  };

  // ─── 학원 등록 제출 ──────────────────────────────────────────────
  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      // 선생님 가입용 학원코드 자동 생성 (6자리 영숫자)
      const academyCode = generateLinkCode();

      // Firestore academies 컬렉션에 신규 문서 생성 (status: pending)
      const academyRef = await addDoc(Collections.academies(), {
        name: academyName.trim(),
        academy_code: academyCode,
        academy_type: academyType,
        owner_name: ownerName.trim(),
        owner_phone: ownerPhone.trim(),
        address: address.trim(),
        status: 'pending',       // 승인 대기 상태
        plan: 'free',
        trial_ends_at: null,
        approved_at: null,
        reject_reason: null,
        submitted_at: serverTimestamp(),
        created_at: serverTimestamp(),
      });

      // users 문서에 role: 'admin', academy_id 업데이트
      await updateDoc(Collections.user(user.uid), {
        role: 'admin',
        academy_id: academyRef.id,
      });

      // 승인 대기 화면으로 이동 (뒤로 가기 불필요 → replace)
      router.replace('/(auth)/pending');
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 타이틀 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{strings.onboarding.createAcademy}</Text>
          <Text style={styles.subtitle}>
            {strings.onboarding.createAcademySubtitle}
          </Text>
        </View>

        {/* ── 에러 메시지 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 운영 유형 선택 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {strings.onboarding.academyTypeTitle}
          </Text>
          <View style={styles.typeRow}>
            {ACADEMY_TYPES.map((type) => {
              const isSelected = academyType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    isSelected && styles.typeCardSelected,
                  ]}
                  onPress={() => { setAcademyType(type); setError(null); }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.typeCardText,
                      isSelected && styles.typeCardTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 학원 정보 입력 폼 ── */}
        <View style={styles.formSection}>
          {/* 학원 이름 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.onboarding.academyName}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.onboarding.academyNamePlaceholder}
              placeholderTextColor="#94A3B8"
              value={academyName}
              onChangeText={(v) => { setAcademyName(v); setError(null); }}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 대표자 이름 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.onboarding.ownerName}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.onboarding.ownerNamePlaceholder}
              placeholderTextColor="#94A3B8"
              value={ownerName}
              onChangeText={(v) => { setOwnerName(v); setError(null); }}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 대표자 연락처 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.onboarding.ownerPhone}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.onboarding.ownerPhonePlaceholder}
              placeholderTextColor="#94A3B8"
              value={ownerPhone}
              onChangeText={(v) => { setOwnerPhone(v); setError(null); }}
              keyboardType="phone-pad"
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 주소 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.onboarding.address}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.onboarding.addressPlaceholder}
              placeholderTextColor="#94A3B8"
              value={address}
              onChangeText={(v) => { setAddress(v); setError(null); }}
              editable={!isLoading}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>
        </View>

        {/* ── 학원 만들기 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {strings.onboarding.createAcademyBtn}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
  },

  // ── 타이틀 ──
  titleArea: {
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },

  // ── 에러 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 섹션 ──
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },

  // ── 운영 유형 카드 ──
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeCard: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  typeCardSelected: {
    borderColor: '#2176C7',
    backgroundColor: '#E6F1FB',
  },
  typeCardText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  typeCardTextSelected: {
    color: '#0C447C',
  },

  // ── 입력 폼 ──
  formSection: {
    gap: 16,
    marginBottom: 32,
  },
  inputWrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    height: 52,
    backgroundColor: '#2176C7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
