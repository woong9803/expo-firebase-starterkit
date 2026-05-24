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
  InputAccessoryView,
} from 'react-native';

// iOS phone-pad 키보드 Done 툴바 제거용 ID
const ACCESSORY_ID = 'academyRegister';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { Collections } from '../../lib/firestore';
import { generateLinkCode } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { AcademyType, User, Academy } from '../../types';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';

// 운영 유형 선택 옵션
const ACADEMY_TYPES: AcademyType[] = ['학원', '교습소', '개인과외'];

export default function AcademyRegisterScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { setUser, setAcademy } = useAuthStore();
  const currentUser = auth.currentUser;

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
    if (!currentUser) {
      setError('로그인 정보를 불러오지 못했어요. 다시 시도해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 선생님 가입용 학원코드 자동 생성 (6자리 영숫자)
      const academyCode = generateLinkCode();

      // 14일 무료 체험 만료일 계산 (domain-terms.md: trial 플랜 14일)
      // ⚠️ 클라이언트 시계 기반 — P2-12 완료 시 Rules에서 plan 필드 잠그면
      //    이후 plan 변경은 CF(verifyTossPayment)를 통해서만 가능
      const trialEndsAt = firestore.Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000);

      // Firestore academies 컬렉션에 신규 문서 생성 (status: pending)
      // owner_uid — P1-5: Rules에서 owner_uid == request.auth.uid 검증 + isOnboarding() 게이트로 uid당 1개 제한
      const academyRef = await Collections.academies().add({
        name: academyName.trim(),
        academy_code: academyCode,
        academy_type: academyType,
        owner_uid: currentUser.uid,
        owner_name: ownerName.trim(),
        owner_phone: ownerPhone.trim(),
        address: address.trim(),
        status: 'pending',       // 승인 대기 상태
        plan: 'trial',           // 14일 무료 체험 시작 (만료 시 free로 강등 — 추후 CF 구현 필요)
        trial_ends_at: trialEndsAt,
        approved_at: null,
        reject_reason: null,
        submitted_at: firestore.FieldValue.serverTimestamp(),
        created_at: firestore.FieldValue.serverTimestamp(),
      });

      // users 문서에 role: 'admin', academy_id 저장 (문서 없을 경우 생성)
      // ⚠️ phone_verified는 여기서 건드리지 않음 — phone-verify.tsx에서 이미 true로 저장됨
      //    (merge: true 이므로 필드를 생략하면 기존 값 유지)
      await Collections.user(currentUser.uid).set({
        role: 'admin',
        academy_id: academyRef.id,
        uid: currentUser.uid,
        email: currentUser.email ?? '',
        name: '',
        is_active: true,
        created_at: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Firestore 업데이트 후 store 즉시 반영
      const freshSnap = await Collections.user(currentUser.uid).get();
      if (freshSnap.exists()) {
        setUser(freshSnap.data() as User);
      }

      // academy 스토어도 즉시 반영 — status: 'pending' 이어야
      // AppLayout이 admin을 /(app)/(admin) 대신 /(auth)/pending으로 올바르게 라우팅함
      setAcademy({
        id: academyRef.id,
        name: academyName.trim(),
        academy_code: academyCode,
        academy_type: academyType!,
        owner_uid: currentUser.uid,
        owner_name: ownerName.trim(),
        owner_phone: ownerPhone.trim(),
        address: address.trim(),
        status: 'pending',
        plan: 'trial',           // 14일 무료 체험 시작
        trial_ends_at: trialEndsAt,
        approved_at: null,
        reject_reason: null,
      } as Academy);

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
    <>
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: top + 24 }]}
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
              inputAccessoryViewID={ACCESSORY_ID}
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
    {Platform.OS === 'ios' && (
      <InputAccessoryView nativeID={ACCESSORY_ID}>
        <View />
      </InputAccessoryView>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#ffffff', // 온보딩 화면은 흰 배경
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── 타이틀 ──
  titleArea: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },

  // ── 에러 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 섹션 ──
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155', // g700
    marginBottom: 10,
  },

  // ── 운영 유형 탭 버튼 ──
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeCard: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  typeCardSelected: {
    borderColor: '#5B50E8',
    backgroundColor: '#EEEDF9',
  },
  typeCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  typeCardTextSelected: {
    color: '#3730A3',
  },

  // ── 입력 폼 ──
  formSection: {
    gap: 12,
    marginBottom: 28,
  },
  inputWrapper: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155', // g700
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F1F0FB',
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    height: 52,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
