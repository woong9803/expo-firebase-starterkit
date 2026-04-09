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
import {
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
  signInWithKakao,
} from '../../lib/auth';
import { strings } from '../../constants/strings';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 이메일 로그인 ────────────────────────────────────────────────
  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      setError(strings.auth.emailRequired);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
      // 성공 시 app/_layout.tsx의 onAuthStateChanged가 /(app)/으로 자동 이동
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Google 로그인 ────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Apple 로그인 (iOS 전용) ──────────────────────────────────────
  const handleAppleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithApple();
    } catch (e: unknown) {
      const err = e as Error;
      // 사용자가 직접 취소한 경우 에러 표시 생략
      if ((e as { code?: string }).code !== 'ERR_CANCELED') {
        setError(err.message || strings.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── 카카오 로그인 ────────────────────────────────────────────────
  const handleKakaoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithKakao();
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
        {/* ── 로고 & 타이틀 ── */}
        <View style={styles.logoArea}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>E</Text>
          </View>
          <Text style={styles.title}>{strings.auth.loginTitle}</Text>
          <Text style={styles.subtitle}>{strings.auth.loginSubtitle}</Text>
        </View>

        {/* ── 에러 메시지 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 이메일/비밀번호 입력 ── */}
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            placeholder={strings.auth.emailPlaceholder}
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <TextInput
            style={styles.input}
            placeholder={strings.auth.passwordPlaceholder}
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
            onSubmitEditing={handleEmailLogin}
            returnKeyType="done"
          />
        </View>

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
            <Text style={styles.btnPrimaryText}>{strings.auth.loginButton}</Text>
          )}
        </TouchableOpacity>

        {/* ── 구분선 ── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{strings.auth.orDivider}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── 소셜 로그인 버튼 ── */}
        <View style={styles.socialGroup}>
          {/* Google */}
          <TouchableOpacity
            style={styles.btnGoogle}
            onPress={handleGoogleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnGoogleText}>{strings.auth.googleLogin}</Text>
          </TouchableOpacity>

          {/* Apple — iOS 전용 */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.btnApple}
              onPress={handleAppleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.btnAppleText}>{strings.auth.appleLogin}</Text>
            </TouchableOpacity>
          )}

          {/* 카카오 */}
          <TouchableOpacity
            style={styles.btnKakao}
            onPress={handleKakaoLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnKakaoText}>{strings.auth.kakaoLogin}</Text>
          </TouchableOpacity>
        </View>

        {/* ── 회원가입 링크 ── */}
        <View style={styles.signupRow}>
          <Text style={styles.signupPrompt}>{strings.auth.noAccount}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            disabled={isLoading}
          >
            <Text style={styles.signupLink}>{strings.auth.signupButton}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: '#F8FAFC', // g50 — 페이지 배경
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // ── 로고 영역 ──
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#2176C7', // b500 — 주요 버튼
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A', // g900 — 주요 텍스트
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B', // g500 — 서브 텍스트
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
    gap: 12,
    marginBottom: 16,
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

  // ── 구분선 ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0', // g200
  },
  dividerText: {
    fontSize: 13,
    color: '#94A3B8', // g400
  },

  // ── 소셜 버튼 ──
  socialGroup: {
    gap: 12,
    marginBottom: 32,
  },
  btnGoogle: {
    height: 52,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0', // g200
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoogleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  btnApple: {
    height: 52,
    backgroundColor: '#0F172A', // g900
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAppleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  btnKakao: {
    height: 52,
    backgroundColor: '#FEE500', // 카카오 옐로우
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnKakaoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#191919',
  },

  // ── 회원가입 링크 ──
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  signupPrompt: {
    fontSize: 14,
    color: '#64748B', // g500
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2176C7', // b500
  },
});
