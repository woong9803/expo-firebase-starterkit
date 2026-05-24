/**
 * lib/deleteAccount.ts — 계정 탈퇴 공통 헬퍼
 *
 * 4개 역할(admin/teacher/student/parent) 화면에서 동일하게 사용되는
 * 탈퇴 다이얼로그 + Cloud Function 호출 흐름을 한 곳에서 관리.
 *
 * PIPA 삭제권:
 *   - 사용자는 30일 후 삭제(소프트) 또는 즉시 완전 삭제 중 선택 가능
 *   - 즉시 삭제 시 한 번 더 확인 다이얼로그로 오조작 방지
 */

import { Alert } from 'react-native';
import { firebase as fbFunctions } from '@react-native-firebase/functions';

import { strings } from '../constants/strings';
import { safeSignOut } from './auth';

/**
 * 탈퇴 옵션 다이얼로그를 띄우고 사용자가 선택한 모드로 Cloud Function 호출
 *
 * @param onLoadingChange  로딩 토글 콜백 (버튼 비활성화 등 UI 처리용)
 * @param onSuccess        탈퇴 성공 후 호출 (보통 clearUser + 라우터 리셋)
 *
 * 흐름:
 *   1. "탈퇴 방법" 선택 (30일 후 / 즉시 / 취소)
 *   2. 즉시 선택 시 → "정말 즉시 삭제?" 한 번 더 확인
 *   3. deleteUser(immediate) Cloud Function 호출
 *   4. signOut + onSuccess 콜백
 */
export function showDeleteAccountDialog(opts: {
  onLoadingChange: (loading: boolean) => void;
  onSuccess: () => void;
}): void {
  const { onLoadingChange, onSuccess } = opts;

  const runDelete = async (immediate: boolean) => {
    onLoadingChange(true);
    try {
      const deleteUserFn = fbFunctions
        .app()
        .functions('asia-northeast3')
        .httpsCallable('deleteUser');
      await deleteUserFn({ immediate });
      // 성공 안내 — 즉시 삭제일 때는 별도 메시지 노출 후 signOut
      // (signOut 후에는 화면이 전환되므로 Alert 가 즉시 닫힐 수 있어, 사용자에게 명시적 안내)
      if (immediate) {
        Alert.alert(strings.common.confirm, strings.account.deleteImmediateSuccess);
      }
      await safeSignOut();
      onSuccess();
    } catch (e) {
      const err = e as { message?: string };
      Alert.alert(strings.common.error, err.message ?? strings.account.deleteFailed);
    } finally {
      onLoadingChange(false);
    }
  };

  // 1단계 — 방법 선택
  Alert.alert(
    strings.account.deleteOptionTitle,
    strings.account.deleteOptionMessage,
    [
      { text: strings.common.cancel, style: 'cancel' },
      {
        // 30일 후 삭제 (기존 동작)
        text: strings.account.deleteOptionStandard,
        onPress: () => runDelete(false),
      },
      {
        // 즉시 완전 삭제 — 한 번 더 확인
        text: strings.account.deleteOptionImmediate,
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            strings.account.deleteImmediateConfirmTitle,
            strings.account.deleteImmediateConfirmMessage,
            [
              { text: strings.common.cancel, style: 'cancel' },
              {
                text: strings.account.deleteImmediateButton,
                style: 'destructive',
                onPress: () => runDelete(true),
              },
            ]
          );
        },
      },
    ]
  );
}
