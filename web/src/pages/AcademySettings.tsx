/**
 * web/src/pages/AcademySettings.tsx — 학원 설정 페이지 (admin 전용)
 *
 * 편집 가능 필드 (Firestore Rules 화이트리스트):
 *   name · academy_type · owner_name · owner_phone · address
 *
 * 제약:
 *   - status === 'active' 일 때만 update 허용 (Rules에서 차단)
 *   - 학원코드·플랜·승인 상태는 읽기 전용
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useAcademyRealtime, useUpdateAcademy } from '../hooks/useAcademy';
import { strings } from '../constants/strings';
import type { AcademyType } from '../../../types/index';

// ── 유틸: Firestore Timestamp → 한국어 날짜 ──
function formatDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '-';
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const ACADEMY_TYPES: AcademyType[] = ['학원', '교습소', '개인과외'];

export default function AcademySettings() {
  // 학원 정보 실시간 동기화
  useAcademyRealtime();

  const { academy } = useAuthStore();
  const updateAcademy = useUpdateAcademy();

  // 학원 정보 편집 폼
  const [editAcademy, setEditAcademy] = useState(false);
  const [formAcademy, setFormAcademy] = useState({
    name: '',
    academy_type: '학원' as AcademyType,
    address: '',
  });

  // 원장 정보 편집 폼
  const [editOwner, setEditOwner] = useState(false);
  const [formOwner, setFormOwner] = useState({
    owner_name: '',
    owner_phone: '',
  });

  // 학원 데이터 로드 시 폼 초기화
  useEffect(() => {
    if (!academy) return;
    setFormAcademy({
      name: academy.name ?? '',
      academy_type: academy.academy_type ?? '학원',
      address: academy.address ?? '',
    });
    setFormOwner({
      owner_name: academy.owner_name ?? '',
      owner_phone: academy.owner_phone ?? '',
    });
  }, [academy]);

  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // 토스트 자동 닫기
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  if (!academy) {
    return (
      <div style={{ padding: 32, color: '#64748B', fontSize: 14 }}>
        {strings.common.loading}
      </div>
    );
  }

  const isActive = academy.status === 'active';
  const isPending = academy.status === 'pending';
  const isRejected = academy.status === 'rejected';

  // ── 학원 정보 저장
  const handleSaveAcademy = async () => {
    try {
      await updateAcademy.mutateAsync({
        name: formAcademy.name,
        academy_type: formAcademy.academy_type,
        address: formAcademy.address,
      });
      setEditAcademy(false);
      setToast({ kind: 'success', text: strings.settings.saveSuccess });
    } catch (e) {
      setToast({
        kind: 'error',
        text: e instanceof Error ? e.message : strings.settings.saveError,
      });
    }
  };

  const handleCancelAcademy = () => {
    setFormAcademy({
      name: academy.name ?? '',
      academy_type: academy.academy_type ?? '학원',
      address: academy.address ?? '',
    });
    setEditAcademy(false);
  };

  // ── 원장 정보 저장
  const handleSaveOwner = async () => {
    try {
      await updateAcademy.mutateAsync({
        owner_name: formOwner.owner_name,
        owner_phone: formOwner.owner_phone,
      });
      setEditOwner(false);
      setToast({ kind: 'success', text: strings.settings.saveSuccess });
    } catch (e) {
      setToast({
        kind: 'error',
        text: e instanceof Error ? e.message : strings.settings.saveError,
      });
    }
  };

  const handleCancelOwner = () => {
    setFormOwner({
      owner_name: academy.owner_name ?? '',
      owner_phone: academy.owner_phone ?? '',
    });
    setEditOwner(false);
  };

  // ── 학원코드 복사
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(academy.academy_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setToast({ kind: 'error', text: '복사에 실패했어요' });
    }
  };

  return (
    <div style={{ maxWidth: 880, padding: '20px 24px 60px', margin: '0 auto' }}>
      {/* ── 페이지 헤더 ── */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
          {strings.settings.title}
        </h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          학원 기본 정보를 관리해요. 변경된 내용은 즉시 앱에 반영돼요.
        </p>
      </div>

      {/* ── 승인 상태 배너 ── */}
      {isPending && (
        <StatusBanner
          tone="warning"
          icon="⏳"
          title={strings.settings.statusPending}
          desc={strings.settings.statusPendingDesc}
        />
      )}
      {isRejected && (
        <StatusBanner
          tone="danger"
          icon="⚠️"
          title={strings.settings.statusRejected}
          desc={academy.reject_reason ?? '관리자에게 문의해 주세요.'}
        />
      )}

      {/* ── 학원 정보 카드 ── */}
      <SectionCard
        title={strings.settings.academyInfo}
        editing={editAcademy}
        canEdit={isActive}
        onEdit={() => setEditAcademy(true)}
        onCancel={handleCancelAcademy}
        onSave={handleSaveAcademy}
        saving={updateAcademy.isPending}
        disabledHint={!isActive ? strings.settings.pendingEditDisabled : undefined}
      >
        <Field label={strings.settings.academyName}>
          {editAcademy ? (
            <Input
              value={formAcademy.name}
              onChange={(v) => setFormAcademy({ ...formAcademy, name: v })}
              placeholder={strings.settings.placeholderName}
            />
          ) : (
            <ReadValue value={academy.name} />
          )}
        </Field>

        <Field label={strings.settings.academyType}>
          {editAcademy ? (
            <SegmentControl
              options={ACADEMY_TYPES}
              value={formAcademy.academy_type}
              onChange={(v) => setFormAcademy({ ...formAcademy, academy_type: v })}
            />
          ) : (
            <ReadValue value={academy.academy_type} />
          )}
        </Field>

        <Field label={strings.settings.address}>
          {editAcademy ? (
            <Input
              value={formAcademy.address}
              onChange={(v) => setFormAcademy({ ...formAcademy, address: v })}
              placeholder={strings.settings.placeholderAddress}
            />
          ) : (
            <ReadValue value={academy.address} />
          )}
        </Field>
      </SectionCard>

      {/* ── 원장 정보 카드 ── */}
      <SectionCard
        title={strings.settings.ownerInfo}
        editing={editOwner}
        canEdit={isActive}
        onEdit={() => setEditOwner(true)}
        onCancel={handleCancelOwner}
        onSave={handleSaveOwner}
        saving={updateAcademy.isPending}
        disabledHint={!isActive ? strings.settings.pendingEditDisabled : undefined}
      >
        <Field label={strings.settings.ownerName}>
          {editOwner ? (
            <Input
              value={formOwner.owner_name}
              onChange={(v) => setFormOwner({ ...formOwner, owner_name: v })}
              placeholder={strings.settings.placeholderOwnerName}
            />
          ) : (
            <ReadValue value={academy.owner_name} />
          )}
        </Field>

        <Field label={strings.settings.ownerPhone}>
          {editOwner ? (
            <Input
              value={formOwner.owner_phone}
              onChange={(v) => setFormOwner({ ...formOwner, owner_phone: v })}
              placeholder={strings.settings.placeholderPhone}
              type="tel"
            />
          ) : (
            <ReadValue value={academy.owner_phone} />
          )}
        </Field>
      </SectionCard>

      {/* ── 학원코드 카드 (읽기 전용) ── */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardTitleStyle}>{strings.settings.academyCode}</h2>
        </div>
        <div style={{ padding: '18px 22px 22px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: '#5B50E8',
                letterSpacing: '4px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                flex: 1,
              }}
            >
              {academy.academy_code}
            </div>
            <button
              onClick={handleCopyCode}
              style={{
                padding: '8px 14px',
                background: copied ? '#ECFDF5' : '#5B50E8',
                color: copied ? '#065F46' : '#fff',
                border: copied ? '1px solid #A7F3D0' : 'none',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? '복사됨' : strings.common.copy}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 10, lineHeight: 1.5 }}>
            {strings.settings.academyCodeHelp}
          </p>
        </div>
      </div>

      {/* ── 계정 정보 ── */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h2 style={cardTitleStyle}>{strings.settings.accountMeta}</h2>
        </div>
        <div style={{ padding: '6px 22px 18px' }}>
          <MetaRow
            label={strings.settings.submittedAt}
            value={formatDate(academy.submitted_at)}
          />
          <MetaRow
            label={strings.settings.approvedAt}
            value={isActive ? formatDate(academy.approved_at) : '-'}
          />
          <MetaRow
            label="현재 플랜"
            value={
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  background: '#EEEDF9',
                  color: '#3730A3',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                }}
              >
                {planLabel(academy.plan)}
              </span>
            }
          />
        </div>
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.kind === 'success' ? '#0F172A' : '#991B1B',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            zIndex: 50,
          }}
        >
          {toast.kind === 'success' ? '✓ ' : '⚠ '}
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ─── 컴포넌트들 ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  marginBottom: 16,
  overflow: 'hidden',
};

const cardHeaderStyle: React.CSSProperties = {
  padding: '16px 22px 12px',
  borderBottom: '1px solid #F1F5F9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0F172A',
  letterSpacing: '-0.01em',
};

interface SectionCardProps {
  title: string;
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  disabledHint?: string;
  children: React.ReactNode;
}

function SectionCard({
  title,
  editing,
  canEdit,
  onEdit,
  onCancel,
  onSave,
  saving,
  disabledHint,
  children,
}: SectionCardProps) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h2 style={cardTitleStyle}>{title}</h2>
        {!editing ? (
          <button
            disabled={!canEdit}
            onClick={onEdit}
            title={!canEdit ? disabledHint : undefined}
            style={{
              padding: '6px 14px',
              background: canEdit ? '#F1F5F9' : '#F8FAFC',
              color: canEdit ? '#1E293B' : '#94A3B8',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: canEdit ? 'pointer' : 'not-allowed',
            }}
          >
            {strings.common.edit}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onCancel}
              disabled={saving}
              style={{
                padding: '6px 14px',
                background: '#fff',
                color: '#475569',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {strings.common.cancel}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: '6px 14px',
                background: '#5B50E8',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? '저장 중...' : strings.common.save}
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: '14px 22px 18px' }}>{children}</div>
      {!canEdit && disabledHint && !editing && (
        <div
          style={{
            padding: '10px 22px',
            background: '#FFFBEB',
            borderTop: '1px solid #FDE68A',
            fontSize: 12,
            color: '#78350F',
            fontWeight: 500,
          }}
        >
          ⏳ {disabledHint}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontSize: 12,
          color: '#64748B',
          fontWeight: 600,
          marginBottom: 6,
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ReadValue({ value }: { value: string | null | undefined }) {
  return (
    <div
      style={{
        fontSize: 14.5,
        color: value ? '#0F172A' : '#94A3B8',
        fontWeight: 500,
        padding: '6px 0',
      }}
    >
      {value || '미입력'}
    </div>
  );
}

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function Input({ value, onChange, placeholder, type = 'text' }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '10px 14px',
        background: '#fff',
        border: '1.5px solid #E2E8F0',
        borderRadius: 10,
        fontSize: 14,
        color: '#0F172A',
        outline: 'none',
        transition: 'border-color 0.15s',
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = '#5B50E8')}
      onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
    />
  );
}

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: '#F1F5F9',
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '7px 16px',
              background: active ? '#fff' : 'transparent',
              color: active ? '#0F172A' : '#64748B',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.06)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: '1px dashed #F1F5F9',
      }}
    >
      <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: '#0F172A', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

interface BannerProps {
  tone: 'warning' | 'danger';
  icon: string;
  title: string;
  desc: string;
}

function StatusBanner({ tone, icon, title, desc }: BannerProps) {
  const palette =
    tone === 'warning'
      ? { bg: '#FFFBEB', border: '#FDE68A', titleColor: '#78350F', descColor: '#92400E' }
      : { bg: '#FEF2F2', border: '#FECACA', titleColor: '#991B1B', descColor: '#B91C1C' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: palette.titleColor, marginBottom: 2 }}>
          {title}
        </p>
        <p style={{ fontSize: 12.5, color: palette.descColor, lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  );
}

// ── 플랜 라벨 ──
function planLabel(plan: string): string {
  switch (plan) {
    case 'free':
      return '무료';
    case 'trial':
      return '체험판';
    case 'starter':
      return '스타터';
    case 'standard':
      return '스탠다드';
    case 'pro':
      return '프로';
    default:
      return plan;
  }
}
