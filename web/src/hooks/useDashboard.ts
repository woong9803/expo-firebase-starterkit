import { useQuery } from '@tanstack/react-query';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { Class, AttendanceRecord } from '../../../types/index';

// YYYY-MM-DD 형식 날짜 문자열 반환 (로컬 타임존 기준)
// toISOString()은 UTC라 KST 자정~오전 9시 사이에 전날로 표시되는 버그가 있어 직접 조립
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 오늘 날짜 기준 출결 통계 집계
export interface TodayStats {
  present: number;
  late: number;
  absent: number;
  noRecord: number;
  absentStudents: { name: string; className: string }[];
  noRecordStudents: { name: string; className: string }[];
}

// 반별 이번달 출석률
export interface ClassAttendanceRate {
  className: string;
  rate: number; // 0~100
}

// 최근 7일 출결 추이
export interface DailyTrend {
  date: string; // MM/DD
  present: number;
  late: number;
  absent: number;
}

export function useTodayStats() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['todayStats', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<TodayStats> => {
      const today = toDateStr(new Date());
      const stats: TodayStats = {
        present: 0,
        late: 0,
        absent: 0,
        noRecord: 0,
        absentStudents: [],
        noRecordStudents: [],
      };

      // 학원 내 전체 반 목록 조회
      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classes = classesSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Class)
      );

      for (const cls of classes) {
        // 반별 학생 목록 조회
        const studentsSnap = await getDocs(
          query(
            collection(db, 'users'),
            where('academy_id', '==', academyId),
            where('role', '==', 'student'),
            where('class_id', '==', cls.id),
            where('is_active', '==', true)
          )
        );

        // 오늘 출결 기록 조회 (attendances/{classId_date}/records)
        const attendanceDocId = `${cls.id}_${today}`;
        const recordsSnap = await getDocs(
          collection(db, 'attendances', attendanceDocId, 'records')
        );

        const recordMap = new Map<string, AttendanceRecord>();
        recordsSnap.docs.forEach((d) =>
          recordMap.set(d.id, d.data() as AttendanceRecord)
        );

        for (const studentDoc of studentsSnap.docs) {
          const student = studentDoc.data();
          // 탈퇴 처리된 계정(deleted_at) 제외 — 통계에 잡히지 않도록
          if (student.deleted_at) continue;
          const record = recordMap.get(studentDoc.id);

          if (!record) {
            stats.noRecord++;
            stats.noRecordStudents.push({ name: student.name, className: cls.name });
          } else {
            switch (record.status) {
              case 'present':
                stats.present++;
                break;
              case 'late':
                stats.late++;
                break;
              case 'absent':
                stats.absent++;
                stats.absentStudents.push({ name: student.name, className: cls.name });
                break;
            }
          }
        }
      }

      return stats;
    },
  });
}

export function useClassAttendanceRates() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['classAttendanceRates', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<ClassAttendanceRate[]> => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      // 이번달 1일 ~ 오늘까지 날짜 배열
      const dates: string[] = [];
      for (let d = 1; d <= now.getDate(); d++) {
        const mm = String(month).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        dates.push(`${year}-${mm}-${dd}`);
      }

      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );

      const result: ClassAttendanceRate[] = [];

      for (const classDoc of classesSnap.docs) {
        const cls = { id: classDoc.id, ...classDoc.data() } as Class;
        let total = 0;
        let present = 0;

        for (const dateStr of dates) {
          const recordsSnap = await getDocs(
            collection(db, 'attendances', `${cls.id}_${dateStr}`, 'records')
          );
          recordsSnap.docs.forEach((d) => {
            const rec = d.data() as AttendanceRecord;
            total++;
            if (rec.status === 'present' || rec.status === 'late') present++;
          });
        }

        result.push({
          className: cls.name,
          rate: total > 0 ? Math.round((present / total) * 100) : 0,
        });
      }

      return result;
    },
  });
}

export function useWeeklyTrend() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['weeklyTrend', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<DailyTrend[]> => {
      // 최근 7일 날짜 배열 (오늘 포함)
      const dates: Date[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });

      // 학원 내 전체 반 목록
      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classIds = classesSnap.docs.map((d) => d.id);

      const trend: DailyTrend[] = [];

      for (const date of dates) {
        const dateStr = toDateStr(date);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const label = `${mm}/${dd}`;
        let present = 0, late = 0, absent = 0;

        for (const classId of classIds) {
          const recordsSnap = await getDocs(
            collection(db, 'attendances', `${classId}_${dateStr}`, 'records')
          );
          recordsSnap.docs.forEach((d) => {
            const rec = d.data() as AttendanceRecord;
            if (rec.status === 'present') present++;
            else if (rec.status === 'late') late++;
            else if (rec.status === 'absent') absent++;
          });
        }

        trend.push({ date: label, present, late, absent });
      }

      return trend;
    },
  });
}

// 오늘 반별 출결 현황 (카드용)
export interface TodayClassRow {
  id: string;
  name: string;
  schedule: string; // 수업 시간 표시용 (ex. "월·수·금 19:00")
  teacher: string;
  status: 'done' | 'partial' | 'pending';
  present: number;
  late: number;
  absent: number;
  noRecord: number;
  total: number; // 재원 학생 수
  absentNames: string[];   // 결석한 학생 이름 (카드에 노출)
  noRecordNames: string[]; // 미입력 학생 이름
}

export function useTodayByClass() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['todayByClass', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<TodayClassRow[]> => {
      const today = toDateStr(new Date());

      // 반 목록 조회
      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );

      const rows: TodayClassRow[] = [];

      for (const classDoc of classesSnap.docs) {
        const cls = classDoc.data();

        // 담당 선생님 이름 조회
        let teacherName = '-';
        if (cls.teacher_id) {
          const teacherSnap = await getDoc(doc(db, 'users', cls.teacher_id));
          if (teacherSnap.exists()) teacherName = teacherSnap.data().name ?? '-';
        }

        // 반별 재원 학생 목록 (이름 매핑용)
        const studentsSnap = await getDocs(
          query(
            collection(db, 'users'),
            where('academy_id', '==', academyId),
            where('role', '==', 'student'),
            where('class_id', '==', classDoc.id),
            where('is_active', '==', true)
          )
        );
        const students = studentsSnap.docs
          .filter((d) => !d.data().deleted_at)
          .map((d) => ({ id: d.id, name: (d.data().name as string) ?? '-' }));

        // 오늘 출결 기록 집계
        const recordsSnap = await getDocs(
          collection(db, 'attendances', `${classDoc.id}_${today}`, 'records')
        );
        const recordMap = new Map<string, AttendanceRecord>();
        recordsSnap.docs.forEach((d) =>
          recordMap.set(d.id, d.data() as AttendanceRecord)
        );

        let present = 0, late = 0, absent = 0, noRecord = 0;
        const absentNames: string[] = [];
        const noRecordNames: string[] = [];

        for (const s of students) {
          const r = recordMap.get(s.id);
          if (!r) {
            noRecord++;
            noRecordNames.push(s.name);
          } else if (r.status === 'present') {
            present++;
          } else if (r.status === 'late') {
            late++;
          } else if (r.status === 'absent') {
            absent++;
            absentNames.push(s.name);
          }
        }

        // 상태: 전원 입력=완료, 일부만 입력=부분, 전원 미입력=예정
        const total = students.length;
        const recordedCount = present + late + absent;
        const status: TodayClassRow['status'] =
          total === 0 || recordedCount === 0 ? 'pending'
          : recordedCount === total ? 'done'
          : 'partial';

        rows.push({
          id: classDoc.id,
          name: cls.name ?? '-',
          schedule: cls.schedule ?? '',
          teacher: teacherName,
          status,
          present,
          late,
          absent,
          noRecord,
          total,
          absentNames,
          noRecordNames,
        });
      }

      // 정렬: 결석/미입력 많은 순 → 반 이름 순 (오늘 챙겨야 할 반이 먼저)
      rows.sort((a, b) => {
        const urgencyA = a.absent * 2 + a.noRecord;
        const urgencyB = b.absent * 2 + b.noRecord;
        if (urgencyA !== urgencyB) return urgencyB - urgencyA;
        return a.name.localeCompare(b.name);
      });

      return rows;
    },
  });
}

// ─── 학원 운영 요약 ────────────────────────────────────────────
export interface OperationSummary {
  studentCount: number;     // 재원(is_active=true, deleted_at=null) 학생 수
  teacherCount: number;     // 활성 선생님 수
  classCount: number;       // 반 수
  planLabel: string;        // 한국어 플랜 라벨
  planLimit: number | null; // 플랜별 학생 한도 (null=무제한)
  planUsage: number;        // 0~1 (사용률)
}

const PLAN_LIMITS: Record<string, { label: string; limit: number | null }> = {
  free: { label: '무료', limit: 3 },
  trial: { label: '체험판', limit: 100 },
  starter: { label: '스타터', limit: 30 },
  standard: { label: '스탠다드', limit: 100 },
  pro: { label: '프로', limit: null },
};

export function useOperationSummary() {
  const { user, academy } = useAuthStore();
  const academyId = user?.academy_id ?? null;
  const plan = academy?.plan ?? 'free';

  return useQuery({
    queryKey: ['operationSummary', academyId, plan],
    enabled: !!academyId,
    queryFn: async (): Promise<OperationSummary> => {
      // 활성 학생 수
      const studentSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'student'),
          where('is_active', '==', true)
        )
      );
      const studentCount = studentSnap.docs.filter((d) => !d.data().deleted_at).length;

      // 선생님 수
      const teacherSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'teacher'),
          where('is_active', '==', true)
        )
      );
      const teacherCount = teacherSnap.docs.filter((d) => !d.data().deleted_at).length;

      // 반 수
      const classSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classCount = classSnap.size;

      const planInfo = PLAN_LIMITS[plan] ?? { label: plan, limit: null };
      const usage =
        planInfo.limit && planInfo.limit > 0 ? studentCount / planInfo.limit : 0;

      return {
        studentCount,
        teacherCount,
        classCount,
        planLabel: planInfo.label,
        planLimit: planInfo.limit,
        planUsage: Math.min(usage, 1),
      };
    },
  });
}

// ─── 숙제 검사 현황 ────────────────────────────────────────────
export interface HomeworkProgress {
  pendingCount: number;         // 검사 대기(submitted) 제출물 수
  checkedCount: number;         // 검사 완료(checked) 제출물 수
  dueSoonCount: number;         // D-Day 0~1일 숙제 수
  recentHomeworks: {
    id: string;
    title: string;
    className: string;
    dueDate: Date;
    daysLeft: number;           // 음수면 마감 지남
    pending: number;
    total: number;
  }[];
}

export function useHomeworkProgress() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['homeworkProgress', academyId],
    enabled: !!academyId,
    queryFn: async (): Promise<HomeworkProgress> => {
      // 학원 내 반 + 학생 수 매핑
      const classSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classMap = new Map<string, { name: string; total: number }>();
      for (const c of classSnap.docs) {
        const studentsSnap = await getDocs(
          query(
            collection(db, 'users'),
            where('academy_id', '==', academyId),
            where('role', '==', 'student'),
            where('class_id', '==', c.id),
            where('is_active', '==', true)
          )
        );
        const activeCount = studentsSnap.docs.filter((d) => !d.data().deleted_at).length;
        classMap.set(c.id, { name: c.data().name ?? '-', total: activeCount });
      }
      const classIds = Array.from(classMap.keys());
      if (classIds.length === 0) {
        return { pendingCount: 0, checkedCount: 0, dueSoonCount: 0, recentHomeworks: [] };
      }

      // 최근 14일치 숙제 (Firestore in 쿼리 한도 30개 — 반 30개 이하 가정)
      // 한도 초과 가능성 대비: 30개씩 분할
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffTs = Timestamp.fromDate(cutoff);

      const homeworks: { id: string; title: string; classId: string; dueDate: Date }[] = [];
      const chunks: string[][] = [];
      for (let i = 0; i < classIds.length; i += 30) {
        chunks.push(classIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const hwSnap = await getDocs(
          query(
            collection(db, 'homeworks'),
            where('class_id', 'in', chunk),
            where('due_date', '>=', cutoffTs)
          )
        );
        hwSnap.docs.forEach((d) => {
          const data = d.data();
          homeworks.push({
            id: d.id,
            title: data.title ?? '',
            classId: data.class_id ?? '',
            dueDate: (data.due_date as Timestamp).toDate(),
          });
        });
      }

      // 각 숙제 제출물 집계
      let pendingCount = 0;
      let checkedCount = 0;
      const recent: HomeworkProgress['recentHomeworks'] = [];

      for (const hw of homeworks) {
        const subSnap = await getDocs(collection(db, 'homeworks', hw.id, 'submissions'));
        let pending = 0;
        subSnap.docs.forEach((d) => {
          const status = d.data().status;
          if (status === 'submitted') {
            pending++;
            pendingCount++;
          } else if (status === 'checked') {
            checkedCount++;
          }
        });
        const cls = classMap.get(hw.classId);
        const daysLeft = Math.ceil(
          (hw.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        recent.push({
          id: hw.id,
          title: hw.title,
          className: cls?.name ?? '-',
          dueDate: hw.dueDate,
          daysLeft,
          pending,
          total: cls?.total ?? 0,
        });
      }

      // 검사 대기 많은 순 → 마감 임박 순으로 정렬
      recent.sort((a, b) => {
        if (a.pending !== b.pending) return b.pending - a.pending;
        return a.daysLeft - b.daysLeft;
      });

      const dueSoonCount = recent.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 1).length;

      return {
        pendingCount,
        checkedCount,
        dueSoonCount,
        recentHomeworks: recent.slice(0, 5),
      };
    },
  });
}

// 구독 현황 — academy 문서에서 직접 읽음 (useAuthStore의 academy 재활용)
export function useAcademySubscription() {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['academySubscription', academyId],
    enabled: !!academyId,
    queryFn: async () => {
      if (!academyId) return null;
      const snap = await getDoc(doc(db, 'academies', academyId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        plan: data.plan as 'free' | 'trial' | 'pro',
        trialEndsAt: data.trial_ends_at as Timestamp | null,
        studentCount: (data.student_count as number | undefined) ?? 0,
      };
    },
  });
}
