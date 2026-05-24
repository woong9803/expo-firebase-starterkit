import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { Class, User, AttendanceRecord, AttendanceStatus } from '../../../types/index';

// 엑셀 내보내기 대상 학생 조회 (웹 전용 — Firebase JS SDK)
// 재원자(is_active: true) + 해당 월에 수강기간이 걸친 퇴원자 포함, 탈퇴 계정 제외
async function fetchStudentsForExportWeb(
  academyId: string,
  classId: string,
  year: number,
  month: number,
): Promise<User[]> {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('academy_id', '==', academyId),
      where('role', '==', 'student'),
      where('class_id', '==', classId),
    ),
  );

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as User))
    .filter((s) => !s.deleted_at)
    .filter((s) => {
      if (s.is_active) return true;
      if (!s.withdrawal_date) return false;
      const withdrawal = s.withdrawal_date.toDate();
      if (withdrawal < monthStart) return false;
      if (s.enrollment_date && s.enrollment_date.toDate() > monthEnd) return false;
      return true;
    });
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** 학생 한 명의 특정 날짜 출결 상태 */
export interface StudentAttendance {
  uid: string;
  name: string;
  record: AttendanceRecord | null; // null = 미입력
}

/** 결석 사유 항목 */
export interface AbsenceReasonItem {
  studentName: string;
  status: 'absent' | 'late';
  reason: string;
}

/** 월별 출결 데이터 (엑셀 다운로드용) */
export interface MonthlyAttendanceData {
  students: User[];
  // { 'YYYY-MM-DD': { [studentUid]: AttendanceRecord } }
  attendanceData: Record<string, Record<string, AttendanceRecord>>;
}

// ─── 훅 ──────────────────────────────────────────────────────────────────────

/** 출결 관리 페이지용 반 목록 */
export function useAttendanceClasses() {
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

/**
 * 특정 날짜 + 반의 출결 현황 조회
 * attendances/{classId_date}/records → 학생별 출결 상태 반환
 */
export function useDailyAttendance(classId: string | null, date: string) {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['dailyAttendance', academyId, classId, date],
    enabled: !!academyId && !!classId && !!date,
    queryFn: async (): Promise<StudentAttendance[]> => {
      // 반 소속 재원 학생 목록
      const studentsSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'student'),
          where('class_id', '==', classId),
          where('is_active', '==', true)
        )
      );

      // 해당 날짜 출결 기록 조회
      const attendanceDocId = `${classId}_${date}`;
      const recordsSnap = await getDocs(
        collection(db, 'attendances', attendanceDocId, 'records')
      );

      // studentUid → AttendanceRecord 맵
      const recordMap = new Map<string, AttendanceRecord>();
      recordsSnap.docs.forEach((d) =>
        recordMap.set(d.id, d.data() as AttendanceRecord)
      );

      return studentsSnap.docs
        // 탈퇴 처리된 계정(deleted_at 필드 있음) 제외
        .filter((d) => !d.data().deleted_at)
        .map((d) => ({
          uid: d.id,
          name: d.data().name as string,
          record: recordMap.get(d.id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    },
  });
}

/**
 * 특정 날짜 + 반의 결석 사유 목록 (reason 필드가 있는 항목만)
 */
export function useAbsenceReasons(classId: string | null, date: string) {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['absenceReasons', academyId, classId, date],
    enabled: !!academyId && !!classId && !!date,
    queryFn: async (): Promise<AbsenceReasonItem[]> => {
      // 학생 이름 맵 구성
      const studentsSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', academyId),
          where('role', '==', 'student'),
          where('class_id', '==', classId),
          where('is_active', '==', true)
        )
      );
      const nameMap = new Map<string, string>();
      // 탈퇴 처리된 계정 제외
      studentsSnap.docs
        .filter((d) => !d.data().deleted_at)
        .forEach((d) => nameMap.set(d.id, d.data().name as string));

      // 출결 기록에서 reason이 있는 항목만 추출
      const attendanceDocId = `${classId}_${date}`;
      const recordsSnap = await getDocs(
        collection(db, 'attendances', attendanceDocId, 'records')
      );

      const reasons: AbsenceReasonItem[] = [];
      recordsSnap.docs.forEach((d) => {
        const record = d.data() as AttendanceRecord;
        if (record.reason && (record.status === 'absent' || record.status === 'late')) {
          reasons.push({
            studentName: nameMap.get(d.id) ?? '(알 수 없음)',
            status: record.status,
            reason: record.reason,
          });
        }
      });

      return reasons.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
    },
  });
}

/** 날짜별 전체 반 출결 집계 (출결 관리 페이지 — 반별 리스트용) */
export interface ClassDailyStats {
  classId: string;
  className: string;
  teacherName: string;
  schedule: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  noRecord: number;
}

export function useDateClassStats(date: string) {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['dateClassStats', academyId, date],
    enabled: !!academyId && !!date,
    queryFn: async (): Promise<ClassDailyStats[]> => {
      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );

      const result: ClassDailyStats[] = [];

      for (const classDoc of classesSnap.docs) {
        const cls = classDoc.data();

        // 담당 선생님 이름
        let teacherName = '-';
        if (cls.teacher_id) {
          const { getDoc, doc } = await import('firebase/firestore');
          const teacherSnap = await getDoc(doc(db, 'users', cls.teacher_id));
          if (teacherSnap.exists()) teacherName = teacherSnap.data().name ?? '-';
        }

        // 학생 목록 — 탈퇴 처리된 계정(deleted_at) 제외
        const studentsSnap = await getDocs(
          query(
            collection(db, 'users'),
            where('academy_id', '==', academyId),
            where('role', '==', 'student'),
            where('class_id', '==', classDoc.id),
            where('is_active', '==', true)
          )
        );
        const total = studentsSnap.docs.filter((d) => !d.data().deleted_at).length;

        // 출결 기록
        const recordsSnap = await getDocs(
          collection(db, 'attendances', `${classDoc.id}_${date}`, 'records')
        );
        let present = 0, late = 0, absent = 0;
        recordsSnap.docs.forEach((d) => {
          const r = d.data() as AttendanceRecord;
          if (r.status === 'present') present++;
          else if (r.status === 'late') late++;
          else if (r.status === 'absent') absent++;
        });

        result.push({
          classId: classDoc.id,
          className: cls.name ?? '-',
          teacherName,
          schedule: cls.schedule ?? '',
          total,
          present,
          late,
          absent,
          noRecord: total - present - late - absent,
        });
      }

      return result;
    },
  });
}

/** 이번달 일별 출석률 (캘린더 히트맵용) */
export interface DailyRate {
  date: number;    // 일(1~31)
  rate: number;    // 0~100
  hasData: boolean;
}

export function useMonthlyCalendar(year: number, month: number) {
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? null;

  return useQuery({
    queryKey: ['monthlyCalendar', academyId, year, month],
    enabled: !!academyId,
    queryFn: async (): Promise<DailyRate[]> => {
      const today = new Date();
      const lastDay = new Date(year, month, 0).getDate();
      const ym = `${year}-${String(month).padStart(2, '0')}`;

      const classesSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', academyId))
      );
      const classIds = classesSnap.docs.map((d) => d.id);

      const result: DailyRate[] = [];

      for (let d = 1; d <= lastDay; d++) {
        // 미래 날짜는 스킵
        const thisDate = new Date(year, month - 1, d);
        if (thisDate > today) {
          result.push({ date: d, rate: 0, hasData: false });
          continue;
        }

        const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
        let total = 0, present = 0;

        for (const classId of classIds) {
          const recordsSnap = await getDocs(
            collection(db, 'attendances', `${classId}_${dateStr}`, 'records')
          );
          recordsSnap.docs.forEach((doc) => {
            const r = doc.data() as AttendanceRecord;
            total++;
            if (r.status === 'present' || r.status === 'late') present++;
          });
        }

        result.push({
          date: d,
          rate: total > 0 ? Math.round((present / total) * 100) : 0,
          hasData: total > 0,
        });
      }

      return result;
    },
  });
}

/**
 * 월별 출결 전체 데이터 조회 (엑셀 다운로드 전 호출)
 * - classId가 null이면 빈 데이터 반환 (전체 반 다운로드는 별도 처리)
 */
export async function fetchMonthlyAttendanceData(
  academyId: string,
  classId: string,
  year: number,
  month: number
): Promise<MonthlyAttendanceData> {
  // 재원자 + 해당 월에 걸친 퇴원자까지 포함 — 공통 헬퍼 사용 (web 전용 db 주입)
  const students = await fetchStudentsForExportWeb(academyId, classId, year, month);

  // 해당 월의 날짜 배열 생성
  const lastDay = new Date(year, month, 0).getDate();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const dates = Array.from({ length: lastDay }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${ym}-${dd}`;
  });

  // 날짜별 출결 기록 순차 조회 (데이터가 없는 날은 건너뜀)
  const attendanceData: Record<string, Record<string, AttendanceRecord>> = {};
  for (const date of dates) {
    const recordsSnap = await getDocs(
      collection(db, 'attendances', `${classId}_${date}`, 'records')
    );
    if (!recordsSnap.empty) {
      const records: Record<string, AttendanceRecord> = {};
      recordsSnap.docs.forEach((d) => {
        records[d.id] = d.data() as AttendanceRecord;
      });
      attendanceData[date] = records;
    }
  }

  return { students, attendanceData };
}

// ─── 출결 입력 mutations ────────────────────────────────────────────────────

/**
 * 명렬표에서 임시 토글한 출결 상태들을 한 번에 저장한다.
 * - 부모 문서에 academy_id를 merge로 보장 (Rules·인덱스 조회 필수)
 * - 각 학생 records/{uid}에 status만 merge 저장 (기존 reason 보존)
 */
export function useSaveAttendanceBulk() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? '';

  return useMutation({
    mutationFn: async (params: {
      classId: string;
      date: string;
      // reason 미지정(undefined) → 기존 reason 보존
      // reason: null → 사유 제거 / reason: string → 사유 저장
      records: { uid: string; status?: AttendanceStatus; reason?: string | null }[];
    }) => {
      const { classId, date, records } = params;
      if (!academyId) throw new Error('학원 정보를 불러오지 못했습니다.');

      // 1) 부모 문서에 academy_id 보장 (없으면 생성, 있으면 그대로)
      await setDoc(
        doc(db, 'attendances', `${classId}_${date}`),
        { academy_id: academyId },
        { merge: true }
      );

      // 2) 각 학생 record를 병렬로 status·reason merge 저장
      //    status/reason 중 정의된 필드만 payload에 담아 미지정 필드는 보존
      await Promise.all(
        records.map(({ uid, status, reason }) => {
          const payload: Record<string, unknown> = {};
          if (status !== undefined) payload.status = status;
          if (reason !== undefined) payload.reason = reason;
          if (Object.keys(payload).length === 0) return Promise.resolve();
          return setDoc(
            doc(db, 'attendances', `${classId}_${date}`, 'records', uid),
            payload,
            { merge: true }
          );
        })
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['dailyAttendance', academyId, vars.classId, vars.date] });
      qc.invalidateQueries({ queryKey: ['absenceReasons', academyId, vars.classId, vars.date] });
      qc.invalidateQueries({ queryKey: ['dateClassStats', academyId, vars.date] });
      qc.invalidateQueries({ queryKey: ['todayStats', academyId] });
      qc.invalidateQueries({ queryKey: ['todayByClass', academyId] });
      qc.invalidateQueries({ queryKey: ['weeklyTrend', academyId] });
      qc.invalidateQueries({ queryKey: ['monthlyCalendar', academyId] });
    },
  });
}

/**
 * 결석/지각 사유 즉시 저장 (status는 건드리지 않음)
 * - reason: null → 사유 제거
 * - 부모 문서에 academy_id 보장 (Rules·인덱스 조회 필수) + record는 setDoc merge로
 *   문서가 없을 때도 안전하게 생성. status가 아직 없으면 reason만 들어 있는 부분 record가
 *   생성되지만 후속 status 저장이 merge이므로 손실 없음.
 */
export function useSetAttendanceReason() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const academyId = user?.academy_id ?? '';

  return useMutation({
    mutationFn: async (params: {
      classId: string;
      date: string;
      uid: string;
      reason: string | null;
    }) => {
      const { classId, date, uid, reason } = params;
      if (!academyId) throw new Error('학원 정보를 불러오지 못했습니다.');

      await setDoc(
        doc(db, 'attendances', `${classId}_${date}`),
        { academy_id: academyId },
        { merge: true }
      );

      await setDoc(
        doc(db, 'attendances', `${classId}_${date}`, 'records', uid),
        { reason },
        { merge: true }
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['dailyAttendance', academyId, vars.classId, vars.date] });
      qc.invalidateQueries({ queryKey: ['absenceReasons', academyId, vars.classId, vars.date] });
    },
  });
}
