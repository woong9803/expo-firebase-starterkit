import { useState, useMemo } from 'react';
import { strings } from '../constants/strings';
import {
  useStudents,
  useClasses,
  useDeactivateStudent,
  useReactivateStudent,
  useMoveStudentClass,
  useCreateStudent,
  useCreateClass,
  useUpdateClass,
  useDeleteClass,
  type StudentWithClass,
  type CreateStudentResult,
} from '../hooks/useStudents';
import type { Class } from '../../../types/index';

// ─── 이니셜 아바타 ────────────────────────────────────────────
function InitialAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const hue = name
    ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    : 200;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue}, 55%, 48%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.38, fontWeight: 700,
    }}>
      {name?.charAt(0) ?? '?'}
    </div>
  );
}

// ─── 타입 ─────────────────────────────────────────────────────
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name' | 'className' | 'enrollment';
type SortDir = 'asc' | 'desc';

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function StudentManagement() {
  const { data: students } = useStudents();
  const { data: classes } = useClasses();

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [createdStudent, setCreatedStudent] = useState<CreateStudentResult | null>(null);

  const totalStudents = students?.length ?? 0;
  const totalClasses = classes?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
            {strings.students.title}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            총 {totalStudents}명 · {totalClasses}개 반 운영 중
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setShowAddClass(true)}>
            <IconPlus /> 반 생성
          </button>
          <button className="btn-primary" onClick={() => setShowAddStudent(true)}>
            <IconPlus /> 학생 등록
          </button>
        </div>
      </div>

      {/* ── 학생 목록 ── */}
      <StudentListSection onAddClass={() => setShowAddClass(true)} />

      {/* ── 반 목록 그리드 ── */}
      <ClassGridSection onAddClass={() => setShowAddClass(true)} />

      {/* 학생 등록 모달 */}
      {showAddStudent && (
        <AddStudentModal
          onClose={() => setShowAddStudent(false)}
          onCreated={(result) => { setShowAddStudent(false); setCreatedStudent(result); }}
        />
      )}

      {/* 생성 계정 정보 모달 */}
      {createdStudent && (
        <StudentCredentialsModal result={createdStudent} onClose={() => setCreatedStudent(null)} />
      )}

      {/* 반 생성 모달 */}
      {showAddClass && (
        <ClassModal onClose={() => setShowAddClass(false)} />
      )}
    </div>
  );
}

// ─── 학생 목록 섹션 ───────────────────────────────────────────
function StudentListSection({ onAddClass: _onAddClass }: { onAddClass: () => void }) {
  const { data: students, isLoading, isError } = useStudents();
  const { data: classes } = useClasses();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [moveTarget, setMoveTarget] = useState<StudentWithClass | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const deactivate = useDeactivateStudent();
  const reactivate = useReactivateStudent();

  // 필터 카운트
  const counts = useMemo(() => ({
    all: students?.length ?? 0,
    active: students?.filter((s) => s.is_active).length ?? 0,
    inactive: students?.filter((s) => !s.is_active).length ?? 0,
  }), [students]);

  const filtered = useMemo(() => {
    if (!students) return [];
    let list = [...students];
    if (statusFilter === 'active') list = list.filter((s) => s.is_active);
    else if (statusFilter === 'inactive') list = list.filter((s) => !s.is_active);
    if (classFilter !== 'all') list = list.filter((s) => s.class_id === classFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      let valA = '', valB = '';
      if (sortKey === 'name') { valA = a.name; valB = b.name; }
      else if (sortKey === 'className') { valA = a.className; valB = b.className; }
      else if (sortKey === 'enrollment') {
        valA = a.enrollment_date?.toDate().toISOString() ?? '';
        valB = b.enrollment_date?.toDate().toISOString() ?? '';
      }
      const cmp = valA.localeCompare(valB, 'ko');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [students, statusFilter, classFilter, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const handleDeactivate = async (student: StudentWithClass) => {
    if (!window.confirm(`${student.name} 학생을 퇴원 처리할까요?`)) return;
    await deactivate.mutateAsync(student.uid);
  };
  const handleReactivate = async (student: StudentWithClass) => {
    if (!window.confirm(`${student.name} 학생을 재원 처리할까요?`)) return;
    await reactivate.mutateAsync(student.uid);
  };

  const FILTER_TABS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'active', label: '재원' },
    { id: 'inactive', label: '퇴원' },
  ];

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* ── 필터 바 ── */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #e4e7ec',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* pill-tab */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f3f6', padding: 3, borderRadius: 8, flexShrink: 0 }}>
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setStatusFilter(t.id); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                background: statusFilter === t.id ? '#ffffff' : 'transparent',
                color: statusFilter === t.id ? '#0f172a' : '#475569',
                boxShadow: statusFilter === t.id ? '0 1px 2px rgba(16,24,40,0.04)' : 'none',
              }}
            >
              {t.label}
              <span style={{ color: '#94a3b8', marginLeft: 5, fontWeight: 500 }}>
                {counts[t.id]}
              </span>
            </button>
          ))}
        </div>

        {/* 이름 검색 */}
        <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
          <svg width="14" height="14" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            className="input-field"
            placeholder="이름으로 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: 32, background: '#ffffff' }}
          />
        </div>

        {/* 반 필터 */}
        <select
          className="input-field"
          value={classFilter}
          onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          style={{ width: 160, background: '#ffffff' }}
        >
          <option value="all">전체 반</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* ── 테이블 ── */}
      {isLoading ? (
        <SkeletonRows />
      ) : isError ? (
        <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: '#dc2626' }}>
          {strings.common.error}
        </p>
      ) : paged.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: '#94a3b8' }}>
          {strings.students.noStudents}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[
                  { label: '학생', sortKey: 'name' as SortKey },
                  { label: '소속 반', sortKey: 'className' as SortKey },
                  { label: '학부모 연락처' },
                  { label: '등록일', sortKey: 'enrollment' as SortKey },
                  { label: '이번달 출석률' },
                  { label: '상태' },
                  { label: '' },
                ].map((h, i) => (
                  <th
                    key={i}
                    className="table-header-cell"
                    style={{ cursor: h.sortKey ? 'pointer' : 'default', userSelect: 'none' }}
                    onClick={() => h.sortKey && toggleSort(h.sortKey)}
                  >
                    {h.label}
                    {h.sortKey && (
                      <span style={{ marginLeft: 4, opacity: 0.5 }}>
                        {sortKey === h.sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((student) => (
                <StudentRow
                  key={student.uid}
                  student={student}
                  onMoveClass={() => setMoveTarget(student)}
                  onDeactivate={() => handleDeactivate(student)}
                  onReactivate={() => handleReactivate(student)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 페이지네이션 ── */}
      {!isLoading && filtered.length > 0 && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e4e7ec',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            {filtered.length}명 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}명 표시
          </p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              &lsaquo;
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  width: 30, height: 30, borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid', cursor: 'pointer',
                  background: page === p ? '#3b5bdb' : '#ffffff',
                  color: page === p ? '#ffffff' : '#475569',
                  borderColor: page === p ? '#3b5bdb' : '#d0d5dd',
                }}
              >
                {p}
              </button>
            ))}
            <button
              className="btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}

      {/* 반 이동 모달 */}
      {moveTarget && (
        <MoveClassModal
          student={moveTarget}
          classes={classes ?? []}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

// ─── 학생 테이블 행 ───────────────────────────────────────────
function StudentRow({
  student,
  onMoveClass,
  onDeactivate,
  onReactivate,
}: {
  student: StudentWithClass;
  onMoveClass: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const enrollDate = student.enrollment_date
    ? student.enrollment_date.toDate().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
    : '-';

  return (
    <tr className="table-row" style={{ opacity: student.is_active ? 1 : 0.55 }}>
      {/* 학생 */}
      <td className="table-cell">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialAvatar name={student.name} size={30} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 13 }}>{student.name}</p>
            <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{student.uid.slice(0, 8)}</p>
          </div>
        </div>
      </td>
      {/* 소속 반 */}
      <td className="table-cell">
        <span className="badge-neutral">{student.className || '-'}</span>
      </td>
      {/* 학부모 연락처 */}
      <td className="table-cell" style={{ color: '#475569', fontFamily: 'monospace', fontSize: 12.5 }}>
        {student.guardian_phone ?? '-'}
      </td>
      {/* 등록일 */}
      <td className="table-cell" style={{ color: '#475569', fontSize: 12.5 }}>{enrollDate}</td>
      {/* 이번달 출석률 — 현재 per-student 데이터 미지원, placeholder */}
      <td className="table-cell">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 60, height: 5, background: '#f1f3f6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: '0%', height: '100%', background: '#3b5bdb', borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>-</span>
        </div>
      </td>
      {/* 상태 */}
      <td className="table-cell">
        {student.is_active
          ? <span className="badge-success">재원</span>
          : <span className="badge-neutral">퇴원</span>
        }
      </td>
      {/* 더보기 메뉴 */}
      <td className="table-cell" style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: menuOpen ? '#f1f3f6' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
          }}
        >
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute', right: 8, top: '100%', zIndex: 30,
              background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 8,
              boxShadow: '0 4px 8px rgba(16,24,40,0.08)', padding: '4px 0', minWidth: 120,
            }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            {student.is_active && (
              <MenuItem label="반 이동" onClick={() => { setMenuOpen(false); onMoveClass(); }} />
            )}
            {student.is_active ? (
              <MenuItem label="퇴원 처리" danger onClick={() => { setMenuOpen(false); onDeactivate(); }} />
            ) : (
              <MenuItem label="재원 복구" onClick={() => { setMenuOpen(false); onReactivate(); }} />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 14px', fontSize: 12.5, fontWeight: 500, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: danger ? '#dc2626' : '#0f172a',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f6'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

// ─── 반 목록 그리드 섹션 ──────────────────────────────────────
function ClassGridSection({ onAddClass }: { onAddClass: () => void }) {
  const { data: classes, isLoading, isError } = useClasses();
  const { data: students } = useStudents();
  const [editTarget, setEditTarget] = useState<Class | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const deleteClass = useDeleteClass();

  const studentCountByClass = useMemo(() => {
    const map = new Map<string, number>();
    students?.filter((s) => s.is_active).forEach((s) => {
      if (s.class_id) map.set(s.class_id, (map.get(s.class_id) ?? 0) + 1);
    });
    return map;
  }, [students]);

  const handleCopy = (cls: Class) => {
    navigator.clipboard.writeText(cls.invite_code);
    setCopiedId(cls.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (cls: Class) => {
    const count = studentCountByClass.get(cls.id) ?? 0;
    if (count > 0) { alert(strings.classes.deleteWithStudentsWarning); return; }
    if (!window.confirm(strings.classes.deleteConfirm)) return;
    await deleteClass.mutateAsync(cls.id);
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>반 목록</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>각 반의 담당 선생님·시간표·학생 수를 확인하세요</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onAddClass}>
          <IconPlus /> 반 추가
        </button>
      </div>

      <div style={{ padding: '16px 22px 20px' }}>
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: 120, background: '#f1f3f6', borderRadius: 8 }} className="animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p style={{ textAlign: 'center', padding: 24, fontSize: 13, color: '#dc2626' }}>{strings.common.error}</p>
        ) : !classes?.length ? (
          <p style={{ textAlign: 'center', padding: 32, fontSize: 13, color: '#94a3b8' }}>{strings.classes.noClasses}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {classes.map((cls) => (
              <ClassCard
                key={cls.id}
                cls={cls}
                studentCount={studentCountByClass.get(cls.id) ?? 0}
                copied={copiedId === cls.id}
                onCopy={() => handleCopy(cls)}
                onEdit={() => setEditTarget(cls)}
                onDelete={() => handleDelete(cls)}
              />
            ))}
          </div>
        )}
      </div>

      {editTarget && (
        <ClassModal existing={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

function ClassCard({
  cls, studentCount, copied, onCopy, onEdit, onDelete,
}: {
  cls: Class;
  studentCount: number;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? '#d0d5dd' : '#e4e7ec'}`,
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
        background: '#ffffff', cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: hovered ? '0 1px 3px rgba(16,24,40,0.08)' : 'none',
      }}
    >
      {/* 학년 뱃지 + 더보기 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="badge-accent">{cls.subject ?? '반'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#475569'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            수정
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            삭제
          </button>
        </div>
      </div>

      {/* 반 이름 */}
      <p style={{ fontSize: 14.5, fontWeight: 600, color: '#0f172a' }}>{cls.name}</p>

      {/* 초대코드 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#eef2ff', borderRadius: 6, padding: '7px 10px',
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#3b5bdb', letterSpacing: '0.08em', fontFamily: 'monospace' }}>
          {cls.invite_code}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onCopy(); }}
          style={{ fontSize: 11.5, fontWeight: 600, color: '#3b5bdb', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {copied ? '복사됨 ✓' : '복사'}
        </button>
      </div>

      {/* 학생 수 */}
      <div style={{
        paddingTop: 8, borderTop: '1px solid #e4e7ec',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, color: '#475569',
      }}>
        <span>재원 학생</span>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{studentCount}명</span>
      </div>
    </div>
  );
}

// ─── 학생 등록 모달 ───────────────────────────────────────────
function AddStudentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: CreateStudentResult) => void;
}) {
  const { data: classes } = useClasses();
  const createStudent = useCreateStudent();
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (!classId) { setError('반을 선택해주세요.'); return; }
    setError(null);
    try {
      const result = await createStudent.mutateAsync({
        name: name.trim(), classId,
        birthDate: birthDate || undefined,
        guardianPhone: guardianPhone || undefined,
      });
      onCreated(result);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.common.error);
    }
  };

  return (
    <Modal title={strings.students.addStudent} onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorBox message={error} />}
        <FormField label={`${strings.students.name} *`}>
          <input className="input-field" placeholder="학생 이름" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={`${strings.students.class} *`}>
          <select className="input-field" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">반을 선택해주세요</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label={strings.students.birthDate}>
          <input className="input-field" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </FormField>
        <FormField label={strings.students.guardianPhone}>
          <input className="input-field" type="tel" placeholder="010-0000-0000" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
        </FormField>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>* 학생 계정(가상 이메일)이 자동 생성됩니다.</p>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose} disabled={createStudent.isPending}>취소</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={createStudent.isPending}>
          {createStudent.isPending ? '처리 중...' : strings.students.addStudent}
        </button>
      </div>
    </Modal>
  );
}

// ─── 생성된 계정 정보 모달 ────────────────────────────────────
function StudentCredentialsModal({ result, onClose }: { result: CreateStudentResult; onClose: () => void }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Modal title="학생 계정이 생성됐어요" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#e6f7ef', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
            아래 정보를 학생에게 전달하고, 첫 로그인 후 비밀번호 변경을 안내해주세요.
          </p>
        </div>
        {[
          { label: '이름', value: result.name, field: 'name' },
          { label: '이메일 (아이디)', value: result.email, field: 'email' },
          { label: '임시 비밀번호', value: result.tempPassword, field: 'pw', highlight: true },
          { label: '학부모 연동코드', value: result.linkCode, field: 'link' },
        ].map((row) => (
          <div key={row.field} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#f6f7f9', border: '1px solid #e4e7ec', borderRadius: 8, padding: '10px 14px',
          }}>
            <div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{row.label}</p>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: row.highlight ? '#3b5bdb' : '#0f172a', fontFamily: row.highlight ? 'monospace' : 'inherit' }}>
                {row.value}
              </p>
            </div>
            <button
              onClick={() => copy(row.value, row.field)}
              style={{ fontSize: 12, fontWeight: 600, color: '#3b5bdb', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 12 }}
            >
              {copiedField === row.field ? '복사됨 ✓' : '복사'}
            </button>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>확인했어요</button>
      </div>
    </Modal>
  );
}

// ─── 반 이동 모달 ─────────────────────────────────────────────
function MoveClassModal({ student, classes, onClose }: { student: StudentWithClass; classes: Class[]; onClose: () => void }) {
  const [selectedClassId, setSelectedClassId] = useState(student.class_id ?? '');
  const moveClass = useMoveStudentClass();

  const handleConfirm = async () => {
    if (!selectedClassId || selectedClassId === student.class_id) { onClose(); return; }
    await moveClass.mutateAsync({ uid: student.uid, classId: selectedClassId });
    onClose();
  };

  return (
    <Modal title={`${student.name} — 반 이동`} onClose={onClose} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>이동할 반을 선택해주세요.</p>
        {classes.map((cls) => (
          <label
            key={cls.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${selectedClassId === cls.id ? '#3b5bdb' : '#e4e7ec'}`,
              background: selectedClassId === cls.id ? '#eef2ff' : '#ffffff',
              transition: 'all 0.12s',
            }}
          >
            <input
              type="radio" name="classSelect" value={cls.id}
              checked={selectedClassId === cls.id}
              onChange={() => setSelectedClassId(cls.id)}
              style={{ accentColor: '#3b5bdb' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 }}>{cls.name}</span>
            {student.class_id === cls.id && <span className="badge-neutral">현재 반</span>}
          </label>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose} disabled={moveClass.isPending}>취소</button>
        <button className="btn-primary" onClick={handleConfirm} disabled={moveClass.isPending}>
          {moveClass.isPending ? '처리 중...' : '이동하기'}
        </button>
      </div>
    </Modal>
  );
}

// ─── 반 생성/수정 모달 ────────────────────────────────────────
function ClassModal({ existing, onClose }: { existing?: Class; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [error, setError] = useState<string | null>(null);
  const createClass = useCreateClass();
  const updateClass = useUpdateClass();
  const isEdit = !!existing;
  const isLoading = createClass.isPending || updateClass.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) { setError('반 이름을 입력해주세요.'); return; }
    setError(null);
    try {
      if (isEdit && existing) {
        await updateClass.mutateAsync({ id: existing.id, name: name.trim(), subject: subject.trim() });
      } else {
        await createClass.mutateAsync({ name: name.trim(), subject: subject.trim() });
      }
      onClose();
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? strings.common.error);
    }
  };

  return (
    <Modal title={isEdit ? strings.classes.editClass : strings.classes.addClass} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorBox message={error} />}
        <FormField label={`${strings.classes.className} *`}>
          <input className="input-field" placeholder="예: 중등 수학 A반" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={strings.classes.subject}>
          <input className="input-field" placeholder="예: 수학, 영어" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        {!isEdit && (
          <p style={{ fontSize: 12, color: '#94a3b8' }}>* 초대코드(6자리)가 자동으로 생성됩니다.</p>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose} disabled={isLoading}>취소</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? '처리 중...' : isEdit ? strings.common.save : strings.classes.addClass}
        </button>
      </div>
    </Modal>
  );
}

// ─── 공통 UI ──────────────────────────────────────────────────
function Modal({ title, children, onClose, width = 480 }: {
  title: string; children: React.ReactNode; onClose: () => void; width?: number;
}) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: width }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '18px 22px 0' }}>{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</label>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ background: '#fee4e4', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ fontSize: 12.5, color: '#991b1b' }}>{message}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="animate-pulse" style={{ height: 44, background: '#f1f3f6', borderRadius: 6 }} />
      ))}
    </div>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
