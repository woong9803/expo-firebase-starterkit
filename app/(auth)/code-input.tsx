import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { arrayUnion, updateDoc } from 'firebase/firestore';
import {
  validateAcademyCode,
  validateInviteCode,
  validateLinkCode,
  generateLinkCode,
} from '../../lib/auth';
import { Collections } from '../../lib/firestore';
import { useAuthStore } from '../../store/useAuthStore';
import { UserRole } from '../../types';
import { strings } from '../../constants/strings';
import StepIndicator from '../../components/StepIndicator';

// 브루트포스 방지 설정
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;

export default function CodeInputScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: string }>();
  const { user } = useAuthStore();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 브루트포스 방지 상태 ────────────────────────────────────────
  const [attemptCount, setAttemptCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 잠금 타이머 카운트다운
  useEffect(() => {
    if (lockTimer <= 0 && isLocked) {
      setIsLocked(false);
      setAttemptCount(0);
      setError(null);
    }
  }, [lockTimer, isLocked]);

  // 컴포넌트 언마운트 시 타이머 해제
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 5회 오류 시 30초 잠금 시작
  const startLockTimer = () => {
    setIsLocked(true);
    setLockTimer(LOCK_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setLockTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 오류 처리: 시도 횟수 증가 및 잠금 여부 판단
  const handleFailure = (message: string) => {
    const newCount = attemptCount + 1;
    setAttemptCount(newCount);
    if (newCount >= MAX_ATTEMPTS) {
      startLockTimer();
      setError(`${strings.onboarding.lockedMessage}`);
    } else {
      setError(`${message} (${newCount}/${MAX_ATTEMPTS}회)`);
    }
  };

  // ─── 역할별 안내 텍스트 ──────────────────────────────────────────
  const getPlaceholder = () => {
    if (role === 'teacher') return strings.onboarding.academyCodePlaceholder;
    if (role === 'student') return strings.onboarding.inviteCodePlaceholder;
    return strings.onboarding.linkCodePlaceholder;
  };

  const getTitle = () => {
    if (role === 'teacher') return strings.onboarding.academyCode;
    if (role === 'student') return strings.onboarding.inviteCode;
    return strings.onboarding.linkCode;
  };

  const getSubtitle = () => {
    if (role === 'teacher') return '학원에서 받은 학원코드를 입력해주세요';
    if (role === 'student') return '선생님에게 받은 반 코드를 입력해주세요';
    return '자녀의 연동코드를 입력해주세요';
  };

  // ─── 코드 검증 및 Firestore 업데이트 ────────────────────────────
  const handleConfirm = async () => {
    if (!code.trim() || !user) return;
    if (isLocked) return;

    setIsLoading(true);
    setError(null);

    try {
      if (role === 'teacher') {
        // 학원코드 검증 → teacher로 활성화
        const academyId = await validateAcademyCode(code.trim());
        if (!academyId) {
          handleFailure(strings.errors.invalidCode);
          return;
        }
        await updateDoc(Collections.user(user.uid), {
          role: 'teacher' as UserRole,
          academy_id: academyId,
        });

      } else if (role === 'student') {
        // 반 초대코드 검증 → student로 활성화 + linkCode 발급
        const result = await validateInviteCode(code.trim());
        if (!result) {
          handleFailure(strings.errors.invalidCode);
          return;
        }
        const linkCode = generateLinkCode();
        await updateDoc(Collections.user(user.uid), {
          role: 'student' as UserRole,
          class_id: result.classId,
          academy_id: result.academyId,
          link_code: linkCode, // 학부모 연동용 6자리 코드 자동 발급
        });

      } else if (role === 'parent') {
        // 자녀 연동코드 검증 → parent로 활성화 + 자녀 연결
        const studentUid = await validateLinkCode(code.trim());
        if (!studentUid) {
          handleFailure(strings.errors.invalidCode);
          return;
        }
        await updateDoc(Collections.user(user.uid), {
          role: 'parent' as UserRole,
          children: arrayUnion(studentUid), // 다자녀 지원 — 기존 배열에 추가
        });
      }

      // 성공 → 앱 메인으로 이동 (역할 분기는 (app)/_layout.tsx에서 처리)
      router.replace('/(app)');

    } catch (e: unknown) {
      const err = e as Error;
      handleFailure(err.message || strings.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || isLocked || !code.trim();

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
        {/* ── 스텝 인디케이터: 3단계 진행 중 ── */}
        <StepIndicator steps={3} current={3} />

        {/* ── 타이틀 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>
        </View>

        {/* ── 에러 / 잠금 메시지 ── */}
        {error && (
          <View style={[styles.errorBox, isLocked && styles.lockedBox]}>
            <Text style={[styles.errorText, isLocked && styles.lockedText]}>
              {isLocked
                ? `${lockTimer}${strings.onboarding.lockedSuffix}`
                : error}
            </Text>
          </View>
        )}

        {/* ── 코드 입력 ── */}
        <TextInput
          style={[styles.input, isLocked && styles.inputDisabled]}
          placeholder={getPlaceholder()}
          placeholderTextColor="#94A3B8"
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase()); setError(null); }}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isLoading && !isLocked}
          returnKeyType="done"
          onSubmitEditing={handleConfirm}
        />

        {/* ── 확인 버튼 ── */}
        <TouchableOpacity
          style={[styles.btnPrimary, isDisabled && styles.btnDisabled]}
          onPress={handleConfirm}
          disabled={isDisabled}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {strings.onboarding.confirm}
            </Text>
          )}
        </TouchableOpacity>

        {/* ── 시도 횟수 안내 ── */}
        {attemptCount > 0 && !isLocked && (
          <Text style={styles.attemptsText}>
            {`코드가 올바르지 않아요 · ${attemptCount}/${MAX_ATTEMPTS}회 시도`}
          </Text>
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
  },

  // ── 에러/잠금 박스 ──
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  lockedBox: {
    backgroundColor: '#FFFBEB', // amber bg
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
  },
  lockedText: {
    color: '#78350F',
    fontWeight: '600',
  },

  // ── 입력 필드 ──
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#fff',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 20,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
  },

  // ── Primary 버튼 ──
  btnPrimary: {
    height: 52,
    backgroundColor: '#2176C7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 시도 횟수 텍스트 ──
  attemptsText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#94A3B8',
  },
});
