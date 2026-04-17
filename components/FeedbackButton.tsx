/**
 * components/FeedbackButton.tsx — 숙제 피드백 버튼
 *
 * 선생님 숙제 검사 화면에서 사용하는 원터치 피드백 버튼.
 * 선택 상태에 따라 배경색·테두리가 변경된다.
 * type 값('👍'|'💧')은 Firestore 저장값이므로 유지, UI는 텍스트로만 표시.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  type: '👍' | '💧';
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export default function FeedbackButton({ type, selected, onPress, disabled = false }: Props) {
  const isPass = type === '👍';

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        selected && (isPass ? styles.btnActivePass : styles.btnActiveRetry),
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.label,
          selected && (isPass ? styles.labelActivePass : styles.labelActiveRetry),
        ]}
      >
        {isPass ? '잘했어요' : '다시해요'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F8F7FF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  // 잘했어요 선택 상태 — 초록 계열
  btnActivePass: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  // 다시해요 선택 상태 — 노랑 계열
  btnActiveRetry: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  label: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  labelActivePass: { color: '#065F46' },
  labelActiveRetry: { color: '#78350F' },
});
