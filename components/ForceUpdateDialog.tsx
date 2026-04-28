/**
 * ForceUpdateDialog — 강제/권장 업데이트 다이얼로그
 *
 * - isForced=true:  닫기 버튼 없음, '업데이트' 버튼만 (강제)
 * - isForced=false: '나중에' + '업데이트' 버튼 (권장)
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { strings } from '../constants/strings';

interface Props {
  visible: boolean;
  isForced: boolean;     // true: 강제 업데이트 / false: 권장 업데이트
  storeUrl: string;      // 이동할 App Store / Play Store URL
  onDismiss?: () => void; // isForced=false일 때 '나중에' 콜백
}

export default function ForceUpdateDialog({
  visible,
  isForced,
  storeUrl,
  onDismiss,
}: Props) {
  // 스토어 링크 열기
  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {
        console.warn('[ForceUpdateDialog] 스토어 URL 열기 실패:', storeUrl);
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // 강제 업데이트 시 바깥 영역 탭으로 닫기 불가
      onRequestClose={isForced ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* 아이콘 */}
          <View style={styles.iconBox}>
            <Ionicons name="refresh-circle-outline" size={48} color="#5B50E8" />
          </View>

          {/* 제목 */}
          <Text style={styles.title}>
            {isForced ? strings.update.forceTitle : strings.update.recommendTitle}
          </Text>

          {/* 안내 메시지 */}
          <Text style={styles.message}>
            {isForced ? strings.update.forceMessage : strings.update.recommendMessage}
          </Text>

          {/* 버튼 영역 */}
          <View style={styles.buttonRow}>
            {/* 권장 업데이트일 때만 '나중에' 버튼 표시 */}
            {!isForced && onDismiss && (
              <TouchableOpacity
                style={[styles.button, styles.laterButton]}
                onPress={onDismiss}
                activeOpacity={0.8}
              >
                <Text style={styles.laterButtonText}>{strings.update.laterButton}</Text>
              </TouchableOpacity>
            )}

            {/* 업데이트 버튼 */}
            <TouchableOpacity
              style={[styles.button, styles.updateButton, !isForced && styles.buttonFlex]}
              onPress={handleUpdate}
              activeOpacity={0.8}
            >
              <Text style={styles.updateButtonText}>{strings.update.updateButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 반투명 배경 오버레이
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  // 다이얼로그 카드
  container: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  // 아이콘 박스
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEEDF9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  // 버튼 컨테이너
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  button: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 버튼 flex (권장 업데이트 시 두 버튼이 나란히)
  buttonFlex: {
    flex: 1,
  },
  // '나중에' 버튼 (Secondary 스타일)
  laterButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  // '업데이트' 버튼 (Primary 스타일)
  updateButton: {
    backgroundColor: '#5B50E8',
    // isForced일 때 전체 너비 차지
    flex: 1,
  },
  updateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
