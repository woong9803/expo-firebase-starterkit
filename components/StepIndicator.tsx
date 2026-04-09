import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  steps: number;   // 전체 스텝 수
  current: number; // 현재 스텝 (1부터 시작)
}

/**
 * 온보딩 스텝 인디케이터 공용 컴포넌트
 * - 완료 스텝: 파란 원 + 흰 체크
 * - 현재 스텝: 파란 원 + 숫자 + glow ring
 * - 미완료 스텝: 회색 원 + 회색 숫자
 * 스텝 사이에 연결선을 렌더하며, register/phone-verify/code-input에서 공용 사용
 */
export default function StepIndicator({ steps, current }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: steps }, (_, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isActive = stepNum === current;

        return (
          <React.Fragment key={stepNum}>
            {/* 연결선 — 첫 스텝 앞에는 없음 */}
            {i > 0 && (
              <View
                style={[
                  styles.line,
                  isDone || isActive ? styles.lineDone : styles.linePending,
                ]}
              />
            )}

            {/* 스텝 원 */}
            <View
              style={[
                styles.circle,
                isDone && styles.circleDone,
                isActive && styles.circleActive,
                !isDone && !isActive && styles.circlePending,
              ]}
            >
              {isDone ? (
                // 완료: 흰 체크 기호
                <Text style={styles.checkMark}>✓</Text>
              ) : (
                // 현재·미완료: 숫자
                <Text
                  style={[
                    styles.stepNumber,
                    isActive ? styles.stepNumberActive : styles.stepNumberPending,
                  ]}
                >
                  {stepNum}
                </Text>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },

  // ── 연결선 ──
  line: {
    width: 40,
    height: 2,
  },
  lineDone: {
    backgroundColor: '#2176C7', // b500 — 완료 구간은 파란색
  },
  linePending: {
    backgroundColor: '#E2E8F0', // g200 — 미완료 구간은 회색
  },

  // ── 스텝 원 ──
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: '#2176C7', // b500
  },
  circleActive: {
    backgroundColor: '#2176C7', // b500
    // glow ring: 0 0 0 3px #B5D4F4
    shadowColor: '#B5D4F4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  circlePending: {
    backgroundColor: '#F1F5F9', // g100
  },

  // ── 텍스트 ──
  checkMark: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepNumberPending: {
    color: '#94A3B8', // g400 — 비활성 텍스트
  },
});
