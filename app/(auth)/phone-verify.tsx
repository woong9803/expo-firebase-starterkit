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
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';

// iOS number-pad 키보드 Done 툴바 제거용 ID
const ACCESSORY_ID = 'phoneVerify';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendPhoneOtp, verifyPhoneOtp, updateUserDoc, recordPhoneLookup, PhoneConfirmationResult } from '../../lib/auth';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';

const OTP_LENGTH = 6;
const TIMER_TOTAL = 179;

export default function PhoneVerifyScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { user } = useAuthStore();

  const [confirmationResult, setConfirmationResult] = useState<PhoneConfirmationResult | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(TIMER_TOTAL);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 화면 진입 시 OTP 자동 발송 (네이티브 APNs 자동 검증)
  useEffect(() => {
    if (!phone) return;
    setIsSendingOtp(true);
    setError(null);
    sendPhoneOtp(phone)
      .then((result) => setConfirmationResult(result))
      .catch((e: unknown) => {
        const err = e as { code?: string; message?: string };
        if (err.message === 'DUPLICATE_PHONE') {
          setError(strings.errors.duplicatePhone);
        } else if (err.code === 'auth/too-many-requests') {
          setError('이 기기에서 인증 시도가 너무 많아 일시 차단됐어요. 잠시 후 다시 시도해주세요.');
        } else if (err.code === 'auth/quota-exceeded') {
          setError('일일 인증 한도에 도달했어요. 내일 다시 시도해주세요.');
        } else if (err.code === 'auth/invalid-phone-number') {
          setError('올바른 휴대폰 번호 형식이 아니에요.');
        } else if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
          setError('인증에 필요한 권한이 없어요. 잠시 후 다시 시도해주세요.');
        } else {
          setError(strings.common.error);
        }
      })
      .finally(() => setIsSendingOtp(false));
  }, [phone]);

  // 타이머 시작
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const timerStr = `${Math.floor(resendTimer / 60)}:${(resendTimer % 60).toString().padStart(2, '0')}`;
  const timerProgress = resendTimer / TIMER_TOTAL;

  // ─── OTP 입력 ──────────────────────────────────────────────────────
  const handleOtpChange = (text: string, index: number) => {
    const digits = text.replace(/[^0-9]/g, '');
    setError(null);

    // iOS SMS 자동 채우기: 첫 칸에 6자리 한 번에 들어오는 경우 → 각 칸에 분배
    if (index === 0 && digits.length === OTP_LENGTH) {
      const filled = digits.split('').slice(0, OTP_LENGTH);
      setOtp(filled);
      // 마지막 칸에 포커스 → 키보드 닫고 자동 검증 가능 상태로
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    // 일반 입력 — 마지막 한 글자만 사용 (붙여넣기 일부 보호)
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

  // ─── OTP 검증 ──────────────────────────────────────────────────────
  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) { setError(strings.phoneVerify.otpIncomplete); return; }
    if (!confirmationResult) {
      setError('인증번호 발송 중이에요. 잠시 후 다시 시도해주세요.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    // ─── 단계 1: OTP 검증 ──────────────────────────────────
    try {
      await verifyPhoneOtp(confirmationResult, code);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/invalid-verification-code') setError('인증번호가 올바르지 않아요.');
      else if (err.code === 'auth/code-expired') setError('인증번호가 만료됐어요. 재전송해주세요.');
      else setError(strings.common.error);
      setIsVerifying(false);
      return;
    }

    // ─── 단계 2: users 문서 업데이트 ──────────────────────────
    if (user?.uid) {
      try {
        await updateUserDoc(user.uid, {
          phone_number: phone ?? '',
          phone_verified: true,
          class_id: null,
          link_code: null,
          children: [],
          assigned_class_ids: [],
          birth_date: null,
          guardian_phone: null,
          enrollment_date: null,
          academy_id: '',
        });
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        // 디버그용 — 어느 단계에서 막혔는지 명확히 표시
        if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
          setError('[단계2-users] 권한 오류. uid=' + user.uid);
        } else if (err.code === 'not-found') {
          setError('[단계2-users] 본인 사용자 문서가 없어요. (kakaoLogin이 users 문서 생성을 안 한 듯)');
        } else {
          setError('[단계2-users] ' + (err.code || err.message || '오류'));
        }
        setIsVerifying(false);
        return;
      }

      // ─── 단계 3: phone_lookups 매핑 ────────────────────────
      if (phone) {
        try {
          await recordPhoneLookup(phone, user.uid);
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string };
          if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
            setError('[단계3-phone_lookups] 권한 오류. uid=' + user.uid);
          } else {
            setError('[단계3-phone_lookups] ' + (err.code || err.message || '오류'));
          }
          setIsVerifying(false);
          return;
        }
      }
    }

    setIsVerifying(false);
    router.push('/(auth)/role-select');
  };

  // OTP 박스 스타일 분기
  const getBoxStyle = (index: number) => {
    const isFocused = focusedIndex === index;
    const isFilled = otp[index] !== '';
    if (isFilled)  return [styles.otpBox, styles.otpBoxFilled];
    if (isFocused) return [styles.otpBox, styles.otpBoxFocused];
    return [styles.otpBox, styles.otpBoxEmpty];
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

        {/* ── 📱 아이콘 + 발송 안내 ── */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>📱</Text>
          </View>
          <Text style={styles.sentText}>{phone ?? ''} 으로</Text>
          <Text style={styles.sentText}>인증번호를 발송했어요</Text>
        </View>

        {/* ── OTP 6칸 ── */}
        <View style={styles.otpSection}>
          <Text style={styles.otpLabel}>인증번호 6자리 입력</Text>
          <View style={styles.otpRow}>
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                // children Text 를 두면 iOS 가 value 와 children 을 둘 다 렌더해 숫자가 겹쳐 보이고
                // 백스페이스 동작이 막히는 버그 발생 — 폰트 스타일을 TextInput 자체에 적용해 해결
                style={[...getBoxStyle(i), otp[i] ? styles.otpTextFilled : styles.otpText]}
                value={otp[i]}
                onChangeText={(text) => handleOtpChange(text, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex(null)}
                keyboardType="number-pad"
                inputAccessoryViewID={ACCESSORY_ID}
                maxLength={1}
                textAlign="center"
                editable={!isVerifying}
                // SMS 자동입력은 첫 칸에만 oneTimeCode 지정해야 iOS 가 안정적으로 인식
                textContentType={i === 0 ? 'oneTimeCode' : 'none'}
                autoComplete={i === 0 ? 'sms-otp' : 'off'}
              />
            ))}
          </View>
        </View>

        {/* ── 타이머 카드 ── */}
        <View style={styles.timerCard}>
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>재발송까지</Text>
            <Text style={styles.timerValue}>{timerStr}</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${timerProgress * 100}%` as any }]} />
          </View>
        </View>

        {/* ── 인증 확인 버튼 ── */}
        <TouchableOpacity
          style={[
            styles.btnConfirm,
            (isVerifying || otp.join('').length < OTP_LENGTH) && styles.btnDisabled,
          ]}
          onPress={handleVerify}
          disabled={isVerifying || otp.join('').length < OTP_LENGTH}
          activeOpacity={0.85}
        >
          {isVerifying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnConfirmText}>인증 확인</Text>
          )}
        </TouchableOpacity>

        {/* ── 번호 오류 재입력 ── */}
        <TouchableOpacity
          style={styles.retryRow}
          onPress={() => router.back()}
        >
          <Text style={styles.retryText}>
            번호 오류?{' '}
            <Text style={styles.retryLink}>다시 입력하기</Text>
          </Text>
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

  // ── 아이콘 + 발송 안내 ──
  iconWrap: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
    gap: 6,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F1FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconEmoji: {
    fontSize: 30,
  },
  sentText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },

  // ── OTP 6칸 ──
  otpSection: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 0,
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
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

  // ── 인증 확인 버튼 ──
  btnConfirm: {
    width: '100%',
    height: 52,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 번호 오류 재입력 ──
  retryRow: {
    alignItems: 'center',
  },
  retryText: {
    fontSize: 12,
    color: '#64748B',
  },
  retryLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B50E8',
  },
});
