/**
 * web/src/pages/VideoManagement.tsx
 *
 * 학습 영상 관리 페이지 (admin 전용 + 유료 플랜 게이트).
 * - YouTube URL → videoId 자동 파싱 + 썸네일 미리보기
 * - 반별 필터 + 카드 그리드
 * - 등록/수정 모달, 삭제 확인 모달
 * - plan === 'free' 시 잠금 화면 노출 (보안 규칙과 일관)
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { strings } from '../constants/strings';
import {
  useClassesForVideo,
  useVideos,
  useUpsertVideo,
  useDeleteVideo,
} from '../hooks/useVideos';
import { parseYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeWatchUrl } from '../../../lib/youtube';
import type { Video } from '../../../types/index';

// ── 유료 플랜 여부 (보안 규칙 isPaidPlan과 일치) ────────────────
function isPaidPlan(plan?: string | null): boolean {
  return plan === 'starter' || plan === 'standard' || plan === 'pro' || plan === 'trial';
}

export default function VideoManagement() {
  const navigate = useNavigate();
  const { academy } = useAuthStore();
  const paid = isPaidPlan(academy?.plan);

  // 반 목록 — 필터·등록 폼에서 사용
  const { classes, isLoading: classesLoading } = useClassesForVideo();
  const classIdList = useMemo(() => classes.map((c) => c.id), [classes]);
  const classNameMap = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [classes]);

  // 영상 실시간 구독
  const { videos, isLoading, error } = useVideos(classIdList);

  // 필터 — 'all' | classId
  const [classFilter, setClassFilter] = useState<string>('all');
  const filteredVideos = useMemo(
    () => (classFilter === 'all' ? videos : videos.filter((v) => v.class_id === classFilter)),
    [videos, classFilter],
  );

  // 등록·수정 모달
  const [editTarget, setEditTarget] = useState<Video | 'new' | null>(null);
  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);

  const upsert = useUpsertVideo();
  const remove = useDeleteVideo();

  // ── 잠금 화면 (무료 플랜) ─────────────────────────────────────
  if (academy && !paid) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader />
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>🎬</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
            {strings.videos.lockedTitle}
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.55 }}>
            {strings.videos.lockedDesc}
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => navigate('/subscription')}
          >
            {strings.videos.lockedUpgrade}
          </button>
        </div>
      </div>
    );
  }

  // ── 메인 화면 ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        actionLabel={classes.length > 0 ? strings.videos.addVideo : null}
        onAction={() => setEditTarget('new')}
      />

      {/* ── 반 필터 ── */}
      {classes.length > 0 && (
        <div className="card" style={{ padding: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterChip
            active={classFilter === 'all'}
            onClick={() => setClassFilter('all')}
            label={strings.videos.filterAll}
          />
          {classes.map((c) => (
            <FilterChip
              key={c.id}
              active={classFilter === c.id}
              onClick={() => setClassFilter(c.id)}
              label={c.name}
            />
          ))}
        </div>
      )}

      {/* ── 본문 ── */}
      {classesLoading || isLoading ? (
        <EmptyBlock>불러오는 중...</EmptyBlock>
      ) : error ? (
        <EmptyBlock>영상을 불러오지 못했어요.</EmptyBlock>
      ) : classes.length === 0 ? (
        <EmptyBlock icon="📚" title={strings.videos.noClasses} />
      ) : filteredVideos.length === 0 ? (
        <EmptyBlock
          icon="🎬"
          title={strings.videos.noVideos}
          desc={strings.videos.noVideosDesc}
          actionLabel={strings.videos.addVideo}
          onAction={() => setEditTarget('new')}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {filteredVideos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              className={classNameMap.get(v.class_id) ?? '알 수 없는 반'}
              onEdit={() => setEditTarget(v)}
              onDelete={() => setDeleteTarget(v)}
            />
          ))}
        </div>
      )}

      {/* ── 등록·수정 모달 ── */}
      {editTarget && (
        <VideoFormModal
          target={editTarget}
          classes={classes}
          isSaving={upsert.isPending}
          onClose={() => setEditTarget(null)}
          onSubmit={async (input) => {
            try {
              await upsert.mutateAsync(input);
              setEditTarget(null);
            } catch (e) {
              console.error('[VideoManagement] 저장 실패:', e);
              alert(strings.videos.saveError);
            }
          }}
        />
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <ConfirmModal
          title={strings.videos.deleteVideo}
          desc={`"${deleteTarget.title}"\n\n${strings.videos.deleteConfirm}`}
          confirmLabel={strings.common.delete}
          danger
          isPending={remove.isPending}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(deleteTarget.id);
              setDeleteTarget(null);
            } catch (e) {
              console.error('[VideoManagement] 삭제 실패:', e);
              alert(strings.videos.deleteError);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── 페이지 헤더 ────────────────────────────────────────────────
function PageHeader({
  actionLabel,
  onAction,
}: {
  actionLabel?: string | null;
  onAction?: () => void;
} = {}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
          {strings.videos.title}
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
          {strings.videos.subtitle}
        </p>
      </div>
      {actionLabel && onAction && (
        <button className="btn-primary" onClick={onAction}>
          + {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── 필터 칩 ────────────────────────────────────────────────────
function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: active ? '#0F172A' : '#E2E8F0',
        background: active ? '#0F172A' : '#fff',
        color: active ? '#fff' : '#334155',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}

// ── 빈 상태 / 로딩 박스 ────────────────────────────────────────
function EmptyBlock({
  children,
  icon,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  children?: React.ReactNode;
  icon?: string;
  title?: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>}
      {title && <p style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>{title}</p>}
      {desc && <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{desc}</p>}
      {children && <p style={{ fontSize: 13, color: '#94a3b8' }}>{children}</p>}
      {actionLabel && onAction && (
        <button className="btn-primary" style={{ marginTop: 16 }} onClick={onAction}>
          + {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── 영상 카드 ──────────────────────────────────────────────────
function VideoCard({
  video,
  className,
  onEdit,
  onDelete,
}: {
  video: Video;
  className: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 썸네일 — 클릭 시 YouTube로 이동 */}
      <a
        href={getYouTubeWatchUrl(video.video_id)}
        target="_blank"
        rel="noopener noreferrer"
        title={strings.videos.openOnYoutube}
        style={{
          position: 'relative',
          display: 'block',
          aspectRatio: '16 / 9',
          background: '#0F172A',
          overflow: 'hidden',
        }}
      >
        <img
          src={getYouTubeThumbnailUrl(video.video_id, 'hq')}
          alt={video.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.35) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 24,
            background: 'rgba(255,255,255,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#EF4444', fontSize: 18,
          }}>
            ▶
          </div>
        </div>
      </a>

      {/* 본문 */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <p
          style={{
            fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            flex: 1,
          }}
          title={video.title}
        >
          {video.title}
        </p>
        <span style={{
          alignSelf: 'flex-start',
          fontSize: 11, fontWeight: 600,
          padding: '3px 8px', borderRadius: 6,
          background: '#F1F5F9', color: '#334155',
        }}>
          {className}
        </span>

        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            onClick={onEdit}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: '#EEEDF9', color: '#5B50E8',
              fontSize: 12, fontWeight: 700,
            }}
          >
            {strings.common.edit}
          </button>
          <button
            onClick={onDelete}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: '#FEF2F2', color: '#EF4444',
              fontSize: 12, fontWeight: 700,
            }}
          >
            {strings.common.delete}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 영상 등록·수정 모달 ────────────────────────────────────────
function VideoFormModal({
  target,
  classes,
  isSaving,
  onClose,
  onSubmit,
}: {
  target: Video | 'new';
  classes: { id: string; name: string }[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    id?: string;
    title: string;
    youtube_url: string;
    video_id: string;
    class_id: string;
  }) => void | Promise<void>;
}) {
  const isEdit = target !== 'new';

  const [title, setTitle] = useState(isEdit ? target.title : '');
  const [url, setUrl] = useState(isEdit ? target.youtube_url : '');
  const [classId, setClassId] = useState<string>(
    isEdit ? target.class_id : (classes[0]?.id ?? '')
  );

  const parsedId = parseYouTubeVideoId(url.trim());
  const canSubmit = !!title.trim() && !!parsedId && !!classId && !isSaving;

  const handleSubmit = () => {
    if (!canSubmit || !parsedId) return;
    onSubmit({
      id: isEdit ? target.id : undefined,
      title,
      youtube_url: url.trim(),
      video_id: parsedId,
      class_id: classId,
    });
  };

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
        {isEdit ? strings.videos.editVideo : strings.videos.addVideo}
      </h2>

      {/* URL */}
      <FieldLabel>{strings.videos.youtubeUrl} <Required /></FieldLabel>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={strings.videos.youtubeUrlPlaceholder}
        autoComplete="off"
        style={{
          ...inputStyle,
          borderColor: url.trim() && !parsedId ? '#EF4444' : '#E2E8F0',
          background: url.trim() && !parsedId ? '#FEF2F2' : '#F1F0FB',
        }}
      />
      {url.trim() && (
        <p style={{
          fontSize: 12, fontWeight: 600,
          color: parsedId ? '#10B981' : '#EF4444',
        }}>
          {parsedId ? strings.videos.urlValid : strings.videos.urlInvalid}
        </p>
      )}

      {/* 썸네일 미리보기 */}
      {parsedId && (
        <div style={{
          width: '100%', aspectRatio: '16 / 9',
          borderRadius: 10, overflow: 'hidden', background: '#0F172A',
          position: 'relative',
        }}>
          <img
            src={getYouTubeThumbnailUrl(parsedId, 'hq')}
            alt="썸네일"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* 제목 */}
      <FieldLabel>{strings.videos.videoTitle} <Required /></FieldLabel>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={strings.videos.videoTitlePlaceholder}
        style={inputStyle}
      />

      {/* 반 선택 */}
      <FieldLabel>{strings.videos.targetClass} <Required /></FieldLabel>
      <select
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        style={{ ...inputStyle, appearance: 'none' }}
      >
        {classes.length === 0 && <option value="">{strings.videos.noClasses}</option>}
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* 저장 */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary"
        style={{
          marginTop: 6,
          opacity: canSubmit ? 1 : 0.45,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {isSaving ? '저장 중...' : strings.common.save}
      </button>
    </ModalShell>
  );
}

// ── 삭제 확인 모달 ─────────────────────────────────────────────
function ConfirmModal({
  title, desc, confirmLabel, danger, isPending,
  onConfirm, onCancel,
}: {
  title: string;
  desc: string;
  confirmLabel: string;
  danger?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} maxWidth={400}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{title}</h2>
      <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{desc}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, height: 44, borderRadius: 10,
            border: '1px solid #E2E8F0', background: '#fff',
            color: '#475569', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {strings.common.cancel}
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          style={{
            flex: 1, height: 44, borderRadius: 10,
            border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            background: danger ? '#EF4444' : '#5B50E8',
            color: '#fff', fontSize: 14, fontWeight: 700,
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '처리 중...' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// ── 모달 셸 (오버레이 + 시트) ─────────────────────────────────
function ModalShell({
  onClose, children, maxWidth = 480,
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth,
          background: '#fff', borderRadius: 16,
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 10,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── 폼 라벨/필수 표시/입력 스타일 ──────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginTop: 4 }}>
      {children}
    </label>
  );
}
function Required() {
  return <span style={{ color: '#EF4444' }}> *</span>;
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#F1F0FB',
  border: '1.5px solid #E2E8F0',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: '#0F172A',
  outline: 'none',
  boxSizing: 'border-box',
};
