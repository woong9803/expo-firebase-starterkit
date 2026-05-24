import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';
import type { User, Class } from '../../../types/index';

interface TeacherWithClasses extends User {
  classNames: string[];
  studentCount: number;
  joinedAt: string;
}

// ── 이니셜 아바타 ────────────────────────────────────────────
function InitialAvatar({ name, size = 32 }: { name: string; size?: number }) {
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

export default function TeacherManagement() {
  const { user, academy } = useAuthStore();

  const [teachers, setTeachers] = useState<TeacherWithClasses[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [classMap, setClassMap] = useState<Map<string, string>>(new Map());
  // classId → 재원 학생 수
  const [studentCountMap, setStudentCountMap] = useState<Map<string, number>>(new Map());

  const [copied, setCopied] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeacherWithClasses | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 반 배정 모달 — 선택된 선생님 + 저장 진행 상태
  const [assignTarget, setAssignTarget] = useState<TeacherWithClasses | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // ── 반 목록 + 반별 학생 수 1회 조회
  useEffect(() => {
    if (!user?.academy_id) return;

    (async () => {
      const classSnap = await getDocs(
        query(collection(db, 'classes'), where('academy_id', '==', user.academy_id))
      );
      const cMap = new Map<string, string>();
      classSnap.docs.forEach((d) => cMap.set(d.id, (d.data() as Class).name));
      setClassMap(cMap);

      // 반별 학생 수
      const scMap = new Map<string, number>();
      const studentSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('academy_id', '==', user.academy_id),
          where('role', '==', 'student'),
          where('is_active', '==', true)
        )
      );
      studentSnap.docs.forEach((d) => {
        const classId = d.data().class_id as string | undefined;
        if (classId) scMap.set(classId, (scMap.get(classId) ?? 0) + 1);
      });
      setStudentCountMap(scMap);
    })();
  }, [user?.academy_id]);

  // ── 선생님 목록 실시간 구독
  useEffect(() => {
    if (!user?.academy_id) return;

    const q = query(
      collection(db, 'users'),
      where('academy_id', '==', user.academy_id),
      where('role', '==', 'teacher'),
      where('is_active', '==', true)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: TeacherWithClasses[] = snap.docs
        .filter((d) => !d.data().deleted_at)
        .map((d) => {
          const t = d.data() as User;
          const assignedClassIds = t.assigned_class_ids ?? [];
          const studentCount = assignedClassIds.reduce(
            (acc, id) => acc + (studentCountMap.get(id) ?? 0), 0
          );
          const createdAt = (d.data().created_at as Timestamp | undefined)?.toDate();
          return {
            ...t,
            classNames: assignedClassIds.map((id) => classMap.get(id) ?? '').filter(Boolean),
            studentCount,
            joinedAt: createdAt
              ? createdAt.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
              : '-',
          };
        });
      setTeachers(list);
      setIsLoading(false);
    });

    return () => unsub();
  }, [user?.academy_id, classMap, studentCountMap]);

  // ── 학원코드 복사
  const handleCopyCode = async () => {
    const code = academy?.academy_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 반 배정 저장 — assigned_class_ids 필드만 업데이트 (Rules 화이트리스트)
  const handleSaveAssignment = async (selectedIds: string[]) => {
    if (!assignTarget) return;
    setIsAssigning(true);
    try {
      await updateDoc(doc(db, 'users', assignTarget.uid), {
        assigned_class_ids: selectedIds,
      });
      setAssignTarget(null);
    } catch {
      alert(strings.common.error);
    } finally {
      setIsAssigning(false);
    }
  };

  // ── 선생님 소프트 삭제
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, 'users', deleteTarget.uid), {
        deleted_at: serverTimestamp(),
        is_active: false,
      });
      setDeleteTarget(null);
    } catch {
      alert(strings.common.error);
    } finally {
      setIsDeleting(false);
    }
  };

  const activeCount = teachers.filter((t) => t.is_active).length;
  const code = academy?.academy_code ?? '------';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
            {strings.teachers.title}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            소속 {isLoading ? '-' : activeCount}명
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCodeModal(true)}>
          <IconCopy /> 가입코드 공유
        </button>
      </div>

      {/* ── 1fr + 320px 그리드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* ── 선생님 테이블 ── */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>소속 선생님</p>
          </div>
          {isLoading ? (
            <SkeletonRows />
          ) : teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 13, color: '#475569' }}>{strings.teachers.noTeachers}</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                가입코드를 공유하면 선생님이 직접 계정을 만들 수 있어요
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['선생님', '담당 반', '담당 학생', '연락처', '합류일', '상태', ''].map((h, i) => (
                      <th key={i} className="table-header-cell">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <TeacherRow
                      key={t.uid}
                      teacher={t}
                      onDelete={() => setDeleteTarget(t)}
                      onAssign={() => setAssignTarget(t)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 우측 패널 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 가입코드 카드 — 그라데이션 */}
          <div style={{
            borderRadius: 8,
            background: 'linear-gradient(135deg, #3b5bdb 0%, #5a7af0 100%)',
            color: '#fff',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 22px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, letterSpacing: '0.03em' }}>
                ✦ 선생님 초대
              </p>
              <p style={{ fontSize: 14.5, fontWeight: 600, marginTop: 12, lineHeight: 1.5 }}>
                아래 가입코드를 공유하면<br />선생님이 직접 계정을 만듭니다.
              </p>

              {/* 코드 박스 */}
              <div style={{
                marginTop: 16, padding: '12px 14px',
                background: 'rgba(255,255,255,0.15)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{
                  fontFamily: 'SF Mono, Menlo, monospace',
                  fontSize: 14, fontWeight: 700, letterSpacing: '0.06em',
                }}>
                  {code}
                </span>
                <button
                  onClick={handleCopyCode}
                  style={{
                    background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
                    padding: '5px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                >
                  {copied ? '복사됨 ✓' : '복사'}
                </button>
              </div>

              <p style={{ fontSize: 11.5, opacity: 0.75, marginTop: 10 }}>
                유효기간: 무제한 · 언제든 재발급 가능
              </p>
            </div>
          </div>

          {/* 이번주 선생님 활동 피드 */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>이번주 선생님 활동</p>
            </div>
            {teachers.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 12.5, color: '#94a3b8' }}>
                활동 내역이 없습니다
              </p>
            ) : (
              <ActivityFeed teachers={teachers} />
            )}
          </div>
        </div>
      </div>

      {/* ── 반 배정 모달 ── */}
      {assignTarget && (
        <AssignClassesModal
          teacher={assignTarget}
          classMap={classMap}
          studentCountMap={studentCountMap}
          onSave={handleSaveAssignment}
          onClose={() => setAssignTarget(null)}
          isLoading={isAssigning}
        />
      )}

      {/* ── 가입코드 공유 모달 ── */}
      {showCodeModal && (
        <CodeShareModal
          code={code}
          onClose={() => setShowCodeModal(false)}
        />
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <ConfirmModal
          message={`${deleteTarget.name} 선생님의 계정을 삭제할까요?\n삭제 후에는 앱에 접근할 수 없어요.`}
          confirmLabel={strings.teachers.deleteTeacher}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </div>
  );
}

// ── 선생님 테이블 행 ──────────────────────────────────────────
function TeacherRow({
  teacher, onDelete, onAssign,
}: {
  teacher: TeacherWithClasses;
  onDelete: () => void;
  onAssign: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr className="table-row">
      {/* 선생님 아바타 + 이름 + 이메일 */}
      <td className="table-cell">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialAvatar name={teacher.name} size={32} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 13 }}>{teacher.name}</p>
            <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>
              {teacher.email ?? '-'}
            </p>
          </div>
        </div>
      </td>

      {/* 담당 반 — neutral badges */}
      <td className="table-cell">
        {teacher.classNames.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {teacher.classNames.map((cn) => (
              <span key={cn} className="badge-neutral" style={{ fontSize: 11 }}>{cn}</span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>미배정</span>
        )}
      </td>

      {/* 담당 학생 수 */}
      <td className="table-cell">
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {teacher.studentCount}명
        </span>
      </td>

      {/* 연락처 */}
      <td className="table-cell" style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#475569' }}>
        {teacher.phone_number ?? '-'}
      </td>

      {/* 합류일 */}
      <td className="table-cell" style={{ color: '#475569', fontSize: 12.5 }}>
        {teacher.joinedAt}
      </td>

      {/* 상태 */}
      <td className="table-cell">
        {teacher.is_active
          ? <span className="badge-success">활성</span>
          : <span className="badge-warning">대기</span>
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
              background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8,
              boxShadow: '0 4px 8px rgba(16,24,40,0.08)', padding: '4px 0', minWidth: 130,
            }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            {/* 반 배정 — 학원 내 모든 반을 토글로 선택 */}
            <button
              onClick={() => { setMenuOpen(false); onAssign(); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 14px', fontSize: 12.5, fontWeight: 500,
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#0f172a',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {strings.teachers.assignClasses}
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 14px', fontSize: 12.5, fontWeight: 500,
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fee4e4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              계정 삭제
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── 활동 피드 (이번주 요약, 실데이터 없을 때 placeholder) ─────
function ActivityFeed({ teachers }: { teachers: TeacherWithClasses[] }) {
  // 실 활동 로그 API가 없으므로, 담당 반이 있는 선생님 순으로 표시
  const items = teachers.slice(0, 5).map((t) => ({
    name: t.name,
    action: t.classNames.length > 0 ? '담당 반 배정됨' : '계정 활성화',
    detail: t.classNames.length > 0 ? t.classNames.join(', ') : '가입 완료',
  }));

  return (
    <div>
      {items.map((a, i) => (
        <div
          key={i}
          style={{
            padding: '10px 22px',
            borderBottom: i < items.length - 1 ? '1px solid #e4e7ec' : 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <InitialAvatar name={a.name} size={26} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                <strong>{a.name}</strong> · {a.action}
              </p>
              <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{a.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 가입코드 공유 모달 ────────────────────────────────────────
function CodeShareModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: 440 }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>가입코드 공유</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '18px 22px 0' }}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
            선생님이 아래 코드로 본 학원에 소속되어 계정을 만들 수 있습니다.
          </p>

          {/* 대시 테두리 코드 박스 */}
          <div style={{
            padding: 22, border: '2px dashed #d0d5dd', borderRadius: 12,
            textAlign: 'center', background: '#f6f7f9',
          }}>
            <p style={{
              fontFamily: 'SF Mono, Menlo, monospace',
              fontSize: 28, fontWeight: 700, letterSpacing: '0.08em', color: '#0f172a',
            }}>
              {code}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              이 코드는 학원 관리자만 발급할 수 있습니다
            </p>
          </div>

          {/* 액션 버튼 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={handleCopy}
            >
              <IconCopy />
              {copied ? '복사됨 ✓' : '복사'}
            </button>
            <button className="btn-secondary" style={{ flex: 1 }}>
              <IconMail /> 이메일 전송
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// ── 반 배정 모달 ──────────────────────────────────────────────
// 학원 내 반 목록을 체크박스로 토글하여 선생님에게 배정
function AssignClassesModal({
  teacher, classMap, studentCountMap, onSave, onClose, isLoading,
}: {
  teacher: TeacherWithClasses;
  classMap: Map<string, string>;
  studentCountMap: Map<string, number>;
  onSave: (selectedIds: string[]) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  // 현재 배정된 반 ID로 초기 선택 상태 구성 (Set으로 토글 효율화)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(teacher.assigned_class_ids ?? [])
  );

  // classMap을 배열로 변환 — 반 이름 가나다순 정렬
  const classList = Array.from(classMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const toggle = (classId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selected));
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: 460 }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {strings.teachers.assignClassesTitle}
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {teacher.name} 선생님
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{ background: 'none', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', color: '#94a3b8' }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 — 반 목록 체크박스 */}
        <div style={{ padding: '14px 22px 0', maxHeight: 380, overflowY: 'auto' }}>
          <p style={{ fontSize: 12.5, color: '#475569', marginBottom: 12, lineHeight: 1.5 }}>
            {strings.teachers.assignClassesDesc}
          </p>

          {classList.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>
                {strings.teachers.noClassesYet}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {classList.map((c) => {
                const isChecked = selected.has(c.id);
                const studentCount = studentCountMap.get(c.id) ?? 0;
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: isChecked ? '#eef2ff' : '#f9fafb',
                      border: `1px solid ${isChecked ? '#3b5bdb' : '#e4e7ec'}`,
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(c.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#3b5bdb' }}
                    />
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        학생 {studentCount}명
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isLoading}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isLoading || classList.length === 0}
          >
            {isLoading ? '저장 중...' : `${strings.teachers.saveAssignment} (${selected.size}개)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 삭제 확인 모달 ────────────────────────────────────────────
function ConfirmModal({
  message, confirmLabel, onConfirm, onCancel, isLoading, isDanger,
}: {
  message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
  isLoading?: boolean; isDanger?: boolean;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ padding: '22px 22px 0' }}>
          <p style={{ fontSize: 14, color: '#0f172a', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={isLoading}>취소</button>
          <button
            className={isDanger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 스켈레톤 ──────────────────────────────────────────────────
function SkeletonRows() {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse"
          style={{ height: 52, background: '#f1f3f6', borderRadius: 6 }} />
      ))}
    </div>
  );
}

// ── 아이콘 ────────────────────────────────────────────────────
function IconCopy() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
