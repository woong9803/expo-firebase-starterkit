import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import type { AttendanceStatus } from '../types/index';
import { strings } from '../constants/strings';

// ─────────────────────────────────────────────────────────────
// AttendanceRow
// 선생님 명렬표에서 학생 1명의 출결 행을 표시하는 컴포넌트.
// 아바타 + 이름 + ○△× 심볼 토글 버튼 + 사유 입력창 포함.
// ─────────────────────────────────────────────────────────────

interface Props {
  studentName: string;
  schoolName?: string;
  status: AttendanceStatus | null;
  reason: string | null;
  onStatusChange: (status: AttendanceStatus) => void;
  // 사유 입력 즉시 부모(pending state)로 전달 — Firestore 쓰기는 "저장하기"에서 일괄 처리
  onReasonChange: (reason: string) => void;
  disabled?: boolean;
  readOnly?: boolean; // 저장 완료 후 보기 전용 모드
}

type TeacherStatus = 'present' | 'late' | 'absent';

const STATUS_BUTTONS: { status: TeacherStatus; symbol: string }[] = [
  { status: 'present', symbol: '○' },
  { status: 'late',    symbol: '△' },
  { status: 'absent',  symbol: '×' },
];

const ACTIVE_STYLE: Record<TeacherStatus, { bg: string; border: string; text: string }> = {
  present: { bg: '#ECFDF5', border: '#10B981', text: '#065F46' },
  late:    { bg: '#FFFBEB', border: '#F59E0B', text: '#78350F' },
  absent:  { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B' },
};

const AVATAR_COLORS = ['#E6F1FB', '#ECFDF5', '#FFFBEB', '#EDE9FE', '#FEF2F2', '#F0FDF4'];
function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// 사유 입력창을 표시할 상태 (지각·결석만)
const NEEDS_REASON: AttendanceStatus[] = ['late', 'absent'];

export default function AttendanceRow({
  studentName,
  schoolName,
  status,
  reason,
  onStatusChange,
  onReasonChange,
  disabled = false,
  readOnly = false,
}: Props) {
  // 입력값은 부모 pending state에 즉시 반영(controlled)
  // — record가 아직 없는 상태에서 자동 저장하면 updateDoc 실패하므로,
  //   "저장하기" 한 번에 status·reason 함께 저장되도록 흐름을 일원화
  const value = reason ?? '';

  const avatarBg = getAvatarColor(studentName);
  // 편집 모드: 지각·결석 상태일 때 입력창 표시
  const showReasonInput = !readOnly && status !== null && ['late', 'absent'].includes(status);
  // 보기 모드: 지각·결석이고 사유가 있을 때 텍스트로 표시
  const showReasonText = readOnly && status !== null && ['late', 'absent'].includes(status) && !!reason;

  return (
    <View style={styles.container}>
      {/* ── 상단 행: 아바타 + 이름 + 버튼 ── */}
      <View style={styles.row}>
        {/* 아바타 */}
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.avatarText}>{studentName.slice(0, 1)}</Text>
        </View>

        {/* 이름 + 학교 */}
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>{studentName}</Text>
          {!!schoolName && (
            <Text style={styles.school} numberOfLines={1}>{schoolName}</Text>
          )}
        </View>

        {/* ○△× 토글 버튼 */}
        <View style={styles.buttonGroup}>
          {STATUS_BUTTONS.map(({ status: btnStatus, symbol }) => {
            const isActive = status === btnStatus;
            const activeStyle = ACTIVE_STYLE[btnStatus];
            return (
              <TouchableOpacity
                key={btnStatus}
                style={[
                  styles.button,
                  isActive && {
                    backgroundColor: activeStyle.bg,
                    borderColor: activeStyle.border,
                  },
                ]}
                onPress={() => onStatusChange(btnStatus)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonSymbol, isActive && { color: activeStyle.text }]}>
                  {symbol}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 보기 모드: 사유 텍스트 (저장 완료 후) ── */}
      {showReasonText && (
        <Text style={styles.reasonText}>
          {reason}
        </Text>
      )}

      {/* ── 편집 모드: 사유 입력창 (지각·결석 상태일 때) ── */}
      {showReasonInput && (
        <View style={styles.reasonRow}>
          <TextInput
            style={styles.reasonInput}
            value={value}
            onChangeText={onReasonChange}
            placeholder={
              status === 'late'
                ? strings.attendance.lateReasonPlaceholder
                : strings.attendance.reasonPlaceholder
            }
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            editable={!disabled}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  // 상단 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // 아바타
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#334155',
  },

  // 이름 + 학교 묶음
  nameBlock: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  school: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },

  // 버튼 그룹
  buttonGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSymbol: {
    fontSize: 17,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // 보기 모드 사유 텍스트
  reasonText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginLeft: 54, // 아바타(42) + gap(12) 만큼 들여쓰기
  },

  // 사유 입력 행
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 54, // 아바타(42) + gap(12) 만큼 들여쓰기
    gap: 8,
  },
  reasonInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#0F172A',
  },
});
