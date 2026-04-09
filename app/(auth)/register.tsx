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
import { signUpWithEmail } from '../../lib/auth';
import { strings } from '../../constants/strings';
import StepIndicator from '../../components/StepIndicator';

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 입력값 유효성 검사 ──────────────────────────────────────────
  const validate = (): string | null => {
    if (!name.trim()) return strings.auth.nameRequired;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return strings.auth.emailInvalid;

    if (password.length < 8) return strings.auth.passwordTooShort;
    if (password !== passwordConfirm) return strings.auth.passwordMismatch;

    return null;
  };

  // ─── 회원가입 처리 ───────────────────────────────────────────────
  const handleRegister = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await signUpWithEmail(email.trim(), password);
      // 성공 → 다음 온보딩 스텝(휴대폰 OTP 인증)으로 이동
      // 이름은 phone-verify 완료 후 createUserDoc 시점에 저장
      router.push({
        pathname: '/(auth)/phone-verify',
        params: { name: name.trim() },
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일이에요. 로그인해주세요.');
      } else {
        setError(err.message || strings.common.error);
      }
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
        {/* ── 스텝 인디케이터: 1단계 진행 중 ── */}
        <StepIndicator steps={3} current={1} />

        {/* ── 타이틀 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{strings.auth.registerTitle}</Text>
          <Text style={styles.subtitle}>{strings.auth.registerSubtitle}</Text>
        </View>

        {/* ── 에러 메시지 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 입력 폼 ── */}
        <View style={styles.inputGroup}>
          {/* 이름 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.auth.name}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.auth.namePlaceholder}
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={(v) => { setName(v); setError(null); }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 이메일 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.auth.email}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.auth.emailPlaceholder}
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 비밀번호 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.auth.password}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.auth.passwordPlaceholder}
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              secureTextEntry
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 비밀번호 확인 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{strings.auth.passwordConfirm}</Text>
            <TextInput
              style={styles.input}
              placeholder={strings.auth.passwordConfirmPlaceholder}
              placeholderTextColor="#94A3B8"
              value={passwordConfirm}
              onChangeText={(v) => { setPasswordConfirm(v); setError(null); }}
              secureTextEntry
              editable={!isLoading}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />
          </View>
        </View>

        {/* ── 다음 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>{strings.auth.nextButton}</Text>
          )}
        </TouchableOpacity>

        {/* ── 로그인 링크 ── */}
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>{strings.auth.hasAccount}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={isLoading}
          >
            <Text style={styles.loginLink}>{strings.auth.loginButton}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#F8FAFC', // g50
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
    color: '#0F172A', // g900
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B', // g500
  },

  // ── 에러 박스 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 입력 필드 ──
  inputGroup: {
    gap: 16,
    marginBottom: 24,
  },
  inputWrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155', // g700
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0', // g200
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0F172A', // g900
    backgroundColor: '#fff',
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    height: 52,
    backgroundColor: '#2176C7', // b500
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 로그인 링크 ──
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  loginPrompt: {
    fontSize: 14,
    color: '#64748B', // g500
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2176C7', // b500
  },
});
