import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { User, Class } from '../../../types/index';
import { resolveTuitionOnClassChange } from '../../../lib/tuitionFormat';

// 반 이름이 포함된 학생 타입
export interface StudentWithClass extends User {
  className: string;
}

// createStudentAccount Cloud Function 반환 타입
export interface CreateStudentResult {
  name: string;
  email: string;
  tempPassword: string;
  linkCode: string;
  uid: string;
}

// ─── 쿼리 훅 ────────────────────────────────────────────────────────────

/** 학원 내 전체 학생 목록 (반 이름 조인 포함) */
export function useStudents() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['students', academyId],
    enabled: !!academyId,
    // 탈퇴 학생이 즉시 목록에서 사라지도록 캐시 없이 항상 최신 데이터 사용
    staleTime: 0,
    queryFn: async (): Promise<StudentWithClass[]> => {
      // 반 목록 먼저 가져와서 class_id → 반 이름 맵 구성
      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classMap = new Map<string, string>();
      classesSnap.docs.forEach((d) => classMap.set(d.id, d.data().name as string));

      // 학생 목록 조회
      const studentsSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'student')
        )
      );

      return studentsSnap.docs
        .map((d) => {
          const data = d.data() as User;
          return {
            ...data,
            uid: d.id,
            className: data.class_id ? (classMap.get(data.class_id) ?? '미배정') : '미배정',
          };
        })
        // 탈퇴 처리된 계정(deleted_at 필드 있음) 제외
        .filter((s) => !s.deleted_at);
    },
  });
}

/** 학원 내 전체 반 목록 */
export function useClasses() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['classes', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<Class[]> => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
    },
  });
}

// ─── 뮤테이션 훅 ────────────────────────────────────────────────────────

/** 학생 퇴원 처리 (is_active: false + withdrawal_date 자동 기록) */
export function useDeactivateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (uid: string) => {
      // withdrawal_date: 법정 출석부 수강기간 종료일 / 엑셀 표시용
      await updateDoc(doc(db, 'users', uid), {
        is_active: false,
        withdrawal_date: serverTimestamp(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 재원 복구 (is_active: true + withdrawal_date 초기화) */
export function useReactivateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (uid: string) => {
      // 재원 복구 시 withdrawal_date를 명시적으로 null로 초기화 (이전 퇴원 이력 흔적 제거)
      await updateDoc(doc(db, 'users', uid), {
        is_active: true,
        withdrawal_date: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/**
 * 학생 정보 수정 (이름·생년월일·보호자연락처·등록일·주소·수강료)
 * - 빈 문자열은 null 로 정규화 — 옵셔널 필드 일관성
 * - enrollDate: 'YYYY-MM-DD' 문자열 → Firestore Timestamp 변환
 * - tuitionFee: undefined = 건드리지 않음(페이로드 제외) / null = 명시적 미설정 / number = 값 저장
 *   (호출 측에서 수정 모달의 빈 칸 → null, 입력값 있으면 number 로 정규화하여 전달)
 */
export function useUpdateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (data: {
      uid: string;
      name: string;
      birthDate: string;        // 'YYYY-MM-DD' or ''
      guardianPhone: string;
      enrollDate: string;       // 'YYYY-MM-DD' or ''
      address?: string;         // '' 이면 null 저장
      tuitionFee?: number | null; // undefined 면 페이로드에서 제외
    }) => {
      // 등록일: 문자열 → Timestamp 변환 (빈 값이면 null)
      let enrollTs: Timestamp | null = null;
      const trimmed = data.enrollDate.trim();
      if (trimmed) {
        const d = new Date(trimmed + 'T00:00:00');
        if (!isNaN(d.getTime())) enrollTs = Timestamp.fromDate(d);
      }

      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        birth_date: data.birthDate.trim() || null,
        guardian_phone: data.guardianPhone.trim() || null,
        enrollment_date: enrollTs,
      };
      // 주소 — 인자 들어왔을 때만 갱신 (undefined 면 기존 값 유지)
      if (data.address !== undefined) {
        payload.address = data.address.trim() || null;
      }
      // 수강료 — undefined 면 제외, null/number 는 그대로 저장
      if (data.tuitionFee !== undefined) {
        payload.tuition_fee = data.tuitionFee;
      }

      await updateDoc(doc(db, 'users', data.uid), payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 반 이동
 *  학생 tuition_fee 자동 채움 정책:
 *  - 학생이 이미 값(0 포함) 가지면 → 보존 (학생별 설정 유지)
 *  - 학생이 비어있고 새 반 default 가 있으면 → 새 반 default 로 채움
 *  - 학생이 비어있고 새 반 default 도 비어있으면 → null 명시 저장
 *
 *  호출 측에서 학생 현재 tuition_fee 와 새 반의 default_tuition_fee 를 인자로 전달한다
 *  (호출 측 React Query 캐시에 students/classes 보유 → 추가 RTT 절약).
 */
export function useMoveStudentClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({
      uid,
      classId,
      currentTuitionFee,
      newClassDefault,
    }: {
      uid: string;
      classId: string;
      currentTuitionFee?: number | null;
      newClassDefault?: number | null;
    }) => {
      const newFee = resolveTuitionOnClassChange(currentTuitionFee, newClassDefault);
      const payload: Record<string, unknown> = { class_id: classId };
      // undefined = "건드리지 않음" (페이로드 제외) / null = "명시적 미설정" (저장)
      if (newFee !== undefined) payload.tuition_fee = newFee;
      await updateDoc(doc(db, 'users', uid), payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 계정 생성 (Cloud Function: createStudentAccount 호출)
 *  newClassDefault: 선택한 반의 default_tuition_fee — 신규 학생은 항상 비어있으므로
 *                   resolveTuitionOnClassChange 결과는 number 또는 null (undefined 아님).
 *                   호출 측에서 선택된 반 객체로부터 전달.
 */
export function useCreateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  // CF region: asia-northeast3 (서울) — PIPA 국외 이전 회피
  const functions = getFunctions(app, 'asia-northeast3');

  return useMutation({
    mutationFn: async (data: {
      name: string;
      classId: string;
      birthDate?: string;
      guardianPhone?: string;
      address?: string;
      newClassDefault?: number | null;
      // tuitionFee: 사용자가 등록 모달에서 수정한 값 (반 default를 자동 채운 후 수정 가능).
      // undefined = 입력 없음 → newClassDefault 로 자동 채움 / null = 명시적 미설정 / number = 그 값 저장
      tuitionFee?: number | null;
    }): Promise<CreateStudentResult> => {
      const fn = httpsCallable<unknown, CreateStudentResult>(functions, 'createStudentAccount');
      const result = await fn({
        name: data.name,
        classId: data.classId,
        academyId: user?.academy_id,
        birthDate: data.birthDate || undefined,
      });

      // 보호자 연락처·주소·수강료 — CF가 처리하지 않는 필드는 클라이언트에서 별도 update
      if (result.data.uid) {
        // 수강료: 사용자가 직접 입력한 값(tuitionFee)이 있으면 그 값 우선,
        // 없으면 반 default 자동 채움 정책 헬퍼 사용
        const newFee = data.tuitionFee !== undefined
          ? data.tuitionFee
          : resolveTuitionOnClassChange(undefined, data.newClassDefault);

        const extraPayload: Record<string, unknown> = {};
        if (data.guardianPhone) extraPayload.guardian_phone = data.guardianPhone;
        if (data.address !== undefined) extraPayload.address = data.address.trim() || null;
        // newFee 는 number 또는 null — null 도 명시적 미설정 의미로 저장
        if (newFee !== undefined) extraPayload.tuition_fee = newFee;
        if (Object.keys(extraPayload).length > 0) {
          await updateDoc(doc(db, 'users', result.data.uid), extraPayload);
        }
      }

      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 반 생성 (초대코드 자동 발급)
 *  defaultTuitionFee: 학생 배정 시 학생 tuition_fee가 비어있으면 자동 채움.
 *  null = 미설정, 0 = 무료(무료 체험반), 그 외 = 원 단위 number.
 */
export function useCreateClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { name: string; subject?: string; defaultTuitionFee?: number | null }) => {
      await addDoc(collection(db, 'classes'), {
        name: data.name,
        subject: data.subject ?? '',
        academy_id: user?.academy_id,
        invite_code: generateCode(6),
        student_count: 0,
        // 기본 수강료 — null 도 의미 있는 값(미설정)이므로 항상 저장
        default_tuition_fee: data.defaultTuitionFee ?? null,
        created_at: serverTimestamp(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes', user?.academy_id] });
    },
  });
}

/** 반 수정 */
export function useUpdateClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ id, name, subject, defaultTuitionFee }: {
      id: string;
      name: string;
      subject?: string;
      defaultTuitionFee?: number | null;
    }) => {
      await updateDoc(doc(db, 'classes', id), {
        name,
        subject: subject ?? '',
        // 기본 수강료 — null 도 의미 있는 값이므로 항상 저장
        default_tuition_fee: defaultTuitionFee ?? null,
      });
    },
    onSuccess: () => {
      // 학생 목록도 갱신 (반 이름이 바뀌므로)
      qc.invalidateQueries({ queryKey: ['classes', user?.academy_id] });
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 반 삭제 */
export function useDeleteClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (classId: string) => {
      await deleteDoc(doc(db, 'classes', classId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes', user?.academy_id] });
    },
  });
}

// ─── 내부 유틸리티 ────────────────────────────────────────────────────────

/** 대문자 영숫자 랜덤 코드 생성 */
function generateCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
