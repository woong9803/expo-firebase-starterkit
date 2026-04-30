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

// iOS phone-pad 키보드 Done 버튼 제거용 ID
const ACCESSORY_ID = 'phoneInput';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkPhoneDuplicate } from '../../lib/auth';
import { strings } from '../../constants/strings';
import { useAuthStore } from '../../store/useAuthStore';

export default function PhoneInputScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const setPendingPhoneAuthNumber = useAuthStore((s) => s.setPendingPhoneAuthNumber);
  const [phone, setPhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 인증번호 발송 ─────────────────────────────────────────────────
  // ⚠️ 실제 동작 조건: APNs 키 설정 완료 + EAS Build(개발 빌드) 환경
  //    Expo Go에서는 APNs 토큰을 받을 수 없어 Phone Auth 미동작
  //    설정 방법: docs/APNs-setup.md 참조
  const handleSendOtp = async () => {
    if (!phone.trim()) { setError(strings.phoneVerify.phoneRequired); return; }

    setIsSending(true);
    setError(null);
    try {
      // 중복 번호 체크만 여기서 — 실제 OTP 발송은 phone-verify 화면에서 한 번만 수행
      // (이전엔 여기서 sendPhoneOtp 호출하고 phone-verify 에서 또 호출해서 SMS 가 두 번 옴)
      const isDuplicate = await checkPhoneDuplicate(phone.trim());
      if (isDuplicate) {
        setError(strings.errors.duplicatePhone);
        return;
      }
      // reCAPTCHA fallback 으로 앱이 외부에서 복귀했을 때 +not-found 가
      // phone-verify 로 다시 데려가기 위해 진행 중인 번호를 store 에 보관
      setPendingPhoneAuthNumber(phone.trim());
      router.push({ pathname: '/(auth)/phone-verify', params: { phone: phone.trim() } });
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };

      // 중복 번호
      if (err.message === 'DUPLICATE_PHONE') {
        setError(strings.errors.duplicatePhone);
        return;
      }

      // Firestore 권한 오류 (Missing or insufficient permissions)
      // 중복 체크 쿼리가 Rules 에 막혔을 때 — 메시지/코드 양쪽으로 잡기
      if (
        err.code === 'permission-denied' ||
        err.message?.includes('Missing or insufficient permissions')
      ) {
        setError('인증에 필요한 권한이 없어요. 잠시 후 다시 시도해주세요.');
        return;
      }

      // Firebase Phone Auth 에러 코드별 한국어 메시지
      switch (err.code) {
        case 'auth/invalid-phone-number':
          setError('올바른 휴대폰 번호 형식이 아니에요. 01012345678 형식으로 입력해주세요.');
          break;
        case 'auth/too-many-requests':
          setError('요청이 너무 많아요. 잠시 후 다시 시도해주세요.');
          break;
        case 'auth/quota-exceeded':
          setError('일일 인증 한도에 도달했어요. 내일 다시 시도해주세요.');
          break;
        case 'auth/missing-phone-number':
          setError(strings.phoneVerify.phoneRequired);
          break;
        default:
          // 그 외 영문 메시지는 사용자에게 노출하지 말 것 — 공통 한국어 문구로 대체
          setError(strings.common.error);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: top + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 스텝 인디케이터: 4개 dot, 2번째 활성 ── */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={i === 1 ? styles.stepActive : styles.stepInactive} />
          ))}
        </View>

        {/* ── 제목 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>휴대폰 인증</Text>
          <Text style={styles.subtitle}>모든 역할에 필수로 진행돼요</Text>
        </View>

        {/* ── 에러 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 📱 아이콘 ── */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>📱</Text>
          </View>
        </View>

        {/* ── 전화번호 입력 ── */}
        <View style={styles.inputSection}>
          <Text style={styles.fieldLabel}>휴대폰 번호</Text>
          <TextInput
            style={styles.input}
            placeholder="010-0000-0000"
            placeholderTextColor="#94A3B8"
            value={phone}
            onChangeText={(v) => { setPhone(v); setError(null); }}
            keyboardType="phone-pad"
            inputAccessoryViewID={ACCESSORY_ID}
            editable={!isSending}
            returnKeyType="done"
            onSubmitEditing={handleSendOtp}
          />
          <Text style={styles.hint}>
            입력한 번호로 인증번호 SMS가 발송돼요.{'\n'}번호를 정확히 입력해주세요.
          </Text>
        </View>

        {/* ── 스페이서 ── */}
        <View style={styles.spacer} />

        {/* ── 인증번호 받기 버튼 (하단 고정) ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isSending && styles.btnDisabled]}
          onPress={handleSendOtp}
          disabled={isSending}
          activeOpacity={0.85}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>인증번호 받기</Text>
          )}
        </TouchableOpacity>

        {/*
          개발 빌드 전용 — 시뮬레이터/Expo Go에서 휴대폰 인증 우회
          __DEV__ 가 false인 release 빌드에서는 자동으로 숨겨짐
        */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devSkipBtn}
            onPress={() => router.push('/(auth)/role-select')}
            activeOpacity={0.6}
          >
            <Text style={styles.devSkipText}>
              개발용 — 휴대폰 인증 건너뛰기
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
    {/* iOS: phone-pad 키보드 상단 Done 툴바를 빈 뷰로 교체해 숨김 */}
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
    backgroundColor: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // ── 스텝 인디케이터 ──
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  stepActive: {
    width: 28,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B50E8',
  },
  stepInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },

  // ── 제목 ──
  titleArea: {
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },

  // ── 에러 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 아이콘 ──
  iconWrap: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },

  // ── 입력 영역 ──
  inputSection: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },
  input: {
    height: 52,
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  hint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },

  spacer: {
    flex: 1,
    minHeight: 32,
  },

  // ── 버튼 ──
  btnPrimary: {
    width: '100%',
    height: 52,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // 개발 빌드 전용 우회 버튼 — release에선 렌더 안 됨
  devSkipBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  devSkipText: {
    fontSize: 12,
    color: '#94A3B8',
    textDecorationLine: 'underline',
  },
});
