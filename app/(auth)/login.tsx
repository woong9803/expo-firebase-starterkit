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
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function KakaoIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 3C6.477 3 2 6.477 2 10.9c0 2.757 1.643 5.178 4.116 6.61L5.08 21l5.013-2.78A11.3 11.3 0 0012 18.4c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" fill="#3C1E1E" />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.27.07 2.14.74 2.89.8.94-.19 1.84-.89 3.06-.95 1.5-.08 2.63.56 3.39 1.47-3.07 1.85-2.58 5.9.27 7.07-.65 1.57-1.5 3.12-1.61 4.49zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="#ffffff" />
    </Svg>
  );
}

import {
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
  signInWithKakao,
  createUserDoc,
} from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { Collections } from '../../lib/firestore';
import { strings } from '../../constants/strings';

export default function LoginScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 어떤 소셜 버튼이 로딩 중인지 추적 ('kakao' | 'google' | 'apple' | null)
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
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
      // 진단용 — Firebase auth/* 원본 코드를 로그로 남김 (race condition 추적용)
      const err = e as { code?: string; message?: string };
      if (err?.code) {
        console.warn('[login] signInWithEmail 실패:', err.code, err.message);
      }
      setError(err?.message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  // 소셜 로그인 공통 처리 — 신규 유저면 phone-input으로, 기존 유저면 _layout 자동 라우팅
  const handleSocialLogin = async (
    provider: string,
    loginFn: () => Promise<{ user: { uid: string } }>,
    cancelCode?: string
  ) => {
    setIsLoading(true);
    setSocialLoading(provider);
    setError(null);
    try {
      const credential = await loginFn();

      // 온보딩 단계 판단을 위해 users 문서 상태 확인
      // (signInWithKakao는 카카오 닉네임을 받아 doc을 미리 생성할 수 있음 →
      //  doc 존재 여부만으로 신규/기존 구분 불가)
      const userSnap = await Collections.user(credential.user.uid).get();
      const data = userSnap.exists() ? userSnap.data() : null;

      // doc이 아직 없는 경우(Google/Apple 신규) — 즉시 생성
      if (!userSnap.exists()) {
        const fbUser = auth.currentUser;
        if (fbUser) {
          await createUserDoc(fbUser.uid, {
            name: fbUser.displayName ?? '',
            email: fbUser.email ?? '',
          });
        }
      }

      // 단계별 라우팅: phone_verified → role → academy_id 순으로 채워짐
      const phoneVerified = data?.phone_verified === true;
      const hasRole = !!data?.role;
      const hasAcademy = !!data?.academy_id;

      if (!phoneVerified) {
        router.push('/(auth)/phone-input');
      } else if (!hasRole) {
        router.push('/(auth)/role-select');
      }
      // 모두 완료된 사용자는 app/_layout.tsx의 onAuthStateChanged가 /(app)으로 자동 라우팅
      // (academy_id까지 있는 경우 — onboardingComplete = true)
      void hasAcademy; // unused — _layout이 처리
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      const message = (e as Error).message ?? '';
      // 사용자가 직접 취소한 경우 — 에러 표시 없이 조용히 종료
      if (cancelCode !== undefined && code === cancelCode) return;
      if (code === 'ERR_CANCELED') return;
      if (message.toLowerCase().includes('cancel')) return;
      setError(message || strings.common.error);
    } finally {
      setIsLoading(false);
      setSocialLoading(null);
    }
  };

  const handleKakaoLogin = () => handleSocialLogin('kakao', signInWithKakao);
  const handleGoogleLogin = () => handleSocialLogin('google', signInWithGoogle);
  const handleAppleLogin  = () => handleSocialLogin('apple', signInWithApple, 'ERR_CANCELED');

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: top + 24 }]}
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
        <TouchableOpacity
          style={styles.forgotRow}
          onPress={() => router.push('/(auth)/forgot-password')}
          disabled={isLoading}
        >
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
          <Text style={styles.dividerText}>또는 소셜 계정으로 계속하기</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── 소셜 버튼 ── */}
        <View style={styles.socialList}>

          {/* 카카오 */}
          <TouchableOpacity style={[styles.btnKakao, isLoading && styles.btnSocialDisabled]} onPress={handleKakaoLogin} activeOpacity={0.85} disabled={isLoading}>
            {socialLoading === 'kakao' ? <ActivityIndicator size="small" color="#3C1E1E" /> : <KakaoIcon />}
            <Text style={styles.btnKakaoText}>카카오로 계속하기</Text>
          </TouchableOpacity>

          {/* Google */}
          <TouchableOpacity
            style={[styles.btnGoogle, isLoading && styles.btnSocialDisabled]}
            onPress={handleGoogleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {socialLoading === 'google' ? <ActivityIndicator size="small" color="#1A1A1A" /> : <GoogleIcon />}
            <Text style={styles.btnGoogleText}>Google로 계속하기</Text>
          </TouchableOpacity>

          {/* Apple — iOS에서만 */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.btnApple, isLoading && styles.btnSocialDisabled]}
              onPress={handleAppleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {socialLoading === 'apple' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppleIcon />}
              <Text style={styles.btnAppleText}>Apple로 계속하기</Text>
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
    // paddingTop은 useSafeAreaInsets().top + 24 로 동적 계산 (기기별 노치/Dynamic Island 대응)
    paddingBottom: 40,
  },

  // ── 제목 ──
  titleArea: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
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
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 입력 필드 ──
  fieldList: {
    gap: 12,
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
    fontSize: 16,
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
    fontSize: 12,
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
    fontSize: 16,
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
    fontSize: 13,
    color: '#94A3B8',
  },

  // ── 소셜 버튼 ──
  socialList: {
    gap: 10,
    marginBottom: 24,
  },

  btnSocialDisabled: {
    opacity: 0.6,
  },

  // 카카오
  btnKakao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FEE500',
    width: '100%',
  },
  btnKakaoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3C1E1E',
  },

  // Google
  btnGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    width: '100%',
  },
  btnGoogleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // Apple
  btnApple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#000000',
    width: '100%',
  },
  btnAppleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── 회원가입 링크 ──
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signupPrompt: {
    fontSize: 14,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5B50E8',
  },
});
