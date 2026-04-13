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
import { Ionicons } from '@expo/vector-icons';
import {
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
} from '../../lib/auth';
import { strings } from '../../constants/strings';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      setError(strings.auth.emailRequired);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (e: unknown) {
      setError((e as Error).message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError((e as Error).message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithApple();
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ERR_CANCELED') {
        setError((e as Error).message || strings.common.error);
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
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 제목 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}> 반가워요! 👋</Text>
          <Text style={styles.subtitle}>로그인하여 계속하세요</Text>
        </View>

        {/* ── 에러 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 입력 필드 ── */}
        <View style={styles.fieldList}>

          {/* 이메일 */}
          <View>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일 주소를 입력해주세요"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 비밀번호 */}
          <View>
            <Text style={styles.label}>비밀번호</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="비밀번호를 입력해주세요"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                onSubmitEditing={handleEmailLogin}
                returnKeyType="done"
              />
              {/* Ionicons 눈 아이콘 토글 */}
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
          </View>

        </View>

        {/* 비밀번호 찾기 */}
        <TouchableOpacity style={styles.forgotRow} disabled={isLoading}>
          <Text style={styles.forgotText}>비밀번호 찾기</Text>
        </TouchableOpacity>

        {/* ── 로그인 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
          onPress={handleEmailLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>로그인</Text>
          )}
        </TouchableOpacity>

        {/* ── 소셜 로그인 구분선 ── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>소셜 로그인</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── 소셜 버튼 ── */}
        <View style={styles.socialList}>

          {/* 카카오 — UI만 구현 */}
          <TouchableOpacity style={styles.btnKakao} activeOpacity={0.85} disabled={isLoading}>
            <Text style={styles.btnKakaoText}>💬 카카오로 로그인</Text>
          </TouchableOpacity>

          {/* Google */}
          <TouchableOpacity
            style={styles.btnGoogle}
            onPress={handleGoogleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnGoogleText}>🌐 Google로 로그인</Text>
          </TouchableOpacity>

          {/* Apple — iOS에서만 */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.btnApple}
              onPress={handleAppleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.btnAppleText}>🍎 Apple로 로그인</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* ── 회원가입 링크 ── */}
        <View style={styles.signupRow}>
          <Text style={styles.signupPrompt}>계정이 없으신가요? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} disabled={isLoading}>
            <Text style={styles.signupLink}>회원가입</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // ── 제목 ──
  titleArea: {
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
  },

  // ── 에러 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 입력 필드 ──
  fieldList: {
    gap: 12,
  },
  label: {
    fontSize: 11,
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
    fontSize: 15,
    color: '#0F172A',
  },

  // 비밀번호 래퍼 (눈 아이콘 포함)
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // 비밀번호 찾기
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 20,
  },
  forgotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B50E8',
  },

  // ── 로그인 버튼 ──
  btnPrimary: {
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 구분선 ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // ── 소셜 버튼 ──
  socialList: {
    gap: 10,
    marginBottom: 24,
  },

  // 카카오
  btnKakao: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FEE500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnKakaoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#191919',
  },

  // Google
  btnGoogle: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoogleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333333',
  },

  // Apple
  btnApple: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAppleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ── 회원가입 링크 ──
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signupPrompt: {
    fontSize: 13,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B50E8',
  },
});
