import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Collections } from './firestore';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

// 알림 권한 거부 시 재요청 억제 기간 (3일)
const FCM_DENIED_AT_KEY = 'fcm_permission_denied_at';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
// 푸시 토큰 초기화 — 로그인 완료 후 호출
// ─────────────────────────────────────────────

/**
 * Expo Push 토큰 발급 및 Firestore 저장
 * - Expo Push Service가 APNs(iOS)/FCM(Android)로 자동 라우팅해줌
 * - 권한 거부 시: AsyncStorage에 거부 시각 저장, 3일 후 재요청
 * - 토큰 발급 성공 시: users/{uid}.fcm_token 업데이트
 *   (DB 필드명은 호환을 위해 fcm_token 유지, 실제 값은 ExponentPushToken[xxx])
 */
export async function initFCM(uid: string): Promise<void> {
  try {
    // 현재 권한 상태 확인
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      // 거부 상태라면 3일 이내 재요청 억제
      if (existingStatus === 'denied') {
        const deniedAt = await AsyncStorage.getItem(FCM_DENIED_AT_KEY);
        if (deniedAt) {
          const elapsed = Date.now() - parseInt(deniedAt, 10);
          if (elapsed < THREE_DAYS_MS) {
            // 3일 이내에 이미 거부됐으면 재요청 안 함
            return;
          }
        }
      }

      // 권한 요청
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;

      if (status !== 'granted') {
        // 사용자가 거부 → 거부 시각 저장
        await AsyncStorage.setItem(FCM_DENIED_AT_KEY, String(Date.now()));
        return;
      }
    }

    if (finalStatus !== 'granted') return;

    // EAS projectId — getExpoPushTokenAsync에 명시적으로 전달해야 SDK 49+에서 정상 동작
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    // Expo Push Token 발급 — ExponentPushToken[xxxxxx] 형태
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const expoPushToken = tokenData.data;

    if (!expoPushToken) return;

    // Firestore users/{uid}.fcm_token 저장 (필드명은 호환 유지, 값은 Expo Push Token)
    await Collections.user(uid).update({ fcm_token: expoPushToken });
  } catch (err) {
    // 토큰 발급 실패 시 앱 동작에 영향 없도록 로그만 남김
    console.warn('[initFCM] 푸시 토큰 초기화 실패:', err);
  }
}

// ─────────────────────────────────────────────
// 알림 리스너 등록 — 앱 레이아웃에서 한 번만 호출
// ─────────────────────────────────────────────

/**
 * 알림 리스너 등록
 * - 포그라운드 알림 표시 설정
 * - 알림 클릭 시 deep_link로 화면 이동
 * - 토큰 갱신 감지 시 Firestore 자동 업데이트
 *
 * @returns cleanup 함수 (컴포넌트 언마운트 시 호출)
 */
export function registerFCMListeners(uid: string): () => void {
  // 포그라운드 상태에서도 알림 표시 (배너 + 소리 + 뱃지)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false, // 바텀탭 뱃지 사용 금지 정책에 따라 false
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // 알림 클릭(탭) 리스너 — data.deep_link가 있으면 해당 화면으로 이동
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const deepLink = response.notification.request.content.data?.deep_link as
        | string
        | undefined;
      if (deepLink) {
        router.push(deepLink as Parameters<typeof router.push>[0]);
      }
    }
  );

  // 토큰 갱신 리스너 — Expo Push Token이 바뀌면 Firestore 자동 업데이트
  // (앱 재설치·OS 푸시 권한 토글 등으로 토큰이 변경될 수 있음)
  const tokenListener = Notifications.addPushTokenListener(async (tokenData) => {
    const newToken = tokenData.data as string;
    if (newToken && uid) {
      try {
        await Collections.user(uid).update({ fcm_token: newToken });
      } catch (err) {
        console.warn('[registerFCMListeners] 토큰 갱신 실패:', err);
      }
    }
  });

  // cleanup 함수 반환 — useEffect의 return에서 호출
  return () => {
    responseListener.remove();
    tokenListener.remove();
  };
}
