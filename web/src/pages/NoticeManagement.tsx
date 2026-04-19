import { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';
import type { Notice } from '../../../types/index';

// ── 날짜 포맷 ────────────────────────────────────────────────
function fmt(ts: Notice['created_at'], short = false) {
  if (!ts) return '';
  const d = ts.toDate();
  if (short) return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

type ListTab = 'all' | 'important';

export default function NoticeManagement() {
  const { user } = useAuthStore();

  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [audienceUids, setAudienceUids] = useState<Set<string>>(new Set());

  const [listTab, setListTab] = useState<ListTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Notice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── 활성 학생+학부모 uid Set
  useEffect(() => {
    if (!user?.academy_id) return;
    (async () => {
      const [s, p] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('academy_id', '==', user.academy_id), where('role', '==', 'student'), where('is_active', '==', true))),
        getDocs(query(collection(db, 'users'), where('academy_id', '==', user.academy_id), where('role', '==', 'parent'), where('is_active', '==', true))),
      ]);
      const uids = new Set<string>();
      [...s.docs, ...p.docs].filter((d) => !d.data().deleted_at).forEach((d) => uids.add(d.id));
      setAudienceUids(uids);
    })();
  }, [user?.academy_id]);

  // ── 공지 실시간 구독
  useEffect(() => {
    if (!user?.academy_id) return;
    const q = query(collection(db, 'notices'), where('academy_id', '==', user.academy_id), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));
      setNotices(list);
      setIsLoading(false);
      // 첫 로드 시 첫 항목 자동 선택
      if (selectedId === null && list.length > 0) setSelectedId(list[0].id);
    });
    return () => unsub();
  }, [user?.academy_id]);

  // ── 삭제
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'notices', deleteTarget.id));
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch { alert(strings.common.error); }
    finally { setIsDeleting(false); }
  };

  const filteredNotices = listTab === 'important'
    ? notices.filter((n) => n.is_important)
    : notices;

  const selected = notices.find((n) => n.id === selectedId) ?? null;

  const readCount = (n: Notice) =>
    (n.read_by ?? []).filter((uid) => audienceUids.has(uid)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
            {strings.notices.title}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            학생·학부모 대상 공지를 발행하고 읽음 현황을 확인합니다
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditTarget(null); setShowForm(true); }}>
          <IconPlus /> 새 공지 작성
        </button>
      </div>

      {/* ── 360px + 1fr 패널 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 600, alignItems: 'start' }}>

        {/* ── 왼쪽: 공지 리스트 ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* 탭 */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #e4e7ec',
            display: 'flex', gap: 4,
          }}>
            {([['all', '전체'], ['important', '중요']] as [ListTab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setListTab(id)}
                style={{
                  padding: '5px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 6,
                  border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                  background: listTab === id ? '#eef2ff' : 'transparent',
                  color: listTab === id ? '#3b5bdb' : '#475569',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 리스트 */}
          <div style={{ maxHeight: 680, overflowY: 'auto' }}>
            {isLoading ? (
              <SkeletonList />
            ) : filteredNotices.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: '#94a3b8' }}>
                {strings.notices.noNotices}
              </p>
            ) : (
              filteredNotices.map((n) => {
                const rc = readCount(n);
                const total = audienceUids.size;
                const pct = total > 0 ? Math.round((rc / total) * 100) : 0;
                const isSelected = selectedId === n.id;

                return (
                  <div
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    style={{
                      padding: '14px 18px', borderBottom: '1px solid #e4e7ec', cursor: 'pointer',
                      background: isSelected ? '#eef2ff' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? '#3b5bdb' : 'transparent'}`,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f6f7f9'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <p style={{
                        fontWeight: 600, fontSize: 13.5, lineHeight: 1.4, color: '#0f172a',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        flex: 1,
                      }}>
                        {n.title}
                      </p>
                      <span style={{ fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {fmt(n.created_at, true)}
                      </span>
                    </div>

                    {n.content && (
                      <p style={{
                        fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {n.content}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      {n.is_important && (
                        <span className="badge-danger" style={{ fontSize: 10.5 }}>중요</span>
                      )}
                      <span className="badge-neutral" style={{ fontSize: 10.5 }}>
                        {(n.target_class_ids?.length ?? 0) === 0 ? '전체' : `${n.target_class_ids!.length}개 반`}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>
                        읽음 {pct}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── 오른쪽: 공지 상세 ── */}
        {selected ? (
          <NoticeDetail
            notice={selected}
            audienceUids={audienceUids}
            onEdit={() => { setEditTarget(selected); setShowForm(true); }}
            onDelete={() => setDeleteTarget(selected)}
          />
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              {isLoading ? strings.common.loading : '왼쪽에서 공지를 선택해주세요'}
            </p>
          </div>
        )}
      </div>

      {/* ── 공지 작성/수정 모달 ── */}
      {showForm && (
        <NoticeFormModal
          notice={editTarget}
          academyId={user?.academy_id ?? ''}
          createdBy={user?.uid ?? ''}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <ConfirmModal
          message={strings.notices.deleteConfirm}
          confirmLabel={strings.common.delete}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </div>
  );
}

// ── 공지 상세 패널 ────────────────────────────────────────────
function NoticeDetail({
  notice, audienceUids, onEdit, onDelete,
}: {
  notice: Notice;
  audienceUids: Set<string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const readCnt = (notice.read_by ?? []).filter((uid) => audienceUids.has(uid)).length;
  const total = audienceUids.size;
  const unreadCnt = total - readCnt;
  const pct = total > 0 ? Math.round((readCnt / total) * 100) : 0;

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 상단 — 뱃지 + 제목 + 메타 */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #e4e7ec' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {notice.is_important && <span className="badge-danger">중요</span>}
          <span className="badge-accent">
            {(notice.target_class_ids?.length ?? 0) === 0 ? '전체' : `${notice.target_class_ids!.length}개 반`}
          </span>
          {(notice.target_roles ?? []).map((r) => (
            <span key={r} className="badge-neutral">
              {r === 'student' ? '학생' : r === 'parent' ? '학부모' : r}
            </span>
          ))}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          {notice.title}
        </h2>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12.5, color: '#94a3b8' }}>
          <span>{fmt(notice.created_at)} 발행</span>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: '24px 28px', fontSize: 14, lineHeight: 1.8, color: '#0f172a', flex: 1 }}>
        {notice.content
          ? notice.content.split('\n').map((line, i) => (
              <p key={i} style={{ marginBottom: 6 }}>{line || <br />}</p>
            ))
          : <p style={{ color: '#94a3b8' }}>내용이 없습니다.</p>
        }
      </div>

      {/* 읽음 현황 */}
      <div style={{ padding: '0 28px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>읽음 현황</p>
          <p style={{ fontSize: 13, color: '#475569' }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{readCnt}</strong>
            <span style={{ color: '#94a3b8' }}> / {total}명 ({pct}%)</span>
          </p>
        </div>
        <div style={{ height: 8, background: '#f1f3f6', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#0ea371', transition: 'width 0.4s', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
          {[
            { label: '읽음', value: readCnt, color: '#065f46', bg: '#e6f7ef' },
            { label: '미확인', value: unreadCnt, color: '#475569', bg: '#f1f3f6' },
            { label: '푸시 발송', value: total, color: '#3b5bdb', bg: '#eef2ff' },
          ].map((s) => (
            <div key={s.label} style={{ padding: '12px 14px', background: s.bg, borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: s.color, fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: 19, fontWeight: 700, marginTop: 2, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}명
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 액션 */}
      <div style={{
        padding: '14px 28px', borderTop: '1px solid #e4e7ec',
        display: 'flex', gap: 8, background: '#f6f7f9',
        borderRadius: '0 0 8px 8px',
      }}>
        <button className="btn-secondary btn-sm" onClick={onEdit}>
          <IconEdit /> 수정
        </button>
        <button className="btn-secondary btn-sm">
          <IconUsers /> 미확인자 재알림
        </button>
        <button className="btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={onDelete}>
          <IconTrash /> 삭제
        </button>
      </div>
    </div>
  );
}

// ── 공지 작성/수정 모달 ───────────────────────────────────────
function NoticeFormModal({
  notice, academyId, createdBy, onClose,
}: {
  notice: Notice | null; academyId: string; createdBy: string; onClose: () => void;
}) {
  const [title, setTitle] = useState(notice?.title ?? '');
  const [content, setContent] = useState(notice?.content ?? '');
  const [isImportant, setIsImportant] = useState(notice?.is_important ?? false);
  const [isSaving, setIsSaving] = useState(false);

  type TargetRole = 'all' | 'student' | 'parent';
  const initRole = (): TargetRole => {
    if (!notice?.target_roles?.length) return 'all';
    if (notice.target_roles.includes('student') && notice.target_roles.includes('parent')) return 'all';
    return notice.target_roles.includes('student') ? 'student' : 'parent';
  };
  const [targetRole, setTargetRole] = useState<TargetRole>(initRole);
  const [targetAll, setTargetAll] = useState(!notice?.target_class_ids?.length);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(notice?.target_class_ids ?? []);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!academyId) return;
    getDocs(query(collection(db, 'classes'), where('academy_id', '==', academyId)))
      .then((snap) => setClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))));
  }, [academyId]);

  const canSave = title.trim().length > 0 && (targetAll || selectedClassIds.length > 0);

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    const resolvedRoles = targetRole === 'student' ? ['student'] : targetRole === 'parent' ? ['parent'] : [];
    try {
      if (notice) {
        await updateDoc(doc(db, 'notices', notice.id), {
          title: title.trim(), content: content.trim(), is_important: isImportant,
          target_class_ids: targetAll ? [] : selectedClassIds, target_roles: resolvedRoles,
        });
      } else {
        await addDoc(collection(db, 'notices'), {
          title: title.trim(), content: content.trim(), is_important: isImportant,
          academy_id: academyId, created_by: createdBy, read_by: [],
          target_class_ids: targetAll ? [] : selectedClassIds, target_roles: resolvedRoles,
          created_at: serverTimestamp(),
        });
      }
      onClose();
    } catch { alert(strings.common.error); }
    finally { setIsSaving(false); }
  };

  const toggleClassId = (id: string) =>
    setSelectedClassIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: 580 }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: '1px solid #e4e7ec',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            {notice ? '공지 수정' : '새 공지 작성'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 중요 공지 토글 */}
          <button
            type="button"
            onClick={() => setIsImportant((p) => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 8, border: '1px solid',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
              background: isImportant ? '#fee4e4' : '#f6f7f9',
              borderColor: isImportant ? '#fca5a5' : '#e4e7ec',
              color: isImportant ? '#991b1b' : '#475569',
            }}
          >
            <svg width="15" height="15" fill={isImportant ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {strings.notices.important}
            {isImportant && <span style={{ marginLeft: 'auto', fontSize: 11 }}>켜짐</span>}
          </button>

          {/* 수신 대상 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>수신 대상</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['all', '전체 (학생+학부모)'], ['student', '학생만'], ['parent', '학부모만']] as [TargetRole, string][]).map(([opt, label]) => (
                <button
                  key={opt} type="button" onClick={() => setTargetRole(opt)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
                    background: targetRole === opt ? '#3b5bdb' : '#f6f7f9',
                    borderColor: targetRole === opt ? '#3b5bdb' : '#e4e7ec',
                    color: targetRole === opt ? '#fff' : '#475569',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 대상 반 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>공지 대상 반</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[['전체 반', true], ['반 선택', false]].map(([label, val]) => (
                <button
                  key={String(label)} type="button" onClick={() => setTargetAll(val as boolean)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
                    background: targetAll === val ? '#3b5bdb' : '#f6f7f9',
                    borderColor: targetAll === val ? '#3b5bdb' : '#e4e7ec',
                    color: targetAll === val ? '#fff' : '#475569',
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
            {!targetAll && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {classes.length === 0
                  ? <p style={{ fontSize: 12, color: '#94a3b8' }}>등록된 반이 없어요</p>
                  : classes.map((cls) => {
                      const checked = selectedClassIds.includes(cls.id);
                      return (
                        <button
                          key={cls.id} type="button" onClick={() => toggleClassId(cls.id)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                            border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
                            background: checked ? '#eef2ff' : '#f6f7f9',
                            borderColor: checked ? '#3b5bdb' : '#e4e7ec',
                            color: checked ? '#3b5bdb' : '#475569',
                          }}
                        >
                          {checked ? '✓ ' : ''}{cls.name}
                        </button>
                      );
                    })}
              </div>
            )}
            {!targetAll && selectedClassIds.length === 0 && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>반을 하나 이상 선택해주세요</p>
            )}
          </div>

          {/* 제목 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              {strings.notices.noticeTitle} *
            </label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목을 입력해주세요"
              maxLength={100}
            />
          </div>

          {/* 본문 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
              {strings.notices.noticeContent}
            </label>
            <textarea
              className="input-field"
              rows={5}
              style={{ resize: 'none' }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력해주세요"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSaving}>취소</button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? '저장 중...' : notice ? strings.common.save : '발행하기'}
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
      <div className="modal-box" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ padding: '22px 22px 0' }}>
          <p style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.6 }}>{message}</p>
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
function SkeletonList() {
  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse" style={{ height: 72, background: '#f1f3f6', borderRadius: 8 }} />
      ))}
    </div>
  );
}

// ── 아이콘 ────────────────────────────────────────────────────
function IconPlus() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
