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
import { sendPhoneOtp, updateUserDoc } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { strings } from '../../constants/strings';
import { getDoc } from 'firebase/firestore';
import { Collections } from '../../lib/firestore';
import { User } from '../../types';

export default function PhoneInputScreen() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [phone, setPhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 인증번호 발송 ─────────────────────────────────────────────────
  // ⚠️ 임시 스킵 중 — APNs 설정 후 주석 해제
  const handleSendOtp = async () => {
    if (!phone.trim()) { setError(strings.phoneVerify.phoneRequired); return; }

    // TODO: APNs 설정 완료 후 활성화
    // setIsSending(true);
    // setError(null);
    // try {
    //   const result = await sendPhoneOtp(phone.trim());
    //   router.push({ pathname: '/(auth)/phone-verify', params: { phone: phone.trim(), confirmationToken: '' } });
    // } catch (e: unknown) {
    //   const err = e as Error;
    //   if (err.message === 'DUPLICATE_PHONE') setError(strings.errors.duplicatePhone);
    //   else setError(err.message || strings.common.error);
    // } finally {
    //   setIsSending(false);
    // }

    // 임시 스킵: OTP 없이 바로 다음 단계로
    const currentUser = auth.currentUser;
    if (currentUser) {
      await updateUserDoc(currentUser.uid, {
        phone_number: phone.trim(),
        phone_verified: true,
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
      const freshSnap = await getDoc(Collections.user(currentUser.uid));
      if (freshSnap.exists()) setUser(freshSnap.data() as User);
    }
    router.push('/(auth)/role-select');
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
  content: {
    flexGrow: 1,
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
});
