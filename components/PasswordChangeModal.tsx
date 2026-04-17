/**
 * PasswordChangeModal — 비밀번호 변경 모달
 *
 * 모든 역할(선생님·학생·학부모·어드민)에서 공통으로 사용
 * Firebase 재인증 → updatePassword 순서로 처리
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../lib/firebase';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PasswordChangeModal({ visible, onClose }: Props) {
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [isLoading, setIsLoading]     = useState(false);

  // 비밀번호 보이기/숨기기
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // 모달 닫을 때 입력값 초기화
  const handleClose = () => {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    onClose();
  };

  // 비밀번호 변경 처리
  const handleSubmit = async () => {
    // 기본 유효성 검사
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    if (newPw.length < 6) {
      Alert.alert('입력 오류', '새 비밀번호는 6자 이상이어야 해요.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('입력 오류', '새 비밀번호가 일치하지 않아요.');
      return;
    }
    if (currentPw === newPw) {
      Alert.alert('입력 오류', '현재 비밀번호와 다른 비밀번호를 입력해주세요.');
      return;
    }

    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) {
      Alert.alert('오류', '로그인 정보를 찾을 수 없어요. 다시 로그인해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      // Firebase는 비밀번호 변경 전 재인증 필요
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPw);
      await reauthenticateWithCredential(firebaseUser, credential);

      // 재인증 성공 → 비밀번호 변경
      await updatePassword(firebaseUser, newPw);

      Alert.alert('변경 완료', '비밀번호가 성공적으로 변경되었어요.', [
        { text: '확인', onPress: handleClose },
      ]);
    } catch (error: any) {
      // Firebase 에러 코드별 메시지 처리
      if (
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        Alert.alert('인증 실패', '현재 비밀번호가 올바르지 않아요.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('요청 초과', '시도 횟수가 너무 많아요. 잠시 후 다시 시도해주세요.');
      } else if (error.code === 'auth/requires-recent-login') {
        Alert.alert('재로그인 필요', '보안을 위해 다시 로그인한 후 시도해주세요.');
      } else {
        Alert.alert('오류', '비밀번호 변경에 실패했어요. 다시 시도해주세요.');
        console.warn('[PasswordChangeModal] 변경 실패:', error.code, error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.sheet}>
          {/* 핸들 바 */}
          <View style={styles.handle} />

          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>비밀번호 변경</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* 현재 비밀번호 */}
            <Text style={styles.label}>현재 비밀번호</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="현재 비밀번호 입력"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowCurrent(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showCurrent ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* 새 비밀번호 */}
            <Text style={[styles.label, { marginTop: 16 }]}>새 비밀번호</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={newPw}
                onChangeText={setNewPw}
                placeholder="새 비밀번호 (6자 이상)"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowNew(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showNew ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* 새 비밀번호 확인 */}
            <Text style={[styles.label, { marginTop: 16 }]}>새 비밀번호 확인</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="새 비밀번호 다시 입력"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* 비밀번호 불일치 안내 */}
            {confirmPw.length > 0 && newPw !== confirmPw && (
              <Text style={styles.errorText}>비밀번호가 일치하지 않아요.</Text>
            )}

            {/* 변경 버튼 */}
            <TouchableOpacity
              style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>변경하기</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 0,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F0FB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    padding: 0,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
