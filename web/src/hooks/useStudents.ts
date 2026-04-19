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
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { User, Class } from '../../../types/index';

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

/** 학생 퇴원 처리 (is_active: false) */
export function useDeactivateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (uid: string) => {
      await updateDoc(doc(db, 'users', uid), { is_active: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 재원 복구 (is_active: true) */
export function useReactivateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (uid: string) => {
      await updateDoc(doc(db, 'users', uid), { is_active: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 반 이동 */
export function useMoveStudentClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ uid, classId }: { uid: string; classId: string }) => {
      await updateDoc(doc(db, 'users', uid), { class_id: classId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 학생 계정 생성 (Cloud Function: createStudentAccount 호출) */
export function useCreateStudent() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  // createStudentAccount 함수는 us-central1에 배포됨
  const functions = getFunctions(app, 'us-central1');

  return useMutation({
    mutationFn: async (data: {
      name: string;
      classId: string;
      birthDate?: string;
      guardianPhone?: string;
    }): Promise<CreateStudentResult> => {
      const fn = httpsCallable<unknown, CreateStudentResult>(functions, 'createStudentAccount');
      const result = await fn({
        name: data.name,
        classId: data.classId,
        academyId: user?.academy_id,
        birthDate: data.birthDate || undefined,
      });

      // 보호자 연락처는 Cloud Function에서 처리하지 않으므로 별도 업데이트
      if (data.guardianPhone && result.data.uid) {
        await updateDoc(doc(db, 'users', result.data.uid), {
          guardian_phone: data.guardianPhone,
        });
      }

      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students', user?.academy_id] });
    },
  });
}

/** 반 생성 (초대코드 자동 발급) */
export function useCreateClass() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (data: { name: string; subject?: string }) => {
      await addDoc(collection(db, 'classes'), {
        name: data.name,
        subject: data.subject ?? '',
        academy_id: user?.academy_id,
        invite_code: generateCode(6),
        student_count: 0,
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
    mutationFn: async ({ id, name, subject }: { id: string; name: string; subject?: string }) => {
      await updateDoc(doc(db, 'classes', id), { name, subject: subject ?? '' });
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
