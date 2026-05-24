import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { Homework, Class, User, Submission } from '../../../types/index';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** 목록용 숙제 — 반 이름·제출 수 조인 */
export interface HomeworkWithStats extends Homework {
  className: string;       // 반 이름
  submitCount: number;     // 제출 학생 수 (탈퇴 제외)
  totalStudents: number;   // 해당 반 활성 학생 수
}

// ─── 훅 ──────────────────────────────────────────────────────────────────────

/**
 * 학원 전체 숙제 목록 (반 이름 + 제출 수 조인)
 *
 * 정책:
 * - 모든 숙제 표시 (admin은 과거 숙제도 검사·관리 필요)
 * - 탈퇴 학생 제출은 제출 수에 미포함
 */
export function useHomeworks() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['homeworks', academyId],
    enabled: !!academyId,
    staleTime: 1000 * 30, // 30초 — 너무 잦은 재조회 방지
    queryFn: async (): Promise<HomeworkWithStats[]> => {
      // 1) 학원 내 반 목록 — class_id 조인용
      const classSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId)),
      );
      const classMap = new Map<string, string>();
      classSnap.docs.forEach((d) => classMap.set(d.id, (d.data() as Class).name));
      const classIds = Array.from(classMap.keys());
      if (classIds.length === 0) return [];

      // 2) 학원 내 활성 학생 (반별 카운트 + 탈퇴 필터링용)
      const studentSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'student'),
        ),
      );
      const activeStudentUids = new Set<string>();
      const classStudentCount = new Map<string, number>();
      studentSnap.docs.forEach((d) => {
        const data = d.data() as User;
        if (data.deleted_at || data.is_active === false) return;
        activeStudentUids.add(d.id);
        if (data.class_id) {
          classStudentCount.set(data.class_id, (classStudentCount.get(data.class_id) ?? 0) + 1);
        }
      });

      // 3) 숙제 목록 — Firestore where ... 'in' 은 30개 제한 → chunk
      const homeworks: Homework[] = [];
      for (let i = 0; i < classIds.length; i += 30) {
        const chunk = classIds.slice(i, i + 30);
        const snap = await getDocs(
          query(collection(db, 'homeworks'), where('class_id', 'in', chunk)),
        );
        snap.docs.forEach((d) => {
          homeworks.push({ id: d.id, ...d.data() } as Homework);
        });
      }
      // 마감일 오름차순 정렬 (가까운 마감 먼저)
      homeworks.sort(
        (a, b) =>
          (a.due_date as Timestamp).toMillis() - (b.due_date as Timestamp).toMillis(),
      );

      if (homeworks.length === 0) return [];

      // 4) 제출 수 — 숙제별 submissions 컬렉션 직접 조회 (rules 단순)
      // collectionGroup은 별도 인덱스/규칙 필요해서 단순 반복으로 대체
      const submitCountMap = new Map<string, number>();
      await Promise.all(
        homeworks.map(async (hw) => {
          try {
            const subSnap = await getDocs(collection(db, 'homeworks', hw.id, 'submissions'));
            const count = subSnap.docs.filter((d) => activeStudentUids.has(d.id)).length;
            submitCountMap.set(hw.id, count);
          } catch (e) {
            console.warn(`[useHomeworks] submissions 조회 실패 (${hw.id}):`, e);
            submitCountMap.set(hw.id, 0);
          }
        }),
      );

      // 5) 결합
      return homeworks.map((hw) => ({
        ...hw,
        className: classMap.get(hw.class_id) ?? '알 수 없음',
        submitCount: submitCountMap.get(hw.id) ?? 0,
        totalStudents: classStudentCount.get(hw.class_id) ?? 0,
      }));
    },
  });
}

// ─── 뮤테이션 훅 ──────────────────────────────────────────────────────────────

/** 숙제 출제 입력 — 모달에서 받는 값 */
export interface CreateHomeworkInput {
  title: string;
  content: string;
  classId: string;
  dueDate: Date;
}

/**
 * 숙제 출제
 * - 성공 시 ['homeworks', academyId] 쿼리 무효화 → 목록 자동 갱신
 */
export function useCreateHomework() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useMutation({
    mutationFn: async (input: CreateHomeworkInput) => {
      if (!user?.uid) throw new Error('로그인이 필요해요.');
      await addDoc(collection(db, 'homeworks'), {
        title: input.title.trim(),
        content: input.content.trim(),
        class_id: input.classId,
        due_date: Timestamp.fromDate(input.dueDate),
        created_by: user.uid,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homeworks', academyId] });
    },
  });
}

/** 숙제 수정 입력 — 모달에서 받는 값 */
export interface UpdateHomeworkInput {
  id: string;
  title: string;
  content: string;
  dueDate: Date;
}

/**
 * 숙제 수정 (반은 변경 불가 — 출제 후 반 이동은 정책상 허용 안 함)
 */
export function useUpdateHomework() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useMutation({
    mutationFn: async (input: UpdateHomeworkInput) => {
      await updateDoc(doc(db, 'homeworks', input.id), {
        title: input.title.trim(),
        content: input.content.trim(),
        due_date: Timestamp.fromDate(input.dueDate),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homeworks', academyId] });
    },
  });
}

// ─── 검사용 데이터 훅 ─────────────────────────────────────────────────────────

/** 검사 화면에서 쓰는 제출물 — 학생 정보 조인 */
export interface SubmissionWithStudent extends Submission {
  studentUid: string;
  studentName: string;
  studentSchool?: string;
}

/** 검사 모달용 통합 데이터 — 반 학생 + 제출물(실시간) */
export interface HomeworkReviewData {
  students: User[];                 // 해당 반 활성 학생 전원
  submissions: SubmissionWithStudent[]; // 제출물 (제출 시각 내림차순)
  isLoading: boolean;
}

/**
 * 숙제 검사 데이터 — 학생 + 제출물(실시간 onSnapshot)
 *
 * 사용 패턴:
 *   const { students, submissions, isLoading } = useHomeworkReview(hw);
 *
 * - 학생 목록: 1회 fetch
 * - 제출물: 실시간 구독 → 다른 선생님이 피드백 누르면 즉시 반영
 */
export function useHomeworkReview(homework: Homework | null): HomeworkReviewData {
  const { user } = useAuthStore();
  const [students, setStudents] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false);

  // 1) 반 학생 목록 (1회 fetch)
  useEffect(() => {
    if (!homework || !user?.academy_id) return;
    setStudentsLoaded(false);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users'),
            where('academy_id', '==', user.academy_id),
            where('class_id', '==', homework.class_id),
            where('role', '==', 'student'),
          ),
        );
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() } as User))
          .filter((u) => u.is_active && !u.deleted_at);
        setStudents(list);
      } catch (e) {
        console.error('[useHomeworkReview] 학생 조회 실패:', e);
        setStudents([]);
      } finally {
        setStudentsLoaded(true);
      }
    })();
  }, [homework, user?.academy_id]);

  // 2) 제출물 실시간 구독
  useEffect(() => {
    if (!homework) return;
    setSubmissionsLoaded(false);
    const unsub = onSnapshot(
      collection(db, 'homeworks', homework.id, 'submissions'),
      (snap) => {
        // 학생 이름·학교 맵 (구독 시점의 students를 그대로 참조)
        const nameMap = new Map<string, string>();
        const schoolMap = new Map<string, string | undefined>();
        students.forEach((s) => {
          nameMap.set(s.uid, s.name);
          if (s.school_name) schoolMap.set(s.uid, s.school_name);
        });
        const list = snap.docs.map((d) => {
          const data = d.data() as Submission;
          return {
            studentUid: d.id,
            studentName: nameMap.get(d.id) ?? '알 수 없음',
            studentSchool: schoolMap.get(d.id),
            ...data,
          } as SubmissionWithStudent;
        });
        // 제출 시각 내림차순 (최근 제출 우선)
        list.sort(
          (a, b) =>
            (b.submitted_at?.toMillis?.() ?? 0) - (a.submitted_at?.toMillis?.() ?? 0),
        );
        setSubmissions(list);
        setSubmissionsLoaded(true);
      },
      (e) => {
        console.error('[useHomeworkReview] 제출물 구독 실패:', e);
        setSubmissions([]);
        setSubmissionsLoaded(true);
      },
    );
    return () => unsub();
    // students가 바뀌면 nameMap도 갱신되도록 의존성에 포함
  }, [homework, students]);

  return {
    students,
    submissions,
    isLoading: !studentsLoaded || !submissionsLoaded,
  };
}

/** 피드백 입력 — 같은 피드백 재선택 시 null로 토글 */
export interface SaveFeedbackInput {
  homeworkId: string;
  studentUid: string;
  feedback: '👍' | '💧';
  currentFeedback: '👍' | '💧' | null;
}

/**
 * 피드백 저장 — submissions/{studentUid}.feedback 업데이트
 * - status 도 함께 업데이트: 피드백 있으면 'checked', 없으면 'submitted'
 * - 👍 또는 취소 시 feedback_comment 초기화
 */
export function useSaveFeedback() {
  return useMutation({
    mutationFn: async (input: SaveFeedbackInput) => {
      const newFeedback = input.currentFeedback === input.feedback ? null : input.feedback;
      const ref = doc(db, 'homeworks', input.homeworkId, 'submissions', input.studentUid);
      // 💧가 아닌 경우에만 코멘트 초기화 (💧 유지 시 기존 코멘트 보존)
      const payload: Record<string, string | null> = {
        feedback: newFeedback,
        status: newFeedback ? 'checked' : 'submitted',
      };
      if (newFeedback !== '💧') {
        payload.feedback_comment = '';
      }
      await updateDoc(ref, payload);
    },
  });
}

/** 💧 코멘트 저장 입력 */
export interface SaveCommentInput {
  homeworkId: string;
  studentUid: string;
  comment: string;
}

/** 💧 피드백에 첨부할 코멘트 저장 */
export function useSaveFeedbackComment() {
  return useMutation({
    mutationFn: async (input: SaveCommentInput) => {
      const ref = doc(db, 'homeworks', input.homeworkId, 'submissions', input.studentUid);
      await updateDoc(ref, {
        feedback_comment: input.comment.trim(),
      });
    },
  });
}

/**
 * 숙제 삭제
 * - submissions 서브컬렉션은 Firestore 정책상 자동 삭제되지 않음
 *   (Cloud Function에서 onDelete 트리거로 정리하는 게 원칙이지만,
 *    여기서는 클라이언트는 본 문서만 삭제하고 서브컬렉션은 그대로 둠)
 */
export function useDeleteHomework() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useMutation({
    mutationFn: async (homeworkId: string) => {
      await deleteDoc(doc(db, 'homeworks', homeworkId));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homeworks', academyId] });
    },
  });
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

// types/index.ts는 RN Firebase Timestamp를 export하므로
// 웹/RN 양쪽 Timestamp가 공통으로 갖는 toDate() 인터페이스만 받도록 정의
type ToDateConvertible = { toDate: () => Date };

/** 마감일까지 남은 일수 (음수 = 마감 지남) */
export function calcDDay(dueDate: ToDateConvertible): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = dueDate.toDate();
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** 마감일 표시 — '5월 12일 오후 6:00' */
export function formatDueDate(dueDate: ToDateConvertible): string {
  const d = dueDate.toDate();
  const ampm = d.getHours() < 12 ? '오전' : '오후';
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${hour12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
