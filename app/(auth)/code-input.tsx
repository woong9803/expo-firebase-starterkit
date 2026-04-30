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
  InputAccessoryView,
} from 'react-native';

// iOS 숫자 키보드 Done 툴바 제거용 ID
const ACCESSORY_ID = 'codeInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrayUnion, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import {
  validateAcademyCode,
  validateInviteCode,
  validateLinkCode,
  generateLinkCode,
} from '../../lib/auth';
import { Collections } from '../../lib/firestore';
import { useAuthStore } from '../../store/useAuthStore';
import { UserRole, User } from '../../types';
import { strings } from '../../constants/strings';

// Cloud Function rate limit(resource-exhausted) 에러 판별
// validateOnboardingCode가 10분/5회 초과 시 이 코드를 반환
const isRateLimitError = (e: unknown): e is { message?: string } => {
  const err = e as { code?: string };
  return (
    err?.code === 'functions/resource-exhausted' ||
    err?.code === 'resource-exhausted'
  );
};

// 브루트포스 방지 설정
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;

export default function CodeInputScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { role } = useLocalSearchParams<{ role: string }>();
  const { user, setUser } = useAuthStore();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 학생 전용 — 생년월일 / 학교 입력
  const [birthDate, setBirthDate] = useState('');
  const [schoolName, setSchoolName] = useState('');

  // ─── 미리보기 (선생님: 학원명, 학생: 반명) ──────────────────────────
  const [preview, setPreview] = useState<{ name: string; info: string } | null>(null);
  const [isLooking, setIsLooking] = useState(false);

  // ─── 브루트포스 방지 ────────────────────────────────────────────────
  const [attemptCount, setAttemptCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lockTimer <= 0 && isLocked) {
      setIsLocked(false);
      setAttemptCount(0);
      setError(null);
    }
  }, [lockTimer, isLocked]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startLockTimer = () => {
    setIsLocked(true);
    setLockTimer(LOCK_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setLockTimer((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ─── 6자리 입력 시 자동 미리보기 (선생님: 학원명 / 학생: 반 이름) ──────
  // 서버 rate limit(uid 10분/5회) 때문에 한 번 조회한 코드는 다시 쏘지 않음.
  // 검증된 원본 응답을 (code, role) 기준으로 캐시하면 handleConfirm에서 재사용 가능.
  type ValidatedResult =
    | { role: 'teacher'; data: Awaited<ReturnType<typeof validateAcademyCode>> }
    | { role: 'student'; data: Awaited<ReturnType<typeof validateInviteCode>> }
    | { role: 'parent'; data: Awaited<ReturnType<typeof validateLinkCode>> };

  const lastPreviewRef = useRef<{ code: string; preview: typeof preview } | null>(null);
  const lastValidatedRef = useRef<{ code: string; result: ValidatedResult } | null>(null);
  useEffect(() => {
    if (code.length !== 6) { setPreview(null); return; }

    // 방금 조회한 코드와 같다면 캐시 재사용 (rate limit 카운트 절약)
    if (lastPreviewRef.current?.code === code) {
      setPreview(lastPreviewRef.current.preview);
      return;
    }

    let cancelled = false;
    setIsLooking(true);

    (async () => {
      try {
        let next: typeof preview = null;
        let validated: ValidatedResult | null = null;

        if (role === 'teacher') {
          const result = await validateAcademyCode(code);
          if (cancelled) return;
          validated = { role: 'teacher', data: result };
          if (result) {
            // 승인 대기 중인 학원은 미리보기에서 가입 불가 안내
            next = result.status === 'pending'
              ? { name: result.name, info: '승인 대기 중인 학원 (가입 불가)' }
              : { name: result.name, info: '학원' };
          }
        } else if (role === 'student') {
          const result = await validateInviteCode(code);
          if (cancelled) return;
          validated = { role: 'student', data: result };
          if (result) next = { name: result.name, info: '반' };
        } else if (role === 'parent') {
          const result = await validateLinkCode(code);
          if (cancelled) return;
          validated = { role: 'parent', data: result };
          if (result) next = { name: result.name, info: '자녀' };
        }

        if (!cancelled) {
          setPreview(next);
          lastPreviewRef.current = { code, preview: next };
          if (validated) lastValidatedRef.current = { code, result: validated };
        }
      } catch (e) {
        // Rate limit은 handleConfirm 쪽에서 메시지 띄움 — 여기선 조용히 실패
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setIsLooking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [code, role]);

  // ─── 실패 처리 ─────────────────────────────────────────────────────
  const handleFailure = (message: string) => {
    const newCount = attemptCount + 1;
    setAttemptCount(newCount);
    if (newCount >= MAX_ATTEMPTS) {
      startLockTimer();
      setError(strings.onboarding.lockedMessage);
    } else {
      setError(`${message} (${newCount}/${MAX_ATTEMPTS}회)`);
    }
  };

  // ─── 역할별 텍스트 (strings.ts에서 관리) ─────────────────────────
  const roleKey = (role === 'teacher' || role === 'student' || role === 'parent')
    ? role
    : 'parent';
  const roleStrings = strings.onboarding.codeInput[roleKey];

  const getTitle = () => roleStrings.title;
  const getSubtitle = () => roleStrings.subtitle;
  const getPlaceholder = () => roleStrings.placeholder;
  const getJoinLabel = () => roleStrings.joinLabel;
  const getPreviewEmoji = () => roleStrings.previewEmoji;

  // ─── 코드 확인 및 Firestore 업데이트 ──────────────────────────────
  const handleConfirm = async () => {
    if (!code.trim() || !user) return;
    if (isLocked) return;

    setIsLoading(true);
    setError(null);

    try {
      const trimmedCode = code.trim();
      // 미리보기에서 이미 같은 코드를 검증했다면 CF 재호출 없이 캐시 재사용
      // (rate limit 카운터 중복 소진 방지)
      const cached = lastValidatedRef.current?.code === trimmedCode
        ? lastValidatedRef.current.result
        : null;

      if (role === 'teacher') {
        const result = cached?.role === 'teacher'
          ? cached.data
          : await validateAcademyCode(trimmedCode);
        if (!result) { handleFailure(strings.errors.invalidCode); return; }

        // 승인 대기 중인 학원에는 선생님 가입 불가 (서버가 status를 직접 반환)
        if (result.status === 'pending') {
          handleFailure('아직 승인되지 않은 학원이에요.\n학원 승인 후 다시 시도해주세요.');
          return;
        }

        await updateDoc(Collections.user(user.uid), {
          role: 'teacher' as UserRole,
          academy_id: result.academy_id,
          is_active: true,
        });

      } else if (role === 'student') {
        const result = cached?.role === 'student'
          ? cached.data
          : await validateInviteCode(trimmedCode);
        if (!result) { handleFailure(strings.errors.invalidCode); return; }
        const linkCode = generateLinkCode();

        // 생년월일이 입력된 경우에만 birth_date 저장 (선택 항목)
        await updateDoc(Collections.user(user.uid), {
          role: 'student' as UserRole,
          class_id: result.class_id,
          academy_id: result.academy_id,
          link_code: linkCode,
          is_active: true, // 최초 역할 설정 시 활성화 (보안 규칙에서 온보딩 시에만 허용)
          enrollment_date: serverTimestamp(), // 반 가입 시점을 수강 시작일로 자동 기록
          ...(birthDate.trim() ? { birth_date: birthDate.trim() } : {}),
          ...(schoolName.trim() ? { school_name: schoolName.trim() } : {}),
        });

      } else if (role === 'parent') {
        const result = cached?.role === 'parent'
          ? cached.data
          : await validateLinkCode(trimmedCode);
        if (!result) { handleFailure(strings.errors.invalidCode); return; }

        const studentUid = result.student_uid;
        const studentAcademyId = result.academy_id;

        // 학부모 자신의 phone_number는 guardian_phone 자동 기록에 필요 (1회 조회)
        const parentSnap = await getDoc(Collections.user(user.uid));

        // 학부모 문서 업데이트
        await updateDoc(Collections.user(user.uid), {
          role: 'parent' as UserRole,
          children: arrayUnion(studentUid),
          academy_id: studentAcademyId,
          is_active: true, // 최초 역할 설정 시 활성화
        });

        // 학부모의 phone_number를 학생의 guardian_phone에 자동 기록
        // 법정 출석부 엑셀 내보내기 시 보호자 연락처로 사용
        // ⚠️ 논블로킹 처리 — 실패해도 온보딩 흐름 차단하지 않음
        const parentPhone = parentSnap.exists()
          ? (parentSnap.data().phone_number as string | undefined)
          : undefined;
        if (parentPhone) {
          updateDoc(Collections.user(studentUid), {
            guardian_phone: parentPhone,
          }).catch((e) => {
            console.warn('[CodeInput] guardian_phone 자동 기록 실패:', e);
          });
        }
      }

      const freshSnap = await getDoc(Collections.user(user.uid));
      if (freshSnap.exists()) setUser(freshSnap.data() as User);

      // 선생님은 가입 후 담당반 선택 화면으로 이동 (건너뛰기 가능)
      // 다른 역할은 바로 홈으로 이동
      if (role === 'teacher') {
        router.replace({
          pathname: '/(app)/(teacher)/class-select',
          params: { fromOnboarding: 'true' },
        });
      } else {
        router.replace('/(app)');
      }

    } catch (e: unknown) {
      // 서버 rate limit은 메시지에 남은 대기 시간이 포함돼 있어 그대로 노출
      // (클라이언트 5회 잠금 카운트는 건드리지 않음 — 이중 잠금 방지)
      if (isRateLimitError(e)) {
        setError((e as { message?: string }).message || strings.common.error);
      } else {
        handleFailure((e as Error).message || strings.common.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const codeEntered = code.trim().length > 0;
  const isDisabled = isLoading || isLocked || !code.trim();

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
        {/* ── 스텝 인디케이터: 4개 dot, 4번째 활성 ── */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={i === 3 ? styles.stepActive : styles.stepInactive} />
          ))}
        </View>

        {/* ── 제목 ── */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>
        </View>

        {/* ── 잠금 알림 ── */}
        {isLocked && (
          <View style={styles.lockedBox}>
            <Text style={styles.lockedText}>{lockTimer}초 후 다시 시도할 수 있어요</Text>
          </View>
        )}

        {/* ── 에러 ── */}
        {error && !isLocked && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 코드 입력 필드 ── */}
        {/* letterSpacing이 있으면 placeholder가 잘리는 RN 이슈 → 가짜 placeholder로 대체 */}
        <View style={[
          styles.inputWrap,
          codeEntered && styles.inputActive,
          isLocked && styles.inputDisabled,
        ]}>
          {/* 입력값 없을 때만 보이는 가짜 placeholder */}
          {!codeEntered && (
            <Text style={styles.fakePlaceholder}>_ _ _ _ _ _</Text>
          )}
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              setError(null);
              setPreview(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isLoading && !isLocked}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            maxLength={6}
          />
        </View>

        {/* 코드 힌트 */}
        <Text style={styles.codeHint}>코드는 대소문자를 구분하지 않아요</Text>

        {/* 유효 코드 안내 */}
        {preview && (
          <Text style={styles.validText}>✓ 올바른 {preview.info} 코드예요</Text>
        )}

        {/* 조회 중 */}
        {isLooking && (
          <ActivityIndicator size="small" color="#5B50E8" style={{ marginTop: 8 }} />
        )}

        {/* ── 미리보기 카드 ── */}
        {preview && (
          <View style={styles.previewCard}>
            <Text style={styles.previewEmoji}>{getPreviewEmoji()}</Text>
            <View>
              <Text style={styles.previewName}>{preview.name}</Text>
              <Text style={styles.previewInfo}>{getJoinLabel()}</Text>
            </View>
          </View>
        )}

        {/* ── 학생 전용: 학교 / 생년월일 입력 ── */}
        {role === 'student' && (
          <View style={styles.birthDateSection}>
            {/* 학교 */}
            <Text style={styles.birthDateLabel}>
              학교 <Text style={styles.birthDateOptional}>(선택)</Text>
            </Text>
            <TextInput
              style={styles.birthDateInput}
              placeholder="예: OO중학교"
              placeholderTextColor="#94A3B8"
              value={schoolName}
              onChangeText={setSchoolName}
              autoCorrect={false}
              inputAccessoryViewID={ACCESSORY_ID}
              editable={!isLoading}
              returnKeyType="next"
            />
            <Text style={[styles.birthDateHint, { marginBottom: 12 }]}>
              출석부 및 학원 관리에 사용돼요.
            </Text>

            {/* 생년월일 */}
            <Text style={styles.birthDateLabel}>
              생년월일 <Text style={styles.birthDateOptional}>(선택)</Text>
            </Text>
            <TextInput
              style={styles.birthDateInput}
              placeholder="YYYY-MM-DD (예: 2015-03-15)"
              placeholderTextColor="#94A3B8"
              value={birthDate}
              onChangeText={setBirthDate}
              keyboardType="numbers-and-punctuation"
              inputAccessoryViewID={ACCESSORY_ID}
              editable={!isLoading}
            />
            <Text style={styles.birthDateHint}>
              법정 출석부 작성에 사용돼요. 나중에 원장님이 입력할 수도 있어요.
            </Text>
          </View>
        )}

        {/* ── 버튼 영역 ── */}
        <View style={styles.btnArea}>
          <TouchableOpacity
            style={[styles.btnPrimary, isDisabled && styles.btnDisabled]}
            onPress={handleConfirm}
            disabled={isDisabled}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>{getJoinLabel()}</Text>
            )}
          </TouchableOpacity>

          {codeEntered && (
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => { setCode(''); setPreview(null); setError(null); }}
              activeOpacity={0.85}
            >
              <Text style={styles.btnSecondaryText}>다시 입력하기</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 보안 안내 카드 ── */}
        <View style={styles.securityCard}>
          <Text style={styles.securityText}>5회 오류 시 30초 대기 (브루트포스 방지)</Text>
        </View>

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
    marginBottom: 22,
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
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },

  // ── 잠금 / 에러 ──
  lockedBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  lockedText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
  },
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

  // ── 코드 입력 필드 ──
  // 입력 래퍼 — 테두리·배경은 여기서, TextInput은 투명
  inputWrap: {
    height: 64,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputActive: {
    borderColor: '#5B50E8',
    backgroundColor: '#EEEDF9',
  },
  inputDisabled: {
    opacity: 0.5,
  },
  // 가짜 placeholder — letterSpacing 적용, 입력값 없을 때만 표시
  fakePlaceholder: {
    position: 'absolute',
    fontSize: 24,
    color: '#C4B5FD',
    textAlign: 'center',
    letterSpacing: 8,
  },
  // 실제 TextInput — 투명 배경, 입력값 스타일만 담당
  input: {
    width: '100%',
    height: '100%',
    fontSize: 30,
    fontWeight: '800',
    color: '#5B50E8',
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  codeHint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  validText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
    marginTop: 6,
  },

  // ── 미리보기 카드 ──
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  previewEmoji: {
    fontSize: 30,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewInfo: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },

  // ── 학생 전용: 생년월일 입력 ──
  birthDateSection: {
    marginTop: 16,
    gap: 6,
  },
  birthDateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  birthDateOptional: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
  birthDateInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#0F172A',
  },
  birthDateHint: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },

  // ── 버튼 ──
  btnArea: {
    marginTop: 20,
    gap: 10,
  },
  btnPrimary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B50E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },

  // ── 보안 안내 카드 ──
  securityCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 14,
    alignItems: 'center',
  },
  securityText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
