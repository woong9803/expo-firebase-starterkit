import { useState } from 'react';
import { strings } from '../constants/strings';
import { useAuthStore } from '../store/useAuthStore';
import {
  useDateClassStats,
  useAbsenceReasons,
  useMonthlyCalendar,
  fetchMonthlyAttendanceData,
  useAttendanceClasses,
  type ClassDailyStats,
  type AbsenceReasonItem,
} from '../hooks/useAttendance';
import {
  downloadClassAttendanceExcel,
  downloadAllClassesAttendanceExcel,
  type WebExportParams,
} from '../lib/excelExporter';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── 아이콘 ────────────────────────────────────────────────────
const IconCalendar = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const IconDownload = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

// ── 스켈레톤 ──────────────────────────────────────────────────
function Skeleton({ height = 80 }: { height?: number }) {
  return <div className="animate-pulse" style={{ background: '#f1f3f6', borderRadius: 8, height }} />;
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function AttendanceManagement() {
  const { user, academy } = useAuthStore();
  const { data: classes } = useAttendanceClasses();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);

  const now = new Date();
  const { data: classStats, isLoading: statsLoading } = useDateClassStats(selectedDate);
  const { data: calendarData, isLoading: calLoading } = useMonthlyCalendar(now.getFullYear(), now.getMonth() + 1);

  // 전체 집계
  const totals = classStats?.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      present: acc.present + c.present,
      late: acc.late + c.late,
      absent: acc.absent + c.absent,
    }),
    { total: 0, present: 0, late: 0, absent: 0 }
  ) ?? { total: 0, present: 0, late: 0, absent: 0 };

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
            {strings.attendance.title}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{dateLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 날짜 선택 */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-secondary"
              onClick={() => setShowDatePicker((v) => !v)}
            >
              <IconCalendar /> 날짜 선택
            </button>
            {showDatePicker && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', zIndex: 30,
                background: '#fff', border: '1px solid #e4e7ec',
                borderRadius: 8, padding: 12, boxShadow: '0 4px 8px rgba(16,24,40,0.08)',
              }}>
                <input
                  type="date"
                  className="input-field"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setShowDatePicker(false); setSelectedClassId(null); }}
                  style={{ width: 180 }}
                />
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={() => setShowExcelModal(true)}>
            <IconDownload /> 월별 출석부 (Excel)
          </button>
        </div>
      </div>

      {/* ── KPI 4-grid ── */}
      {statsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={90} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <SummaryCard label="총 대상" value={totals.total} sub="전 반 합계" accentColor={null} />
          <SummaryCard
            label="출석" value={totals.present}
            sub={totals.total > 0 ? `${((totals.present / totals.total) * 100).toFixed(1)}%` : '-'}
            accentColor="#0ea371"
          />
          <SummaryCard
            label="지각" value={totals.late}
            sub={totals.total > 0 ? `${((totals.late / totals.total) * 100).toFixed(1)}%` : '-'}
            accentColor="#d97706"
          />
          <SummaryCard
            label="결석" value={totals.absent}
            sub={totals.total > 0 ? `${((totals.absent / totals.total) * 100).toFixed(1)}%` : '-'}
            accentColor="#dc2626"
          />
        </div>
      )}

      {/* ── 2컬럼: 반별 리스트 + 결석 사유 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 반별 오늘 출결 */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>반별 오늘 출결</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>반을 클릭해 결석 사유 확인</p>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {statsLoading ? (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(4)].map((_, i) => <Skeleton key={i} height={72} />)}
              </div>
            ) : !classStats?.length ? (
              <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: '#94a3b8' }}>
                등록된 반이 없습니다
              </p>
            ) : (
              classStats.map((c) => (
                <ClassListItem
                  key={c.classId}
                  stats={c}
                  selected={selectedClassId === c.classId}
                  onClick={() => setSelectedClassId((prev) => prev === c.classId ? null : c.classId)}
                />
              ))
            )}
          </div>
        </div>

        {/* 결석 사유 확인 */}
        <AbsenceReasonsPanel
          classId={selectedClassId}
          date={selectedDate}
          className={classStats?.find((c) => c.classId === selectedClassId)?.className}
        />
      </div>

      {/* ── 이번달 출석 캘린더 ── */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>이번달 출석 캘린더</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {now.getFullYear()}년 {now.getMonth() + 1}월 · 진한 색상일수록 높은 출석률
            </p>
          </div>
          {/* 범례 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#94a3b8' }}>
            <span>낮음</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o, i) => (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: 3,
                background: '#3b5bdb', opacity: o,
              }} />
            ))}
            <span>높음</span>
          </div>
        </div>
        <div style={{ padding: '16px 22px 20px' }}>
          {calLoading ? (
            <Skeleton height={200} />
          ) : (
            <CalendarHeatmap
              year={now.getFullYear()}
              month={now.getMonth() + 1}
              data={calendarData ?? []}
              today={now.getDate()}
              selectedDate={new Date(selectedDate + 'T00:00:00')}
              onSelect={(d) => {
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(d).padStart(2, '0');
                setSelectedDate(`${now.getFullYear()}-${mm}-${dd}`);
                setSelectedClassId(null);
              }}
            />
          )}
        </div>
      </div>

      {/* 엑셀 다운로드 모달 */}
      {showExcelModal && (
        <ExcelDownloadModal
          classes={classes ?? []}
          academyName={academy?.name ?? ''}
          academyId={user?.academy_id ?? ''}
          onClose={() => setShowExcelModal(false)}
        />
      )}
    </div>
  );
}

// ── Summary KPI 카드 (좌측 3px 색 테두리) ─────────────────────
function SummaryCard({
  label, value, sub, accentColor,
}: {
  label: string; value: number; sub: string; accentColor: string | null;
}) {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 8,
      padding: '18px 20px',
      borderLeft: accentColor ? `3px solid ${accentColor}` : '1px solid #e4e7ec',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    }}>
      <p style={{
        fontSize: 12, fontWeight: 600,
        color: accentColor ?? '#94a3b8',
        marginBottom: 4,
      }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}<span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400, marginLeft: 2 }}>명</span>
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{sub}</p>
    </div>
  );
}

// ── 반별 리스트 아이템 ─────────────────────────────────────────
function ClassListItem({
  stats, selected, onClick,
}: {
  stats: ClassDailyStats; selected: boolean; onClick: () => void;
}) {
  const rate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
  const presentW = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
  const lateW = stats.total > 0 ? (stats.late / stats.total) * 100 : 0;
  const absentW = stats.total > 0 ? (stats.absent / stats.total) * 100 : 0;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 20px', borderBottom: '1px solid #e4e7ec', cursor: 'pointer',
        background: selected ? '#eef2ff' : 'transparent',
        borderLeft: `3px solid ${selected ? '#3b5bdb' : 'transparent'}`,
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = '#f6f7f9';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>{stats.className}</p>
          <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
            {stats.teacherName}
            {stats.schedule ? ` · ${stats.schedule}` : ''}
          </p>
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
          {rate}%
        </p>
      </div>

      {/* 출/지/결 스택 바 */}
      <div style={{
        marginTop: 10, height: 6, background: '#f1f3f6', borderRadius: 4, overflow: 'hidden',
        display: 'flex',
      }}>
        <div style={{ width: `${presentW}%`, background: '#0ea371', transition: 'width 0.4s' }} />
        <div style={{ width: `${lateW}%`, background: '#d97706', transition: 'width 0.4s' }} />
        <div style={{ width: `${absentW}%`, background: '#dc2626', transition: 'width 0.4s' }} />
      </div>

      {/* 범례 */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11.5 }}>
        <span style={{ color: '#0ea371' }}>● 출석 {stats.present}</span>
        <span style={{ color: '#d97706' }}>● 지각 {stats.late}</span>
        <span style={{ color: '#dc2626' }}>● 결석 {stats.absent}</span>
      </div>
    </div>
  );
}

// ── 결석 사유 패널 ─────────────────────────────────────────────
function AbsenceReasonsPanel({
  classId, date, className,
}: {
  classId: string | null; date: string; className?: string;
}) {
  const { data: reasons, isLoading } = useAbsenceReasons(classId, date);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header">
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
          {className ?? '결석 사유 확인'}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>학부모 제출 사유</p>
      </div>

      {!classId ? (
        <p style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: '#94a3b8' }}>
          왼쪽에서 반을 선택해주세요
        </p>
      ) : isLoading ? (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} height={52} />)}
        </div>
      ) : !reasons?.length ? (
        <p style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: '#94a3b8' }}>
          제출된 결석 사유가 없습니다
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['학생', '상태', '사유', '제출 시각'].map((h) => (
                  <th key={h} className="table-header-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reasons.map((r, i) => (
                <AbsenceRow key={i} item={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AbsenceRow({ item }: { item: AbsenceReasonItem }) {
  return (
    <tr className="table-row">
      <td className="table-cell" style={{ fontWeight: 600 }}>{item.studentName}</td>
      <td className="table-cell">
        {item.status === 'late'
          ? <span className="badge-warning">지각</span>
          : <span className="badge-danger">결석</span>
        }
      </td>
      <td className="table-cell" style={{ color: '#475569' }}>{item.reason || '-'}</td>
      <td className="table-cell" style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>-</td>
    </tr>
  );
}

// ── 캘린더 히트맵 ─────────────────────────────────────────────
function CalendarHeatmap({
  year, month, data, today, selectedDate, onSelect,
}: {
  year: number; month: number;
  data: { date: number; rate: number; hasData: boolean }[];
  today: number;
  selectedDate: Date;
  onSelect: (d: number) => void;
}) {
  // 해당 월 1일의 요일 (0=일)
  const firstDow = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();

  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  // 6행 맞추기
  while (cells.length % 7 !== 0) cells.push(null);

  const rateMap = new Map(data.map((d) => [d.date, d]));

  const selectedDay =
    selectedDate.getFullYear() === year && selectedDate.getMonth() + 1 === month
      ? selectedDate.getDate()
      : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {/* 요일 헤더 */}
      {DAYS.map((d) => (
        <div key={d} style={{
          fontSize: 11, color: '#94a3b8', fontWeight: 600,
          textAlign: 'center', padding: '4px 0',
        }}>
          {d}
        </div>
      ))}

      {/* 날짜 셀 */}
      {cells.map((d, i) => {
        if (!d) return <div key={i} />;
        const info = rateMap.get(d);
        const opacity = info?.hasData ? (info.rate / 100) * 0.85 + 0.15 : 0;
        const isToday = d === today;
        const isSelected = d === selectedDay;
        const textColor = opacity > 0.5 ? '#fff' : '#0f172a';

        return (
          <div
            key={i}
            onClick={() => info?.hasData && onSelect(d)}
            style={{
              aspectRatio: '1.3 / 1', borderRadius: 6, position: 'relative',
              background: info?.hasData ? `rgba(59, 91, 219, ${opacity})` : '#f6f7f9',
              border: isSelected ? '2px solid #3b5bdb' : isToday ? '2px solid #0f172a' : '1px solid transparent',
              cursor: info?.hasData ? 'pointer' : 'default',
              transition: 'opacity 0.12s',
            }}
          >
            <div style={{
              position: 'absolute', top: 6, left: 8,
              fontSize: 11, fontWeight: 600,
              color: info?.hasData ? textColor : '#94a3b8',
            }}>
              {d}
            </div>
            {info?.hasData && (
              <div style={{
                position: 'absolute', bottom: 5, right: 7,
                fontSize: 10, fontVariantNumeric: 'tabular-nums',
                color: opacity > 0.5 ? 'rgba(255,255,255,0.85)' : '#475569',
              }}>
                {info.rate}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 엑셀 다운로드 모달 ────────────────────────────────────────
function ExcelDownloadModal({
  classes, academyName, academyId, onClose,
}: {
  classes: { id: string; name: string; subject?: string }[];
  academyName: string;
  academyId: string;
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [targetClassId, setTargetClassId] = useState('all');
  const [isDownloading, setIsDownloading] = useState(false);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i);

  const handleDownload = async () => {
    if (!academyId) return;
    setIsDownloading(true);
    try {
      if (targetClassId === 'all') {
        const allParams: { params: WebExportParams }[] = [];
        for (const cls of classes) {
          const data = await fetchMonthlyAttendanceData(academyId, cls.id, year, month);
          allParams.push({
            params: {
              academyName, className: cls.name, subjectName: cls.subject ?? '',
              year, month, students: data.students, attendanceData: data.attendanceData,
            },
          });
        }
        downloadAllClassesAttendanceExcel(allParams, year, month);
      } else {
        const cls = classes.find((c) => c.id === targetClassId);
        if (!cls) return;
        const data = await fetchMonthlyAttendanceData(academyId, targetClassId, year, month);
        downloadClassAttendanceExcel({
          academyName, className: cls.name, subjectName: cls.subject ?? '',
          year, month, students: data.students, attendanceData: data.attendanceData,
        });
      }
      onClose();
    } catch (err: unknown) {
      alert((err as { message?: string }).message ?? '엑셀 생성 중 오류가 발생했어요.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box" style={{ width: '100%', maxWidth: 380 }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            {strings.attendance.excelDownload}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12.5, color: '#94a3b8' }}>다운로드할 월과 반을 선택하세요. 법정 출석부 양식으로 저장됩니다.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>연도</label>
              <select className="input-field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>월</label>
              <select className="input-field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>반 선택</label>
            <select className="input-field" value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
              <option value="all">전체 반 (다중 시트)</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isDownloading}>취소</button>
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={isDownloading || classes.length === 0}
          >
            {isDownloading ? '생성 중...' : <><IconDownload /> {strings.common.download}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
