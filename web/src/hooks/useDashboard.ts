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

// YYYY-MM-DD 형식 날짜 문자열 반환
function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
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

// 오늘 반별 출결 현황 (테이블용)
export interface TodayClassRow {
  id: string;
  name: string;
  schedule: string; // 수업 시간 표시용 (ex. "월·수·금 19:00")
  teacher: string;
  status: 'done' | 'in-progress' | 'pending';
  present: number;
  late: number;
  absent: number;
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

        // 오늘 출결 기록 집계
        const recordsSnap = await getDocs(
          collection(db, 'attendances', `${classDoc.id}_${today}`, 'records')
        );

        let present = 0, late = 0, absent = 0;
        recordsSnap.docs.forEach((d) => {
          const r = d.data() as AttendanceRecord;
          if (r.status === 'present') present++;
          else if (r.status === 'late') late++;
          else if (r.status === 'absent') absent++;
        });

        // 기록이 있으면 완료, 없으면 예정으로 간단 처리
        const hasRecords = recordsSnap.size > 0;
        const status: TodayClassRow['status'] = hasRecords ? 'done' : 'pending';

        rows.push({
          id: classDoc.id,
          name: cls.name ?? '-',
          schedule: cls.schedule ?? '',
          teacher: teacherName,
          status,
          present,
          late,
          absent,
        });
      }

      return rows;
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
