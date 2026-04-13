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
import { signUpWithEmail, createUserDoc } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { strings } from '../../constants/strings';

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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

        {/* ── 다음 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
          onPress={handleNext}
          disabled={isLoading}
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
          <Text style={styles.loginPrompt}>이미 계정이 있으신가요? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} disabled={isLoading}>
            <Text style={styles.loginLink}>로그인하기</Text>
          </TouchableOpacity>
        </View>

        {/* ── 소셜 로그인 ── */}
        <View style={styles.socialSection}>
          <Text style={styles.socialLabel}>또는 소셜 계정으로 빠르게 시작</Text>
          <View style={styles.socialRow}>

            {/* 카카오 — 버튼만 구현, 기능은 나중에 */}
            <TouchableOpacity style={[styles.socialBtn, styles.socialKakao]} activeOpacity={0.85}>
              <Text style={styles.socialEmoji}>💬</Text>
            </TouchableOpacity>

            {/* Google */}
            <TouchableOpacity style={[styles.socialBtn, styles.socialGoogle]} activeOpacity={0.85}>
              <Text style={styles.socialGoogle_G}>G</Text>
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity style={[styles.socialBtn, styles.socialApple]} activeOpacity={0.85}>
              <Text style={styles.socialEmoji}>🍎</Text>
            </TouchableOpacity>

          </View>
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
    paddingTop: 24,
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

  // ── 소셜 로그인 섹션 ──
  socialSection: {
    backgroundColor: '#F1F0FB',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 12,
  },
  socialLabel: {
    fontSize: 12,
    color: '#6B6B8A',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },

  // 소셜 버튼 공통 (42×42, borderRadius 10)
  socialBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialKakao: {
    backgroundColor: '#FEE500',
  },
  socialGoogle: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E5E4F0',
  },
  socialApple: {
    backgroundColor: '#0F172A',
  },
  socialEmoji: {
    fontSize: 24,
  },
  socialGoogle_G: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4285F4',
  },
});
