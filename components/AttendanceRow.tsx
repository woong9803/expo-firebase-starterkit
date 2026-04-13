import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { AttendanceStatus } from '../types/index';
import { strings } from '../constants/strings';

// ─────────────────────────────────────────────────────────────
// AttendanceRow
// 선생님 명렬표에서 학생 1명의 출결 행을 표시하는 컴포넌트.
// 이름 + 출석/지각/결석 토글 버튼 + 결석 사유 텍스트 포함.
// ─────────────────────────────────────────────────────────────

interface Props {
  studentName: string;
  status: AttendanceStatus | null; // null = 미입력 상태
  reason: string | null;           // 학부모가 입력한 결석 사유
  onStatusChange: (status: AttendanceStatus) => void;
  disabled?: boolean;              // 저장 중 비활성화 시 사용
}

// 선생님이 직접 입력 가능한 출결 상태만 정의 (onLeave 제외)
type TeacherStatus = 'present' | 'late' | 'absent';

// 토글 버튼 정의
const STATUS_BUTTONS: { status: TeacherStatus; label: string }[] = [
  { status: 'present', label: strings.attendance.present },
  { status: 'late',    label: strings.attendance.late    },
  { status: 'absent',  label: strings.attendance.absent  },
];

// 활성 버튼 스타일 룩업 — 동적 키 접근 타입 오류 방지
const ACTIVE_BUTTON_STYLE: Record<TeacherStatus, object> = {
  present: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  late:    { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  absent:  { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
};

// 활성 버튼 텍스트 색상 룩업
const ACTIVE_TEXT_COLOR: Record<TeacherStatus, string> = {
  present: '#065F46',
  late:    '#78350F',
  absent:  '#991B1B',
};

export default function AttendanceRow({
  studentName,
  status,
  reason,
  onStatusChange,
  disabled = false,
}: Props) {
  return (
    <View style={styles.container}>
      {/* ── 상단 행: 이름 + 버튼 ── */}
      <View style={styles.row}>
        {/* 학생 이름 */}
        <Text style={styles.name} numberOfLines={1}>
          {studentName}
        </Text>

        {/* 출석/지각/결석 토글 버튼 */}
        <View style={styles.buttonGroup}>
          {STATUS_BUTTONS.map(({ status: btnStatus, label }) => {
            const isActive = status === btnStatus;
            return (
              <TouchableOpacity
                key={btnStatus}
                style={[
                  styles.button,
                  isActive && ACTIVE_BUTTON_STYLE[btnStatus],
                ]}
                onPress={() => onStatusChange(btnStatus)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.buttonText,
                    isActive && { color: ACTIVE_TEXT_COLOR[btnStatus] },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 결석 사유: reason이 있을 때만 표시 ── */}
      {reason ? (
        <Text style={styles.reason}>
          💬 {strings.attendance.reason}: {reason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 행 전체 컨테이너
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
  },

  // 이름 + 버튼 가로 배열
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // 학생 이름
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginRight: 12,
  },

  // 버튼 그룹
  buttonGroup: {
    flexDirection: 'row',
    gap: 6,
  },

  // 버튼 기본 스타일 (비활성)
  button: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },

  // 버튼 텍스트 기본 (비활성)
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // 결석 사유 텍스트
  reason: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    marginLeft: 2,
  },
});
