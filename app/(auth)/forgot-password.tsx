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
  InputAccessoryView,
  Alert,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  sendPhoneOtpForReset,
  verifyPhoneOtp,
  resetPasswordByPhone,
  safeSignOut,
  PhoneConfirmationResult,
} from '../../lib/auth';
import { strings } from '../../constants/strings';

const ACCESSORY_ID = 'forgotPwOtp';
const OTP_LENGTH = 6;
const TIMER_TOTAL = 179;

type Step = 'phone' | 'otp' | 'newPassword';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  // ─── 공통 상태 ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('phone');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ─── 1단계: 번호 입력 ─────────────────────────────────────────────
  const [phone, setPhone] = useState('');

  // ─── 2단계: OTP 입력 ─────────────────────────────────────────────
  const [confirmationResult, setConfirmationResult] =
    useState<PhoneConfirmationResult | null>(null);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [resendTimer, setResendTimer] = useState(TIMER_TOTAL);
  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 3단계: 새 비밀번호 입력 ──────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 타이머 정리 — 컴포넌트 unmount 시 누수 방지
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── 1단계 → 2단계: OTP 발송 ────────────────────────────────────
  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError('휴대폰 번호를 입력해주세요');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await sendPhoneOtpForReset(phone.trim());
      setConfirmationResult(result);
      setStep('otp');
      // OTP 단계 진입과 동시에 타이머 시작
      setResendTimer(TIMER_TOTAL);
      timerRef.current = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.message === 'NOT_REGISTERED') {
        setError('등록되지 않은 번호예요. 번호를 다시 확인해주세요.');
      } else if (err.code === 'auth/too-many-requests') {
        setError(
          '이 기기에서 인증 시도가 너무 많아 일시 차단됐어요. 잠시 후 다시 시도해주세요.'
        );
      } else if (err.code === 'auth/quota-exceeded') {
        setError('일일 인증 한도에 도달했어요. 내일 다시 시도해주세요.');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('올바른 휴대폰 번호 형식이 아니에요.');
      } else {
        setError(strings.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── 2단계: OTP 입력 핸들러 ────────────────────────────────────
  const handleOtpChange = (text: string, index: number) => {
    const digits = text.replace(/[^0-9]/g, '');
    setError(null);
    // iOS SMS 자동 채우기 — 첫 칸에 6자리가 한 번에 들어오는 경우 분배
    if (index === 0 && digits.length === OTP_LENGTH) {
      const filled = digits.split('').slice(0, OTP_LENGTH);
      setOtp(filled);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }
    const digit = digits.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

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

  // ─── 2단계 → 3단계: OTP 검증 ─────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setError(strings.phoneVerify.otpIncomplete);
      return;
    }
    if (!confirmationResult) {
      setError('인증번호 발송 중이에요. 잠시 후 다시 시도해주세요.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // OTP 검증 → phone-auth 로 sign-in 됨 (request.auth.token 에 phone_number 포함)
      await verifyPhoneOtp(confirmationResult, code);
      if (timerRef.current) clearInterval(timerRef.current);
      setStep('newPassword');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/invalid-verification-code') {
        setError('인증번호가 올바르지 않아요.');
      } else if (err.code === 'auth/code-expired') {
        setError('인증번호가 만료됐어요. 처음부터 다시 시도해주세요.');
      } else {
        setError(strings.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── 3단계: 비밀번호 재설정 실행 ──────────────────────────────
  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      setError('비밀번호는 8자 이상이어야 해요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않아요.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await resetPasswordByPhone(phone.trim(), newPassword);
      // 비번 갱신 성공 — phone-auth 세션을 정리하고 로그인 화면으로
      await safeSignOut();
      Alert.alert(
        '비밀번호 재설정 완료',
        '새 비밀번호로 로그인해주세요.',
        [
          {
            text: '로그인하기',
            onPress: () => router.replace('/(auth)/login'),
          },
        ],
        { cancelable: false }
      );
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      // RN Firebase functions 에러는 code 가 'functions/...' 형태로 들어옴
      if (err.code === 'functions/permission-denied' || err.code === 'permission-denied') {
        setError('인증된 번호와 달라요. 처음부터 다시 시도해주세요.');
      } else if (err.code === 'functions/not-found' || err.code === 'not-found') {
        setError('해당 번호로 가입된 계정을 찾을 수 없어요.');
      } else if (
        err.code === 'functions/resource-exhausted' ||
        err.code === 'resource-exhausted'
      ) {
        setError(err.message || '시도 횟수가 너무 많아요. 잠시 후 다시 시도해주세요.');
      } else if (
        err.code === 'functions/invalid-argument' ||
        err.code === 'invalid-argument'
      ) {
        setError(err.message || '입력값을 확인해주세요.');
      } else {
        setError(err.message || strings.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // OTP 박스 스타일 분기
  const getBoxStyle = (index: number) => {
    const isFocused = focusedIndex === index;
    const isFilled = otp[index] !== '';
    if (isFilled) return [styles.otpBox, styles.otpBoxFilled];
    if (isFocused) return [styles.otpBox, styles.otpBoxFocused];
    return [styles.otpBox, styles.otpBoxEmpty];
  };

  const timerStr = `${Math.floor(resendTimer / 60)}:${(resendTimer % 60)
    .toString()
    .padStart(2, '0')}`;
  const timerProgress = resendTimer / TIMER_TOTAL;

  return (
    <>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: top + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 뒤로가기 ── */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (step === 'phone') router.back();
              else if (step === 'otp') setStep('phone');
              else setStep('otp');
              setError(null);
            }}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>

          {/* ── 스텝 인디케이터: 3개 dot ── */}
          <View style={styles.stepRow}>
            {(['phone', 'otp', 'newPassword'] as Step[]).map((s) => (
              <View
                key={s}
                style={step === s ? styles.stepActive : styles.stepInactive}
              />
            ))}
          </View>

          {/* ── 에러 ── */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ── 1단계: 번호 입력 ────────────────────────────── */}
          {step === 'phone' && (
            <>
              <View style={styles.titleArea}>
                <Text style={styles.title}>비밀번호 찾기</Text>
                <Text style={styles.subtitle}>
                  가입 시 등록한 휴대폰 번호를 입력해주세요
                </Text>
              </View>

              <View style={styles.iconWrap}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconEmoji}>🔑</Text>
                </View>
              </View>

              <View style={styles.fieldList}>
                <View>
                  <Text style={styles.label}>휴대폰 번호</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="01012345678"
                    placeholderTextColor="#94A3B8"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="number-pad"
                    autoComplete="tel"
                    editable={!isLoading}
                    onSubmitEditing={handleSendOtp}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>인증번호 받기</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── 2단계: OTP 입력 ────────────────────────────── */}
          {step === 'otp' && (
            <>
              <View style={styles.titleArea}>
                <Text style={styles.title}>인증번호 입력</Text>
                <Text style={styles.subtitle}>
                  {phone} 으로 발송된 6자리 코드를 입력해주세요
                </Text>
              </View>

              <View style={styles.otpSection}>
                <View style={styles.otpRow}>
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <TextInput
                      key={i}
                      ref={(ref) => {
                        inputRefs.current[i] = ref;
                      }}
                      style={[
                        ...getBoxStyle(i),
                        otp[i] ? styles.otpTextFilled : styles.otpText,
                      ]}
                      value={otp[i]}
                      onChangeText={(text) => handleOtpChange(text, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                      onFocus={() => setFocusedIndex(i)}
                      onBlur={() => setFocusedIndex(null)}
                      keyboardType="number-pad"
                      inputAccessoryViewID={ACCESSORY_ID}
                      maxLength={1}
                      textAlign="center"
                      editable={!isLoading}
                      textContentType={i === 0 ? 'oneTimeCode' : 'none'}
                      autoComplete={i === 0 ? 'sms-otp' : 'off'}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.timerCard}>
                <View style={styles.timerRow}>
                  <Text style={styles.timerLabel}>재시도까지</Text>
                  <Text style={styles.timerValue}>{timerStr}</Text>
                </View>
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${timerProgress * 100}%` as `${number}%` },
                    ]}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  (isLoading || otp.join('').length < OTP_LENGTH) &&
                    styles.btnDisabled,
                ]}
                onPress={handleVerifyOtp}
                disabled={isLoading || otp.join('').length < OTP_LENGTH}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>인증 확인</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── 3단계: 새 비밀번호 입력 ────────────────────────── */}
          {step === 'newPassword' && (
            <>
              <View style={styles.titleArea}>
                <Text style={styles.title}>새 비밀번호 설정</Text>
                <Text style={styles.subtitle}>
                  새로 사용할 비밀번호를 입력해주세요
                </Text>
              </View>

              <View style={styles.fieldList}>
                <View>
                  <Text style={styles.label}>새 비밀번호</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="8자 이상"
                      placeholderTextColor="#94A3B8"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      editable={!isLoading}
                      returnKeyType="next"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowNewPassword((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showNewPassword ? 'eye-outline' : 'eye-off-outline'}
                        size={18}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View>
                  <Text style={styles.label}>비밀번호 확인</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="새 비밀번호를 한 번 더 입력해주세요"
                      placeholderTextColor="#94A3B8"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      editable={!isLoading}
                      onSubmitEditing={handleResetPassword}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={
                          showConfirmPassword ? 'eye-outline' : 'eye-off-outline'
                        }
                        size={18}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>비밀번호 재설정</Text>
                )}
              </TouchableOpacity>
            </>
          )}
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

  // ── 뒤로가기 ──
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 8,
  },

  // ── 스텝 인디케이터 ──
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
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
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 20,
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
    marginTop: 24,
    marginBottom: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEEDF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },

  // ── 입력 필드 ──
  fieldList: {
    gap: 14,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0F172A',
  },

  // 비밀번호 래퍼
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // ── OTP 6칸 ──
  otpSection: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxEmpty: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  otpBoxFocused: {
    borderColor: '#5B50E8',
    backgroundColor: '#F8F7FF',
  },
  otpBoxFilled: {
    borderColor: '#5B50E8',
    backgroundColor: '#EEEDF9',
  },
  otpText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  otpTextFilled: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3730A3',
  },

  // ── 타이머 카드 ──
  timerCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 20,
    marginBottom: 20,
    gap: 10,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  timerValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#5B50E8',
  },
  progressBg: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 100,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5B50E8',
    borderRadius: 100,
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
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
