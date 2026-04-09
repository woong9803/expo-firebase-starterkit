import React, { useState, useRef, useEffect } from 'react';
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
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConfirmationResult } from 'firebase/auth';
import { sendPhoneOtp, verifyPhoneOtp, createUserDoc } from '../../lib/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';
import StepIndicator from '../../components/StepIndicator';

// OTP 칸 개수
const OTP_LENGTH = 6;

export default function PhoneVerifyScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const { user } = useAuthStore();

  // ─── 전화번호 입력 단계 ──────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [isSending, setIsSending] = useState(false);

  // ─── OTP 입력 단계 ──────────────────────────────────────────────
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // ─── 재전송 타이머 ───────────────────────────────────────────────
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 에러 ────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);

  // OTP 입력칸 ref 배열
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));

  // 60초 재전송 타이머 시작
  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResendTimer(60);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 컴포넌트 언마운트 시 타이머 해제
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── 인증번호 발송 ───────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError(strings.phoneVerify.phoneRequired);
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      // appVerifier 없이 호출 — 실제 기기(iOS/Android)에서는 APNs/FCM으로 자동 처리
      const result = await sendPhoneOtp(phone.trim());
      setConfirmationResult(result);
      startResendTimer();
      // OTP 단계로 전환 후 첫 번째 칸에 포커스
      setTimeout(() => inputRefs.current[0]?.focus(), 300);
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message === 'DUPLICATE_PHONE') {
        setError(strings.errors.duplicatePhone);
      } else {
        setError(err.message || strings.common.error);
      }
    } finally {
      setIsSending(false);
    }
  };

  // ─── OTP 한 칸 입력 처리 ────────────────────────────────────────
  const handleOtpChange = (text: string, index: number) => {
    // 숫자만 허용
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError(null);

    // 값 입력 시 다음 칸으로 자동 포커스
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Backspace 시 이전 칸으로 포커스 이동
  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  // ─── OTP 검증 ────────────────────────────────────────────────────
  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setError(strings.phoneVerify.otpIncomplete);
      return;
    }
    if (!confirmationResult) return;

    setIsVerifying(true);
    setError(null);
    try {
      await verifyPhoneOtp(confirmationResult, code);

      // 인증 성공 → Firestore users 문서에 이름과 전화번호 저장
      if (user?.uid) {
        await createUserDoc(user.uid, {
          name: name ?? '',
          phone_number: phone.trim(),
          phone_verified: true,
          email: user.email ?? '',
          role: 'student', // 역할 선택 전 임시값 — role-select에서 덮어씀
          is_active: true,
          class_id: null,
          link_code: null,
          children: [],
          birth_date: null,
          guardian_phone: null,
          enrollment_date: null,
          deleted_at: null,
          academy_id: '',
        });
      }

      // 다음 온보딩 스텝: 역할 선택
      router.push('/(auth)/role-select');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/invalid-verification-code') {
        setError('인증번호가 올바르지 않아요. 다시 확인해주세요.');
      } else if (err.code === 'auth/code-expired') {
        setError('인증번호가 만료됐어요. 재전송해주세요.');
      } else {
        setError(err.message || strings.common.error);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // ─── 재전송 ──────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendTimer > 0) return;
    setOtp(Array(OTP_LENGTH).fill(''));
    setError(null);
    await handleSendOtp();
  };

  // OTP 칸 한 개의 스타일 결정
  const getBoxStyle = (index: number) => {
    const isFocused = focusedIndex === index;
    const isFilled = otp[index] !== '';
    if (isFilled) return [styles.otpBox, styles.otpBoxFilled];
    if (isFocused) return [styles.otpBox, styles.otpBoxFocused];
    return [styles.otpBox, styles.otpBoxEmpty];
  };

  const getTextStyle = (index: number) => {
    return otp[index] !== '' ? styles.otpTextFilled : styles.otpText;
  };

  const isOtpPhase = confirmationResult !== null;

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
        {/* ── 스텝 인디케이터: 2단계 진행 중 ── */}
        <StepIndicator steps={3} current={2} />

        {/* ── 타이틀 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{strings.phoneVerify.title}</Text>
          <Text style={styles.subtitle}>
            {isOtpPhase
              ? `${phone}${strings.phoneVerify.otpSentSuffix}`
              : strings.phoneVerify.subtitle}
          </Text>
        </View>

        {/* ── 에러 메시지 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 전화번호 입력 단계 ── */}
        {!isOtpPhase && (
          <View style={styles.phoneSection}>
            <View style={styles.phoneInputRow}>
              {/* 국가코드 표시 */}
              <View style={styles.countryCode}>
                <Text style={styles.countryCodeText}>+82</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder={strings.phoneVerify.phonePlaceholder}
                placeholderTextColor="#94A3B8"
                value={phone}
                onChangeText={(v) => { setPhone(v); setError(null); }}
                keyboardType="phone-pad"
                editable={!isSending}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />
            </View>

            <TouchableOpacity
              style={[styles.btnPrimary, isSending && styles.btnDisabled]}
              onPress={handleSendOtp}
              disabled={isSending}
              activeOpacity={0.85}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {strings.phoneVerify.sendOtp}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── OTP 입력 단계 ── */}
        {isOtpPhase && (
          <View style={styles.otpSection}>
            {/* OTP 6칸 박스 */}
            <View style={styles.otpRow}>
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { inputRefs.current[i] = ref; }}
                  style={getBoxStyle(i)}
                  value={otp[i]}
                  onChangeText={(text) => handleOtpChange(text, i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  onFocus={() => setFocusedIndex(i)}
                  onBlur={() => setFocusedIndex(null)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                  editable={!isVerifying}
                  textContentType="oneTimeCode" // iOS 자동완성 힌트
                  caretHidden
                >
                  {/* TextInput 안에 Text 직접 렌더해서 색상 제어 */}
                  <Text style={getTextStyle(i)}>{otp[i]}</Text>
                </TextInput>
              ))}
            </View>

            {/* 재전송 버튼 */}
            <TouchableOpacity
              style={styles.resendBtn}
              onPress={handleResend}
              disabled={resendTimer > 0 || isVerifying}
            >
              <Text
                style={[
                  styles.resendText,
                  resendTimer > 0 && styles.resendTextDisabled,
                ]}
              >
                {resendTimer > 0
                  ? `${resendTimer}${strings.phoneVerify.resendTimerSuffix}`
                  : strings.phoneVerify.resendOtp}
              </Text>
            </TouchableOpacity>

            {/* 확인 버튼 */}
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                (isVerifying || otp.join('').length < OTP_LENGTH) &&
                  styles.btnDisabled,
              ]}
              onPress={handleVerify}
              disabled={isVerifying || otp.join('').length < OTP_LENGTH}
              activeOpacity={0.85}
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {strings.phoneVerify.confirm}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    lineHeight: 20,
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

  // ── 전화번호 입력 ──
  phoneSection: {
    gap: 16,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  countryCode: {
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#fff',
  },

  // ── OTP 입력 ──
  otpSection: {
    gap: 24,
    alignItems: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },

  // OTP 박스 공통 — ui-screens.md 스펙 준수 (38×46px)
  otpBox: {
    width: 38,
    height: 46,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  // 미입력: border #E2E8F0 + bg #F8FAFC
  otpBoxEmpty: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  // 현재 입력 포커스: border #2176C7 + glow ring #B5D4F4
  otpBoxFocused: {
    borderColor: '#2176C7',
    backgroundColor: '#fff',
    shadowColor: '#B5D4F4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  // 입력됨: border #378ADD + bg #E6F1FB
  otpBoxFilled: {
    borderColor: '#378ADD',
    backgroundColor: '#E6F1FB',
  },
  otpText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  // 입력됨: color #0C447C
  otpTextFilled: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0C447C',
  },

  // ── 재전송 버튼 ──
  resendBtn: {
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2176C7',
  },
  resendTextDisabled: {
    color: '#94A3B8',
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    width: '100%',
    height: 52,
    backgroundColor: '#2176C7',
    borderRadius: 10,
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
});
