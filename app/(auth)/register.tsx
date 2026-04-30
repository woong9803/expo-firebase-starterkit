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
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { signUpWithEmail, createUserDoc, signInWithKakao, signInWithGoogle, signInWithApple } from '../../lib/auth';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
import { auth } from '../../lib/firebase';
import { strings } from '../../constants/strings';
import { LEGAL_URLS } from '../../constants/urls';

export default function RegisterScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // 어떤 소셜 버튼이 로딩 중인지 추적 ('kakao' | 'google' | 'apple' | null)
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);

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
      const userSnap = await getDoc(doc(db, 'users', credential.user.uid));
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

      if (!phoneVerified) {
        router.push('/(auth)/phone-input');
      } else if (!hasRole) {
        router.push('/(auth)/role-select');
      }
      // 모두 완료된 사용자는 _layout.tsx 자동 라우팅
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

  // 비밀번호 일치 여부
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const validate = (): string | null => {
    if (!name.trim()) return strings.auth.nameRequired;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return strings.auth.emailInvalid;
    if (password.length < 8) return strings.auth.passwordTooShort;
    if (password !== passwordConfirm) return strings.auth.passwordMismatch;
    return null;
  };

  const handleNext = async () => {
    // 약관 동의 미체크 시 진행 차단
    if (!termsAgreed) {
      Alert.alert(strings.auth.termsRequiredTitle, strings.auth.termsRequiredMessage);
      return;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email.trim(), password);

      // 계정 생성 직후 이름을 Firestore에 즉시 저장
      const currentUser = auth.currentUser;
      if (currentUser) {
        await createUserDoc(currentUser.uid, {
          name: name.trim(),
          email: email.trim(),
        });
      }

      router.push('/(auth)/phone-input');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/email-already-in-use') {
        setError(strings.auth.emailAlreadyInUse);
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
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: top + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 스텝 인디케이터: 4개 점, 1번째 활성 ── */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={i === 0 ? styles.stepActive : styles.stepInactive} />
          ))}
        </View>

        {/* ── 제목 영역 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>계정 만들기</Text>
          <Text style={styles.subtitle}>기본 정보를 입력해주세요</Text>
        </View>

        {/* ── 에러 박스 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 입력 필드 4개 ── */}
        <View style={styles.fieldList}>

          {/* 이름 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={styles.input}
              placeholder="이름을 입력해주세요"
              placeholderTextColor="#A0A0BC"
              value={name}
              onChangeText={(v) => { setName(v); setError(null); }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 이메일 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일 주소를 입력해주세요"
              placeholderTextColor="#A0A0BC"
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
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder="비밀번호를 입력해주세요"
              placeholderTextColor="#A0A0BC"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              secureTextEntry
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* 비밀번호 확인 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>비밀번호 확인</Text>
            <TextInput
              style={styles.input}
              placeholder="비밀번호를 한 번 더 입력해주세요"
              placeholderTextColor="#A0A0BC"
              value={passwordConfirm}
              onChangeText={(v) => { setPasswordConfirm(v); setError(null); }}
              secureTextEntry
              editable={!isLoading}
              returnKeyType="done"
              onSubmitEditing={handleNext}
            />
            {/* 비밀번호 일치 안내 */}
            {passwordMatch && (
              <Text style={styles.matchText}>✓ 비밀번호가 일치합니다</Text>
            )}
          </View>

        </View>

        {/* ── 약관 동의 ── */}
        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => setTermsAgreed((v) => !v)}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          {/* 체크박스 */}
          <View style={[styles.checkbox, termsAgreed && styles.checkboxChecked]}>
            {termsAgreed && <Text style={styles.checkmark}>✓</Text>}
          </View>

          {/* 약관 텍스트 — 링크 부분만 터치 가능 */}
          <Text style={styles.termsText}>
            {'(필수) '}
            <Text
              style={styles.termsLink}
              onPress={(e) => {
                e.stopPropagation();
                Linking.openURL(LEGAL_URLS.termsOfService);
              }}
            >
              이용약관
            </Text>
            {' 및 '}
            <Text
              style={styles.termsLink}
              onPress={(e) => {
                e.stopPropagation();
                Linking.openURL(LEGAL_URLS.privacyPolicy);
              }}
            >
              개인정보처리방침
            </Text>
            {'에 동의합니다.'}
          </Text>
        </TouchableOpacity>

        {/* ── 다음 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, (!termsAgreed || isLoading) && styles.btnDisabled]}
          onPress={handleNext}
          disabled={!termsAgreed || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>다음 →</Text>
          )}
        </TouchableOpacity>

        {/* ── 로그인 링크 ── */}
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>{strings.auth.hasAccount} </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} disabled={isLoading}>
            <Text style={styles.loginLink}>{strings.auth.loginLink}</Text>
          </TouchableOpacity>
        </View>

        {/* ── 소셜 로그인 구분선 ── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는 소셜 계정으로 계속하기</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── 소셜 버튼 3개 ── */}
        <View style={styles.socialList}>

          {/* 카카오 */}
          <TouchableOpacity style={[styles.btnKakao, isLoading && styles.btnSocialDisabled]} onPress={handleKakaoLogin} activeOpacity={0.85} disabled={isLoading}>
            {socialLoading === 'kakao' ? <ActivityIndicator size="small" color="#3C1E1E" /> : <KakaoIcon />}
            <Text style={styles.btnKakaoText}>카카오로 계속하기</Text>
          </TouchableOpacity>

          {/* Google */}
          <TouchableOpacity style={[styles.btnGoogle, isLoading && styles.btnSocialDisabled]} onPress={handleGoogleLogin} activeOpacity={0.85} disabled={isLoading}>
            {socialLoading === 'google' ? <ActivityIndicator size="small" color="#1A1A1A" /> : <GoogleIcon />}
            <Text style={styles.btnGoogleText}>Google로 계속하기</Text>
          </TouchableOpacity>

          {/* Apple — iOS에서만 */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={[styles.btnApple, isLoading && styles.btnSocialDisabled]} onPress={handleAppleLogin} activeOpacity={0.85} disabled={isLoading}>
              {socialLoading === 'apple' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppleIcon />}
              <Text style={styles.btnAppleText}>Apple로 계속하기</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* 소셜 로그인 후 온보딩 안내 문구 */}
        <Text style={styles.socialNote}>
          소셜 로그인 후에도 역할 선택 및{'\n'}학원 코드 입력 과정이 진행됩니다
        </Text>

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
    marginBottom: 24,
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
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },

  // ── 입력 필드 ──
  fieldList: {
    gap: 14,
    marginBottom: 24,
  },
  fieldGroup: {
    gap: 5,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  matchText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 4,
  },

  // ── 약관 동의 ──
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#5B50E8',
    borderColor: '#5B50E8',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  termsText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    flex: 1,
  },
  termsLink: {
    color: '#5B50E8',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── 버튼 ──
  btnPrimary: {
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── 로그인 링크 ──
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginPrompt: {
    fontSize: 13,
    color: '#64748B',
  },
  loginLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B50E8',
  },

  // ── 소셜 구분선 ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
  },
  dividerText: {
    fontSize: 13,
    color: '#8E8E93',
  },

  btnSocialDisabled: {
    opacity: 0.6,
  },

  // ── 소셜 버튼 ──
  socialList: {
    gap: 10,
  },
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
  socialNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 12,
    lineHeight: 18,
  },
});
