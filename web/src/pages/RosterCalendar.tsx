/**
 * web/src/pages/RosterCalendar.tsx — 월별 출결 명렬표 (학생×날짜 그리드)
 *
 * 진입: /attendance/roster
 * 기능:
 *   - 반 / 연 / 월 선택 → 학생을 행, 날짜를 열로 한 달 출결을 한 눈에 확인
 *   - 셀 표기: ○(출석) / △(지각) / X(결석) / 빈 칸(미입력)
 *   - 우측 합계: 출/지/결 수, 출석률
 *   - 화면에 보이는 그대로 엑셀 다운로드 (수정 가능한 .xlsx)
 *
 * 데이터:
 *   - useAttendanceClasses : 반 목록
 *   - fetchMonthlyAttendanceData : 학생 + 날짜별 record (이미 엑셀 모달이 사용 중)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/useAuthStore';
import {
  useAttendanceClasses,
  fetchMonthlyAttendanceData,
} from '../hooks/useAttendance';
import { downloadRosterAttendanceExcel } from '../lib/excelExporter';
import { getAttendanceSymbol } from '../../../lib/legalAttendanceFormat';
import { strings } from '../constants/strings';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 출결 기호별 색상 (셀 배경/텍스트)
const SYMBOL_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  '○': { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
  '△': { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A' },
  'X': { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
};

function Skeleton({ height = 80 }: { height?: number }) {
  return <div className="animate-pulse" style={{ background: '#F1F5F9', borderRadius: 8, height }} />;
}

export default function RosterCalendar() {
  const navigate = useNavigate();
  const { user, academy } = useAuthStore();
  const { data: classes } = useAttendanceClasses();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [classId, setClassId] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // 반 목록 로드되면 첫 번째 반을 기본 선택
  useEffect(() => {
    if (!classId && classes && classes.length > 0) {
      setClassId(classes[0].id);
    }
  }, [classes, classId]);

  // 월별 출결 데이터 (학생 + 날짜별 record)
  const academyId = user?.academy_id ?? '';
  const { data: monthly, isLoading } = useQuery({
    queryKey: ['rosterMonthly', academyId, classId, year, month],
    enabled: !!academyId && !!classId,
    queryFn: () => fetchMonthlyAttendanceData(academyId, classId, year, month),
  });

  // 그리드용 날짜 배열 — 출결 기록이 1건이라도 있는 날짜만 노출
  // (학원 운영일이 아닌 날까지 빈칸으로 펼치면 가로 스크롤만 길어지고 의미 없는 셀이 늘어남)
  const dates = useMemo(() => {
    if (!monthly) return [];
    return Object.keys(monthly.attendanceData)
      .sort()
      .map((dateStr) => {
        const day = Number(dateStr.slice(8, 10));
        const dow = new Date(year, month - 1, day).getDay();
        return { day, dateStr, dow, label: DOW[dow] };
      });
  }, [monthly, year, month]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i);
  const selectedClass = classes?.find((c) => c.id === classId);

  // 학생별 출결 행 + 합계
  const studentRows = useMemo(() => {
    if (!monthly) return [];
    return monthly.students
      .slice()
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ko'))
      .map((s) => {
        let present = 0, late = 0, absent = 0;
        const cells = dates.map(({ dateStr }) => {
          const record = monthly.attendanceData[dateStr]?.[s.uid];
          const symbol = getAttendanceSymbol(record?.status ?? null);
          if (symbol === '○') present++;
          else if (symbol === '△') late++;
          else if (symbol === 'X') absent++;
          return { symbol, reason: record?.reason ?? null };
        });
        const totalDays = present + late + absent;
        const rate = totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 0;
        return { uid: s.uid, name: s.name ?? '-', cells, present, late, absent, rate, totalDays };
      });
  }, [monthly, dates]);

  const handleDownload = async () => {
    if (!monthly || !selectedClass || !academy) return;
    setIsDownloading(true);
    try {
      downloadRosterAttendanceExcel({
        academyName: academy.name ?? '',
        className: selectedClass.name,
        subjectName: selectedClass.subject ?? '',
        year,
        month,
        students: monthly.students,
        attendanceData: monthly.attendanceData,
      });
    } catch (err: unknown) {
      alert((err as { message?: string }).message ?? '엑셀 생성 중 오류가 발생했어요.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── 헤더 ── */}
      <div>
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/attendance')}
          style={{ marginBottom: 8, padding: 0 }}
        >
          {strings.attendance.rosterBackToAttendance}
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.025em' }}>
              {strings.attendance.rosterTitle}
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
              {strings.attendance.rosterSubtitle}
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={isDownloading || !monthly || studentRows.length === 0}
          >
            {isDownloading ? '생성 중...' : strings.attendance.rosterDownloadExcel}
          </button>
        </div>
      </div>

      {/* ── 컨트롤 영역 (반 / 연 / 월) ── */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              {strings.attendance.selectClass}
            </label>
            <select
              className="input-field"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!classes || classes.length === 0}
            >
              {(!classes || classes.length === 0) ? (
                <option>등록된 반이 없습니다</option>
              ) : (
                classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
              )}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              연도
            </label>
            <select className="input-field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              월
            </label>
            <select className="input-field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>
          {strings.attendance.rosterLegend}
        </p>
      </div>

      {/* ── 명렬표 그리드 ── */}
      {!classId ? (
        <div className="card" style={{ padding: '60px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>{strings.attendance.rosterSelectClass}</p>
        </div>
      ) : isLoading ? (
        <div className="card" style={{ padding: '14px 18px' }}>
          <Skeleton height={400} />
        </div>
      ) : !monthly || studentRows.length === 0 ? (
        <div className="card" style={{ padding: '60px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>{strings.attendance.rosterEmpty}</p>
        </div>
      ) : dates.length === 0 ? (
        <div className="card" style={{ padding: '60px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>이 달에는 아직 출결 기록이 없어요</p>
          <p style={{ fontSize: 12, color: '#CBD5E1', marginTop: 4 }}>
            연·월을 바꾸거나 출결 입력 후 다시 확인해주세요
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              width: 'max-content',
              minWidth: '100%',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{
                    position: 'sticky', left: 0, zIndex: 2,
                    background: '#F8FAFC',
                    minWidth: 120, padding: '10px 12px',
                    borderBottom: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    fontSize: 12, fontWeight: 700, color: '#475569',
                    textAlign: 'left',
                  }}>
                    학생
                  </th>
                  {dates.map(({ day, label, dow }) => {
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th key={day} style={{
                        minWidth: 32, padding: '6px 4px',
                        borderBottom: '1px solid #E2E8F0',
                        borderRight: '1px solid #F1F5F9',
                        fontSize: 11, fontWeight: 600,
                        color: dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : '#475569',
                        background: isWeekend ? '#F8FAFC' : '#F8FAFC',
                        textAlign: 'center', lineHeight: 1.2,
                      }}>
                        <div>{day}</div>
                        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{label}</div>
                      </th>
                    );
                  })}
                  {[
                    strings.attendance.rosterColPresent,
                    strings.attendance.rosterColLate,
                    strings.attendance.rosterColAbsent,
                    strings.attendance.rosterColRate,
                  ].map((h) => (
                    <th key={h} style={{
                      minWidth: 56, padding: '8px 8px',
                      borderBottom: '1px solid #E2E8F0',
                      borderLeft: '2px solid #E2E8F0',
                      fontSize: 11.5, fontWeight: 700, color: '#0F172A',
                      background: '#F8FAFC', textAlign: 'center',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {studentRows.map((row, ri) => (
                  <tr key={row.uid} style={{ background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFD' }}>
                    {/* 학생 이름 (sticky 좌측 고정) */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1,
                      background: ri % 2 === 0 ? '#FFFFFF' : '#FBFCFD',
                      padding: '8px 12px',
                      borderBottom: '1px solid #F1F5F9',
                      borderRight: '1px solid #E2E8F0',
                      fontSize: 13, fontWeight: 600, color: '#0F172A',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.name}
                    </td>

                    {/* 날짜별 출결 셀 */}
                    {row.cells.map((cell, i) => {
                      const isWeekend = dates[i].dow === 0 || dates[i].dow === 6;
                      const style = SYMBOL_STYLE[cell.symbol];
                      return (
                        <td
                          key={i}
                          title={cell.reason ?? ''}
                          style={{
                            padding: 0,
                            borderBottom: '1px solid #F1F5F9',
                            borderRight: '1px solid #F1F5F9',
                            background: isWeekend && !style ? '#FAFBFC' : '#FFFFFF',
                            textAlign: 'center', verticalAlign: 'middle',
                            minWidth: 32, height: 36,
                          }}
                        >
                          {style ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 24, borderRadius: 4,
                              background: style.bg, color: style.color,
                              border: `1px solid ${style.border}`,
                              fontSize: 12, fontWeight: 700,
                            }}>
                              {cell.symbol}
                            </span>
                          ) : (
                            <span style={{ color: '#CBD5E1', fontSize: 12 }}>·</span>
                          )}
                        </td>
                      );
                    })}

                    {/* 합계 컬럼 */}
                    <td style={{
                      padding: '8px 8px', borderBottom: '1px solid #F1F5F9',
                      borderLeft: '2px solid #E2E8F0',
                      fontSize: 12.5, fontWeight: 600, color: '#065F46', textAlign: 'center',
                    }}>
                      {row.present}
                    </td>
                    <td style={{
                      padding: '8px 8px', borderBottom: '1px solid #F1F5F9',
                      fontSize: 12.5, fontWeight: 600, color: '#78350F', textAlign: 'center',
                    }}>
                      {row.late}
                    </td>
                    <td style={{
                      padding: '8px 8px', borderBottom: '1px solid #F1F5F9',
                      fontSize: 12.5, fontWeight: 600, color: '#991B1B', textAlign: 'center',
                    }}>
                      {row.absent}
                    </td>
                    <td style={{
                      padding: '8px 8px', borderBottom: '1px solid #F1F5F9',
                      fontSize: 12.5, fontWeight: 700, color: '#0F172A', textAlign: 'center',
                    }}>
                      {row.totalDays > 0 ? `${row.rate}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
