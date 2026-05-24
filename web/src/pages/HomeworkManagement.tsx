import { useState, useMemo, useEffect } from 'react';
import {
  useHomeworks,
  useCreateHomework,
  useUpdateHomework,
  useDeleteHomework,
  useHomeworkReview,
  useSaveFeedback,
  useSaveFeedbackComment,
  calcDDay,
  formatDueDate,
  type HomeworkWithStats,
  type SubmissionWithStudent,
} from '../hooks/useHomework';
import { useClasses } from '../hooks/useStudents';
import { useAuthStore } from '../store/useAuthStore';
import type { Class } from '../../../types/index';

// ── 아이콘 ────────────────────────────────────────────────────
const IconFilter = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

// ── 스켈레톤 ──────────────────────────────────────────────────
function Skeleton({ height = 96 }: { height?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ background: '#f1f3f6', borderRadius: 10, height }}
    />
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function HomeworkManagement() {
  const { user } = useAuthStore();
  const { data: homeworks, isLoading } = useHomeworks();
  const { data: classes } = useClasses();

  // 반 필터 (null = 전체)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // 모달 상태
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<HomeworkWithStats | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeworkWithStats | null>(null);
  const [reviewTarget, setReviewTarget] = useState<HomeworkWithStats | null>(null);

  const filtered = useMemo(() => {
    if (!homeworks) return [];
    if (!selectedClassId) return homeworks;
    return homeworks.filter((h) => h.class_id === selectedClassId);
  }, [homeworks, selectedClassId]);

  const selectedClassName =
    selectedClassId
      ? classes?.find((c) => c.id === selectedClassId)?.name ?? '알 수 없음'
      : '전체';

  // 출제 버튼 비활성 조건 — 반이 하나도 없으면 출제 불가
  const canCreate = !!classes && classes.length > 0 && !!user?.academy_id;

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            숙제 관리
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            학원 전체 숙제 출제 · 검사 · 피드백
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreate(true)}
          disabled={!canCreate}
          title={!canCreate ? '반을 먼저 만들어주세요' : ''}
          style={!canCreate ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
        >
          + 숙제 출제
        </button>
      </div>

      {/* ── 반 필터 ── */}
      {classes && classes.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 14, display: 'inline-block' }}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8,
              background: '#fff', border: '1px solid #e4e7ec',
              fontSize: 13, fontWeight: 600, color: '#5B50E8',
              cursor: 'pointer',
            }}
          >
            <IconFilter />
            <span>{selectedClassName}</span>
            <IconChevronDown />
          </button>

          {filterOpen && (
            <>
              {/* 외부 클릭 차단용 백드롭 */}
              <div
                onClick={() => setFilterOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 10 }}
              />
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: '#fff', border: '1px solid #e4e7ec',
                  borderRadius: 8, padding: 4, minWidth: 180,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                  zIndex: 20,
                }}
              >
                <FilterItem
                  label="전체"
                  active={!selectedClassId}
                  onClick={() => { setSelectedClassId(null); setFilterOpen(false); }}
                />
                {classes.map((c) => (
                  <FilterItem
                    key={c.id}
                    label={c.name}
                    active={selectedClassId === c.id}
                    onClick={() => { setSelectedClassId(c.id); setFilterOpen(false); }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 목록 ── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : !filtered.length ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center',
          background: '#fff', border: '1px solid #e4e7ec', borderRadius: 12,
        }}>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            {homeworks?.length === 0
              ? '출제된 숙제가 없어요. 첫 숙제를 출제해보세요.'
              : '선택한 반에 표시할 숙제가 없어요.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              onEdit={() => setEditTarget(hw)}
              onDelete={() => setDeleteTarget(hw)}
              onReview={() => setReviewTarget(hw)}
            />
          ))}
        </div>
      )}

      {/* ── 출제 모달 ── */}
      {showCreate && classes && (
        <HomeworkFormModal
          classes={classes}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && classes && (
        <HomeworkFormModal
          classes={classes}
          target={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* ── 검사 모달 ── */}
      {reviewTarget && (
        <HomeworkReviewModal
          hw={reviewTarget}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}

// ── 필터 메뉴 항목 ────────────────────────────────────────────
function FilterItem({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 10px',
        background: active ? '#eef0fb' : 'transparent',
        border: 'none', borderRadius: 6,
        fontSize: 13, fontWeight: active ? 600 : 500,
        color: active ? '#5B50E8' : '#0f172a',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span>{label}</span>
      {active && (
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// ── 숙제 카드 ────────────────────────────────────────────────
/**
 * 카드 본문 클릭 → 검사 모달 (onReview)
 * 수정/삭제 아이콘 클릭 → 이벤트 전파 차단해서 카드 클릭 막음
 */
function HomeworkCard({
  hw, onEdit, onDelete, onReview,
}: {
  hw: HomeworkWithStats;
  onEdit: () => void;
  onDelete: () => void;
  onReview: () => void;
}) {
  const dDay = calcDDay(hw.due_date);
  const dDayInfo = getDDayInfo(dDay);
  const submitRate = hw.totalStudents > 0
    ? Math.round((hw.submitCount / hw.totalStudents) * 100)
    : 0;

  // 액션 버튼 클릭 시 카드 onClick으로 이벤트 버블링 차단
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={onReview}
      style={{
        background: '#fff', border: '1px solid #e4e7ec', borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#c7c2f3';
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(91,80,232,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e4e7ec';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* 상단: 반 태그 + D-Day + 액션 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          padding: '3px 8px', borderRadius: 6,
          background: '#f1f5f9', color: '#334155',
          fontSize: 11, fontWeight: 600,
        }}>
          {hw.className}
        </span>
        <span style={{
          padding: '3px 8px', borderRadius: 6,
          background: dDayInfo.bg, color: dDayInfo.color,
          fontSize: 11, fontWeight: 700,
        }}>
          {dDayInfo.label}
        </span>
        <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 'auto' }}>
          {formatDueDate(hw.due_date)} 마감
        </span>
        {/* 수정 / 삭제 버튼 — 카드 클릭 이벤트 전파 차단 */}
        <button
          onClick={(e) => { stop(e); onEdit(); }}
          title="숙제 수정"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: '#f1f5f9', border: 'none',
            color: '#475569', cursor: 'pointer',
          }}
        >
          <IconEdit />
        </button>
        <button
          onClick={(e) => { stop(e); onDelete(); }}
          title="숙제 삭제"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: '#fef2f2', border: 'none',
            color: '#991b1b', cursor: 'pointer',
          }}
        >
          <IconTrash />
        </button>
      </div>

      {/* 제목 */}
      <p style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        {hw.title}
      </p>

      {/* 내용 미리보기 */}
      {hw.content && (
        <p style={{
          fontSize: 12.5, color: '#64748b', lineHeight: 1.45,
          marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {hw.content}
        </p>
      )}

      {/* 제출 현황 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          flex: 1, height: 6, borderRadius: 3,
          background: '#f1f5f9', overflow: 'hidden',
        }}>
          <div style={{
            width: `${submitRate}%`, height: '100%',
            background: submitRate >= 80 ? '#10b981' : '#5B50E8',
            transition: 'width 0.3s',
          }} />
        </div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
          {hw.submitCount} / {hw.totalStudents}명
        </p>
      </div>
    </div>
  );
}

// D-Day 칩 색상 결정
function getDDayInfo(d: number): { label: string; bg: string; color: string } {
  // 마감 지난 숙제 — 회색
  if (d < 0) return { label: `마감 ${-d}일 지남`, bg: '#f1f5f9', color: '#64748b' };
  // 마감 당일 — 빨강 (강조)
  if (d === 0) return { label: 'D-DAY', bg: '#fee2e2', color: '#991b1b' };
  // 마감 임박 (1~2일) — 주황
  if (d <= 2) return { label: `D-${d}`, bg: '#fef3c7', color: '#92400e' };
  // 그 외 — 보라
  return { label: `D-${d}`, bg: '#eef2ff', color: '#3730a3' };
}

// ── 출제/수정 공용 모달 ──────────────────────────────────────
/**
 * target이 있으면 수정, 없으면 신규 출제 모드
 * 반(class_id)은 출제 후 변경 불가 — 수정 시 반 선택 비활성
 */
function HomeworkFormModal({
  classes, target, onClose,
}: {
  classes: Class[];
  target?: HomeworkWithStats;
  onClose: () => void;
}) {
  const isEdit = !!target;
  const createMut = useCreateHomework();
  const updateMut = useUpdateHomework();

  const [title, setTitle] = useState(target?.title ?? '');
  const [content, setContent] = useState(target?.content ?? '');
  // 반 — 신규는 첫 반 자동 선택, 수정은 기존 값 유지
  const [classId, setClassId] = useState<string>(
    target?.class_id ?? (classes.length === 1 ? classes[0].id : '')
  );

  // datetime-local 값 포맷 — Date → "YYYY-MM-DDTHH:mm"
  const initDue = target ? target.due_date.toDate() : null;
  const [dueValue, setDueValue] = useState<string>(
    initDue ? toDateTimeLocalValue(initDue) : ''
  );

  const isSaving = createMut.isPending || updateMut.isPending;

  // 유효성 — 제목 + 반 + 마감일 모두 있어야 함
  const canSave = title.trim().length > 0 && !!classId && !!dueValue && !isSaving;

  // 마감일 D-Day 미리보기 (수정 시 과거 날짜 허용 — 사용자가 의도적으로 마감일을 늘리거나 줄일 수 있음)
  const previewDDay = useMemo(() => {
    if (!dueValue) return null;
    const d = new Date(dueValue);
    if (isNaN(d.getTime())) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const due = new Date(d); due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [dueValue]);

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!canSave) return;
    const dueDate = new Date(dueValue);
    try {
      if (isEdit && target) {
        await updateMut.mutateAsync({
          id: target.id,
          title, content, dueDate,
        });
      } else {
        await createMut.mutateAsync({
          title, content, classId, dueDate,
        });
      }
      onClose();
    } catch (e) {
      console.error('[HomeworkForm] 저장 실패:', e);
      alert('저장에 실패했어요. 다시 시도해주세요.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box" style={{ width: '100%', maxWidth: 520 }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            {isEdit ? '숙제 수정' : '새 숙제 출제'}
          </h2>
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
        <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 제목 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              제목 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="숙제 제목을 입력해주세요"
              maxLength={80}
              autoFocus
            />
          </div>

          {/* 내용 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              내용
            </label>
            <textarea
              className="input-field"
              rows={4}
              style={{ resize: 'none' }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="숙제 내용이나 안내사항을 입력해주세요"
              maxLength={500}
            />
          </div>

          {/* 반 선택 — 수정 모드에서는 비활성 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              반 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            {isEdit ? (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: '#f1f5f9', color: '#475569',
                fontSize: 13, fontWeight: 600,
              }}>
                {target?.className}
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#94a3b8' }}>
                  · 출제 후 반 변경은 지원하지 않아요
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {classes.map((c) => {
                  const checked = classId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClassId(c.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 6,
                        fontSize: 12.5, fontWeight: 600,
                        border: '1px solid', cursor: 'pointer',
                        background: checked ? '#eef0fb' : '#f6f7f9',
                        borderColor: checked ? '#5B50E8' : '#e4e7ec',
                        color: checked ? '#5B50E8' : '#475569',
                        transition: 'all 0.12s',
                      }}
                    >
                      {checked ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 마감일 — 커스텀 DateTimePicker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              마감일 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <DateTimePicker value={dueValue} onChange={setDueValue} />
            {previewDDay !== null && (
              <p style={{
                fontSize: 12, fontWeight: 600,
                color: previewDDay < 0 ? '#dc2626' : '#5B50E8',
                marginTop: 8,
              }}>
                {previewDDay === 0
                  ? '⚠️ 오늘 마감'
                  : previewDDay > 0
                    ? `D-${previewDDay} · ${previewDDay}일 후 마감`
                    : `마감일이 ${-previewDDay}일 지났어요`}
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSaving}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {isSaving ? '저장 중...' : isEdit ? '저장' : '출제하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 삭제 확인 모달 ────────────────────────────────────────────
function DeleteConfirmModal({
  target, onClose,
}: {
  target: HomeworkWithStats;
  onClose: () => void;
}) {
  const deleteMut = useDeleteHomework();

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(target.id);
      onClose();
    } catch (e) {
      console.error('[HomeworkDelete] 삭제 실패:', e);
      alert('삭제에 실패했어요. 다시 시도해주세요.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ padding: '22px 22px 0' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            숙제 삭제
          </h2>
          <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
            <strong style={{ color: '#0f172a' }}>"{target.title}"</strong> 숙제를 삭제할까요?
          </p>
          <p style={{ fontSize: 12.5, color: '#dc2626', marginTop: 8, lineHeight: 1.5 }}>
            ⚠️ 삭제하면 학생들이 제출한 내용도 더 이상 확인할 수 없어요.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={deleteMut.isPending}>
            취소
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 숙제 검사 모달 ────────────────────────────────────────────
/**
 * 카드 클릭 시 열리는 풀화면 검사 모달
 *  - 좌: 제출자 / 미제출자 목록
 *  - 우: 선택된 학생의 제출물 + 피드백 (👍/💧)
 *  - 💧 선택 시 코멘트 입력란 노출
 *  - 썸네일 클릭 시 라이트박스
 */
function HomeworkReviewModal({
  hw, onClose,
}: {
  hw: HomeworkWithStats;
  onClose: () => void;
}) {
  const { students, submissions, isLoading } = useHomeworkReview(hw);
  const saveFeedback = useSaveFeedback();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  // 첫 로드 시 — 검사가 필요한 첫 학생 자동 선택
  useEffect(() => {
    if (selectedUid || submissions.length === 0) return;
    // 미검사(submitted) 우선 — is_retry 후 재제출도 status가 'submitted'로 돌아옴
    const pending = submissions.find((s) => s.status === 'submitted');
    setSelectedUid(pending?.studentUid ?? submissions[0].studentUid);
  }, [submissions, selectedUid]);

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  // 미제출자 = 학생 - 제출자
  const submittedUids = new Set(submissions.map((s) => s.studentUid));
  const nonSubmitters = students.filter((s) => !submittedUids.has(s.uid));
  const submitRate =
    students.length > 0 ? Math.round((submissions.length / students.length) * 100) : 0;
  const checkedCount = submissions.filter(
    (s) => s.status === 'checked' && s.feedback === '👍',
  ).length;
  const retryCount = submissions.filter(
    (s) => s.status === 'checked' && s.feedback === '💧',
  ).length;

  const selectedSub = submissions.find((s) => s.studentUid === selectedUid) ?? null;

  const handleFeedback = (fb: '👍' | '💧') => {
    if (!selectedSub) return;
    saveFeedback.mutate({
      homeworkId: hw.id,
      studentUid: selectedSub.studentUid,
      feedback: fb,
      currentFeedback: selectedSub.feedback,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-box"
        style={{
          width: '100%', maxWidth: 1100,
          height: '88vh', maxHeight: 820,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── 헤더 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 22px', borderBottom: '1px solid #e4e7ec',
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 6,
                background: '#f1f5f9', color: '#334155',
                fontSize: 11, fontWeight: 600,
              }}>
                {hw.className}
              </span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                {formatDueDate(hw.due_date)} 마감
              </span>
            </div>
            <h2 style={{
              fontSize: 17, fontWeight: 800, color: '#0f172a',
              letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {hw.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#f6f7fc', border: 'none',
              color: '#64748b', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 제출 현황 바 ── */}
        <div style={{
          padding: '12px 22px', borderBottom: '1px solid #f1f3f6',
          background: '#fafbfc',
          display: 'flex', alignItems: 'center', gap: 14,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>제출 현황</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                <strong style={{ color: '#5B50E8', fontSize: 14 }}>{submissions.length}</strong>
                {' / '}{students.length}명 ({submitRate}%)
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3,
              background: '#e4e7ec', overflow: 'hidden',
            }}>
              <div style={{
                width: `${submitRate}%`, height: '100%',
                background: submitRate >= 80 ? '#10b981' : '#5B50E8',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{
              padding: '4px 10px', borderRadius: 6,
              background: '#ecfdf5', color: '#065f46',
              fontSize: 11.5, fontWeight: 700,
            }}>
              검사완료 {checkedCount}
            </span>
            {retryCount > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 6,
                background: '#fffbeb', color: '#92400e',
                fontSize: 11.5, fontWeight: 700,
              }}>
                다시풀기 {retryCount}
              </span>
            )}
          </div>
        </div>

        {/* ── 본문 — 좌측 학생 리스트 + 우측 검사 영역 ── */}
        {isLoading ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', fontSize: 13,
          }}>
            불러오는 중...
          </div>
        ) : students.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 8, color: '#94a3b8',
          }}>
            <span style={{ fontSize: 32 }}>📭</span>
            <p style={{ fontSize: 14 }}>이 반에 활성 학생이 없어요</p>
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr',
            minHeight: 0, // grid 자식이 overflow 잘 동작하도록
          }}>
            {/* ── 좌: 학생 목록 ── */}
            <div style={{
              borderRight: '1px solid #f1f3f6',
              overflowY: 'auto', padding: '10px 8px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {/* 제출자 섹션 */}
              {submissions.length > 0 && (
                <>
                  <p style={{
                    fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
                    padding: '4px 10px', letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    제출 ({submissions.length}명)
                  </p>
                  {submissions.map((sub) => (
                    <StudentListItem
                      key={sub.studentUid}
                      name={sub.studentName}
                      school={sub.studentSchool}
                      isLate={sub.is_late}
                      feedback={sub.feedback}
                      isRetryPending={sub.is_retry === true && sub.status === 'submitted'}
                      isChecked={sub.status === 'checked'}
                      active={selectedUid === sub.studentUid}
                      onClick={() => setSelectedUid(sub.studentUid)}
                    />
                  ))}
                </>
              )}

              {/* 미제출자 섹션 */}
              {nonSubmitters.length > 0 && (
                <>
                  <p style={{
                    fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
                    padding: '8px 10px 4px',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    미제출 ({nonSubmitters.length}명)
                  </p>
                  {nonSubmitters.map((s) => (
                    <div
                      key={s.uid}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 8,
                        opacity: 0.55,
                      }}
                    >
                      <Avatar name={s.name} size={28} muted />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 12.5, fontWeight: 600, color: '#475569',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {s.name}
                        </p>
                        {s.school_name && (
                          <p style={{ fontSize: 11, color: '#94a3b8' }}>{s.school_name}</p>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, color: '#94a3b8',
                        background: '#f1f5f9', padding: '2px 7px', borderRadius: 6,
                      }}>
                        미제출
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* ── 우: 검사 영역 ── */}
            <div style={{ overflowY: 'auto', padding: 22 }}>
              {!selectedSub ? (
                <div style={{
                  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#94a3b8', fontSize: 13,
                }}>
                  좌측에서 제출 학생을 선택하세요
                </div>
              ) : (
                <SubmissionDetail
                  sub={selectedSub}
                  homeworkId={hw.id}
                  homeworkContent={hw.content}
                  isFeedbackSaving={saveFeedback.isPending}
                  onFeedback={handleFeedback}
                  onImageClick={(urls, index) => setLightbox({ urls, index })}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 이미지 라이트박스 */}
      {lightbox && (
        <ImageLightbox
          urls={lightbox.urls}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ── 학생 목록 아이템 ──────────────────────────────────────────
function StudentListItem({
  name, school, isLate, feedback, isRetryPending, isChecked, active, onClick,
}: {
  name: string;
  school?: string;
  isLate: boolean;
  feedback: '👍' | '💧' | null;
  isRetryPending: boolean;
  isChecked: boolean;
  active: boolean;
  onClick: () => void;
}) {
  // 상태별 좌측 표시 색
  const dotColor =
    isRetryPending ? '#f59e0b'
      : isChecked && feedback === '👍' ? '#10b981'
        : isChecked && feedback === '💧' ? '#f59e0b'
          : '#5B50E8';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: active ? '#eef0fb' : 'transparent',
        border: active ? '1px solid #c7c2f3' : '1px solid transparent',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.12s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#f6f7fc';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* 상태 dot */}
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: dotColor, flexShrink: 0,
      }} />
      <Avatar name={name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <p style={{
            fontSize: 12.5, fontWeight: 600, color: '#0f172a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </p>
          {isLate && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: '#991b1b',
              background: '#fee2e2', padding: '1px 5px', borderRadius: 4,
              flexShrink: 0,
            }}>
              지각
            </span>
          )}
          {isRetryPending && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: '#92400e',
              background: '#fef3c7', padding: '1px 5px', borderRadius: 4,
              flexShrink: 0,
            }}>
              재제출
            </span>
          )}
        </div>
        {school && (
          <p style={{
            fontSize: 11, color: '#94a3b8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {school}
          </p>
        )}
      </div>
      {/* 피드백 이모지 */}
      {feedback && (
        <span style={{ fontSize: 14, flexShrink: 0 }}>{feedback}</span>
      )}
    </button>
  );
}

// ── 아바타 ────────────────────────────────────────────────────
function Avatar({ name, size = 32, muted = false }: { name: string; size?: number; muted?: boolean }) {
  // 이름 첫 글자 + HSL 자동 색
  const hue = name
    ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    : 200;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size / 2,
        background: muted ? '#cbd5e1' : `hsl(${hue}, 55%, 48%)`,
        color: '#fff', fontSize: size * 0.4, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {name?.charAt(0) ?? '?'}
    </div>
  );
}

// ── 검사 상세 영역 ────────────────────────────────────────────
function SubmissionDetail({
  sub, homeworkId, homeworkContent, isFeedbackSaving, onFeedback, onImageClick,
}: {
  sub: SubmissionWithStudent;
  homeworkId: string;
  homeworkContent: string;
  isFeedbackSaving: boolean;
  onFeedback: (fb: '👍' | '💧') => void;
  onImageClick: (urls: string[], index: number) => void;
}) {
  const isReviewedOk = sub.status === 'checked' && sub.feedback === '👍';
  const isRetryRequested = sub.status === 'checked' && sub.feedback === '💧';
  const isRetryPending = sub.is_retry === true && sub.status === 'submitted';

  // 제출 시각 포맷 — '4월 30일 오후 6:00'
  const submittedAt = sub.submitted_at
    ? (() => {
        const d = sub.submitted_at.toDate();
        const ampm = d.getHours() < 12 ? '오전' : '오후';
        const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
        return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 학생 정보 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background:
          isReviewedOk ? '#f0fdf4'
            : isRetryRequested ? '#fffbeb'
              : isRetryPending ? '#fffbeb'
                : '#fafbfc',
        border: '1px solid',
        borderColor:
          isReviewedOk ? '#a7f3d0'
            : isRetryRequested ? '#fcd34d'
              : isRetryPending ? '#fcd34d'
                : '#e4e7ec',
        borderRadius: 12,
      }}>
        <Avatar name={sub.studentName} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              {sub.studentName}
            </p>
            {sub.studentSchool && (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>{sub.studentSchool}</p>
            )}
            {sub.is_late && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#991b1b',
                background: '#fee2e2', padding: '2px 7px', borderRadius: 5,
              }}>
                지각 제출
              </span>
            )}
            {isReviewedOk && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#065f46',
                background: '#ecfdf5', padding: '2px 7px', borderRadius: 5,
              }}>
                검사 완료
              </span>
            )}
            {isRetryRequested && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#92400e',
                background: '#fffbeb', border: '1px solid #fde68a',
                padding: '1px 6px', borderRadius: 5,
              }}>
                다시풀기 요청
              </span>
            )}
            {isRetryPending && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: '#92400e',
                background: '#fef3c7', padding: '2px 7px', borderRadius: 5,
              }}>
                다시 제출됨
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{submittedAt} 제출</p>
        </div>
      </div>

      {/* 다시 제출 안내 배너 */}
      {isRetryPending && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 10,
          background: '#fef3c7', color: '#92400e',
          fontSize: 13, fontWeight: 700,
        }}>
          🔄 학생이 다시 제출했어요 — 새로 검사해주세요
        </div>
      )}

      {/* 숙제 내용 (참고용) */}
      {homeworkContent && (
        <div style={{
          padding: 14, borderRadius: 10,
          background: '#fafbfc', border: '1px solid #f1f3f6',
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: '0.06em' }}>
            숙제 내용
          </p>
          <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {homeworkContent}
          </p>
        </div>
      )}

      {/* 이미지 그리드 */}
      {sub.image_urls && sub.image_urls.length > 0 && (
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', marginBottom: 8, letterSpacing: '0.04em' }}>
            제출 이미지 ({sub.image_urls.length}장)
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 10,
          }}>
            {sub.image_urls.map((url, idx) => (
              <button
                key={idx}
                onClick={() => onImageClick(sub.image_urls, idx)}
                style={{
                  position: 'relative', padding: 0, border: 'none',
                  borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in',
                  aspectRatio: '1 / 1', background: '#f1f5f9',
                }}
              >
                <img
                  src={url}
                  alt={`제출 이미지 ${idx + 1}`}
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transition: 'transform 0.2s',
                  }}
                />
                <span style={{
                  position: 'absolute', bottom: 6, right: 6,
                  fontSize: 10.5, fontWeight: 700, color: '#fff',
                  background: 'rgba(15,23,42,0.7)',
                  padding: '2px 7px', borderRadius: 6,
                }}>
                  {idx + 1} / {sub.image_urls.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 피드백 버튼 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        marginTop: 4,
      }}>
        <FeedbackBtn
          emoji="👍"
          label="잘했어요"
          subLabel="검사 완료"
          color="#10b981"
          bg="#ecfdf5"
          active={sub.feedback === '👍'}
          disabled={isFeedbackSaving}
          onClick={() => onFeedback('👍')}
        />
        <FeedbackBtn
          emoji="💧"
          label="다시 풀어봐요"
          subLabel="재제출 요청"
          color="#f59e0b"
          bg="#fffbeb"
          active={sub.feedback === '💧'}
          disabled={isFeedbackSaving}
          onClick={() => onFeedback('💧')}
        />
      </div>

      {/* 💧 코멘트 입력 */}
      {sub.feedback === '💧' && (
        <FeedbackCommentBox
          homeworkId={homeworkId}
          studentUid={sub.studentUid}
          initialComment={sub.feedback_comment ?? ''}
        />
      )}
    </div>
  );
}

// ── 피드백 큰 버튼 ────────────────────────────────────────────
function FeedbackBtn({
  emoji, label, subLabel, color, bg, active, disabled, onClick,
}: {
  emoji: string;
  label: string;
  subLabel: string;
  color: string;
  bg: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '14px 16px', borderRadius: 12,
        border: '2px solid',
        background: active ? bg : '#fff',
        borderColor: active ? color : '#e4e7ec',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = bg;
          e.currentTarget.style.borderColor = color;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.borderColor = '#e4e7ec';
        }
      }}
    >
      <span style={{ fontSize: 26 }}>{emoji}</span>
      <span style={{
        fontSize: 14, fontWeight: 800,
        color: active ? color : '#0f172a',
        letterSpacing: '-0.01em',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5, color: active ? color : '#94a3b8', fontWeight: 600 }}>
        {subLabel}
      </span>
    </button>
  );
}

// ── 💧 코멘트 입력 박스 ───────────────────────────────────────
function FeedbackCommentBox({
  homeworkId, studentUid, initialComment,
}: {
  homeworkId: string;
  studentUid: string;
  initialComment: string;
}) {
  const [text, setText] = useState(initialComment);
  const saveComment = useSaveFeedbackComment();

  // 외부에서 코멘트가 바뀌면(다른 검사자) 동기화
  useEffect(() => { setText(initialComment); }, [initialComment, studentUid]);

  const isChanged = text.trim() !== initialComment.trim();

  const handleSave = async () => {
    try {
      await saveComment.mutateAsync({ homeworkId, studentUid, comment: text });
    } catch (e) {
      console.error('[FeedbackComment] 저장 실패:', e);
      alert('저장에 실패했어요. 다시 시도해주세요.');
    }
  };

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: '#fffbeb', border: '1px solid #fde68a',
    }}>
      <p style={{
        fontSize: 11.5, fontWeight: 700, color: '#92400e',
        marginBottom: 8, letterSpacing: '0.04em',
      }}>
        학생에게 전달할 피드백 (선택)
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="어떤 부분을 다시 풀어야 할지 안내해주세요"
        rows={3}
        maxLength={200}
        style={{
          width: '100%', padding: '10px 12px',
          border: '1px solid #fde68a', borderRadius: 8,
          background: '#fff', resize: 'none',
          fontSize: 13, color: '#0f172a', lineHeight: 1.5,
          fontFamily: 'inherit',
        }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 8,
      }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{text.length} / 200</span>
        <button
          onClick={handleSave}
          disabled={!isChanged || saveComment.isPending}
          className="btn-primary btn-sm"
          style={{ opacity: isChanged ? 1 : 0.45, cursor: isChanged ? 'pointer' : 'not-allowed' }}
        >
          {saveComment.isPending ? '저장 중...' : '코멘트 저장'}
        </button>
      </div>
    </div>
  );
}

// ── 이미지 라이트박스 ─────────────────────────────────────────
function ImageLightbox({
  urls, initialIndex, onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  // 좌우 키보드 화살표
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(urls.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [urls.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      {/* 닫기 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="닫기"
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 페이지 표시 */}
      {urls.length > 1 && (
        <p style={{
          position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
          color: '#fff', fontSize: 13, fontWeight: 600,
        }}>
          {index + 1} / {urls.length}
        </p>
      )}

      {/* 좌측 화살표 */}
      {urls.length > 1 && index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex(index - 1); }}
          aria-label="이전 이미지"
          style={{
            position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: 22,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 우측 화살표 */}
      {urls.length > 1 && index < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex(index + 1); }}
          aria-label="다음 이미지"
          style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: 22,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 이미지 */}
      <img
        src={urls[index]}
        alt={`제출 이미지 ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '88vh',
          objectFit: 'contain',
          borderRadius: 8,
          cursor: 'default',
        }}
      />
    </div>
  );
}

// ── 유틸 ──────────────────────────────────────────────────────
/** Date → datetime-local 형식 ("YYYY-MM-DDTHH:mm") — 로컬 타임존 기준 */
function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 커스텀 날짜 + 시간 선택기 ─────────────────────────────────
/**
 * 사용자 친화적 마감일 선택 UI
 * - 좌: 월별 달력 (이전/다음 월 이동)
 * - 우: 시간 (오전/오후 + 시 + 분 30분 단위)
 * - 빠른 선택: 오늘·내일·이번 주말 칩
 *
 * value/onChange 는 "YYYY-MM-DDTHH:mm" 포맷 (datetime-local과 동일)
 */
function DateTimePicker({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  // 현재 표시 중인 달력 월 (선택 값 기준 또는 오늘)
  const today = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  const parsed = value ? new Date(value) : null;
  const initMonth = parsed && !isNaN(parsed.getTime()) ? parsed : today;
  const [viewYear, setViewYear] = useState(initMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initMonth.getMonth());

  // 선택된 날짜·시간 (없으면 null)
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  // ── 달력 셀 계산 (해당 월 1일이 속한 주의 일요일부터 6주치) ──
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(first);
    start.setDate(start.getDate() - first.getDay()); // 그 주 일요일로 이동
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewYear, viewMonth]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // 날짜 선택 — 기존 시간 유지 (없으면 09:00 기본)
  const pickDate = (d: Date) => {
    const h = selectedDate?.getHours() ?? 9;
    const m = selectedDate?.getMinutes() ?? 0;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    onChange(toDateTimeLocalValue(next));
  };

  // 시·분 변경
  const pickTime = (h: number, m: number) => {
    const base = selectedDate ?? new Date(today);
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    onChange(toDateTimeLocalValue(next));
  };

  // 빠른 선택 — N일 후 23:59
  const quickPick = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(23, 59, 0, 0);
    onChange(toDateTimeLocalValue(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const prevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };
  const nextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  // 시간 표시 — 오전/오후 + 12시간제
  const hour = selectedDate?.getHours() ?? 9;
  const minute = selectedDate?.getMinutes() ?? 0;
  const isPM = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  // 분 옵션 — 30분 단위로 단순화 (00, 30)
  const minuteOptions = [0, 30];
  // 시 옵션 — 1~12
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{
      border: '1px solid #e4e7ec',
      borderRadius: 14,
      background: '#fff',
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      {/* ── 빠른 선택 칩 ── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: '12px 14px',
        borderBottom: '1px solid #f1f3f6',
        background: 'linear-gradient(180deg, #fafbff 0%, #f6f7fc 100%)',
      }}>
        {([
          ['오늘', 0], ['내일', 1], ['모레', 2], ['일주일 뒤', 7],
        ] as [string, number][]).map(([label, off]) => {
          // 현재 선택값이 이 빠른선택 옵션과 같은 날짜인지 — 시각적 강조용
          const target = new Date(today);
          target.setDate(target.getDate() + off);
          const active = selectedDate ? isSameDay(target, selectedDate) : false;
          return (
            <button
              key={label}
              type="button"
              onClick={() => quickPick(off)}
              style={{
                padding: '6px 12px', borderRadius: 999,
                border: '1px solid',
                background: active ? '#5B50E8' : '#fff',
                borderColor: active ? '#5B50E8' : '#e4e7ec',
                color: active ? '#fff' : '#475569',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.background = '#eef0fb';
                e.currentTarget.style.borderColor = '#c7c2f3';
                e.currentTarget.style.color = '#5B50E8';
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e4e7ec';
                e.currentTarget.style.color = '#475569';
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr' }}>
        {/* ── 좌: 달력 ── */}
        <div style={{ padding: '14px 16px', borderRight: '1px solid #f1f3f6' }}>
          {/* 헤더 — 월 이동 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <button
              type="button"
              onClick={prevMonth}
              aria-label="이전 달"
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: '#f6f7fc', border: 'none',
                color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eef0fb';
                e.currentTarget.style.color = '#5B50E8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f6f7fc';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              {viewYear}년 {viewMonth + 1}월
            </p>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="다음 달"
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: '#f6f7fc', border: 'none',
                color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eef0fb';
                e.currentTarget.style.color = '#5B50E8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f6f7fc';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 요일 헤더 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            marginBottom: 6,
          }}>
            {dayLabels.map((d, i) => (
              <div
                key={d}
                style={{
                  fontSize: 11, fontWeight: 700,
                  textAlign: 'center', padding: '4px 0',
                  color: i === 0 ? '#ef4444' : i === 6 ? '#5B50E8' : '#94a3b8',
                  letterSpacing: '0.02em',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth;
              const isToday = isSameDay(d, today);
              const isSelected = selectedDate ? isSameDay(d, selectedDate) : false;
              const dow = d.getDay();
              const baseColor =
                !inMonth ? '#cbd5e1'
                  : dow === 0 ? '#ef4444'
                    : dow === 6 ? '#5B50E8'
                      : '#0f172a';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDate(d)}
                  style={{
                    position: 'relative',
                    height: 36, borderRadius: 10,
                    background: isSelected
                      ? 'linear-gradient(135deg, #6d63f0 0%, #5B50E8 100%)'
                      : 'transparent',
                    color: isSelected ? '#fff' : baseColor,
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : isToday ? 700 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    boxShadow: isSelected ? '0 4px 10px rgba(91,80,232,0.25)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {d.getDate()}
                  {/* 오늘 표시 점 — 선택되지 않았을 때만 */}
                  {isToday && !isSelected && (
                    <span style={{
                      position: 'absolute',
                      bottom: 4, left: '50%', transform: 'translateX(-50%)',
                      width: 4, height: 4, borderRadius: 2,
                      background: '#5B50E8',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 우: 시간 선택 ── */}
        <div style={{ padding: '14px 16px' }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: '#94a3b8',
            marginBottom: 10, letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            시간
          </p>

          {/* 큰 시간 디스플레이 */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
            padding: '10px 0',
            background: 'linear-gradient(135deg, #f6f7fc 0%, #eef0fb 100%)',
            borderRadius: 10,
            marginBottom: 12,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#5B50E8',
              alignSelf: 'center', marginRight: 4,
            }}>
              {isPM ? '오후' : '오전'}
            </span>
            <span style={{
              fontSize: 26, fontWeight: 800, color: '#0f172a',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>
              {String(hour12).padStart(2, '0')}
            </span>
            <span style={{
              fontSize: 22, fontWeight: 800, color: '#cbd5e1',
            }}>
              :
            </span>
            <span style={{
              fontSize: 26, fontWeight: 800, color: '#0f172a',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>
              {String(minute).padStart(2, '0')}
            </span>
          </div>

          {/* 오전/오후 */}
          <div style={{
            display: 'flex', padding: 3,
            background: '#f1f3f6', borderRadius: 8,
            marginBottom: 12,
          }}>
            {([['오전', false], ['오후', true]] as [string, boolean][]).map(([label, pm]) => {
              const active = isPM === pm;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const newH = pm
                      ? (hour12 === 12 ? 12 : hour12 + 12)
                      : (hour12 === 12 ? 0 : hour12);
                    pickTime(newH, minute);
                  }}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6,
                    border: 'none',
                    fontSize: 12, fontWeight: 700,
                    background: active ? '#fff' : 'transparent',
                    color: active ? '#5B50E8' : '#94a3b8',
                    cursor: 'pointer', transition: 'all 0.12s',
                    boxShadow: active ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 시 + 분 — 네이티브 select 로 단순화 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* 시 */}
            <div>
              <p style={{
                fontSize: 10.5, fontWeight: 600, color: '#94a3b8',
                marginBottom: 5, textAlign: 'center',
              }}>
                시
              </p>
              <select
                value={hour12}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  const newH = isPM
                    ? (h === 12 ? 12 : h + 12)
                    : (h === 12 ? 0 : h);
                  pickTime(newH, minute);
                }}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #e4e7ec', borderRadius: 10,
                  background: '#fff',
                  fontSize: 14, fontWeight: 700, color: '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'pointer', textAlign: 'center',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  paddingRight: 26,
                }}
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                ))}
              </select>
            </div>

            {/* 분 — 30분 단위 토글 */}
            <div>
              <p style={{
                fontSize: 10.5, fontWeight: 600, color: '#94a3b8',
                marginBottom: 5, textAlign: 'center',
              }}>
                분
              </p>
              <div style={{
                display: 'flex', padding: 3,
                background: '#f1f3f6', borderRadius: 10,
              }}>
                {minuteOptions.map((m) => {
                  const active = minute === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickTime(hour, m)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: 7,
                        border: 'none',
                        fontSize: 13, fontWeight: 700,
                        background: active ? '#fff' : 'transparent',
                        color: active ? '#5B50E8' : '#94a3b8',
                        cursor: 'pointer', transition: 'all 0.12s',
                        boxShadow: active ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 선택값 표시 ── */}
      {selectedDate && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #f1f3f6',
          background: 'linear-gradient(135deg, #5B50E8 0%, #6d63f0 100%)',
          fontSize: 13, fontWeight: 700, color: '#fff',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일{' '}
          {isPM ? '오후' : '오전'} {hour12}:{String(minute).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}
