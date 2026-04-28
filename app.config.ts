import { ExpoConfig, ConfigContext } from 'expo/config';
import { withInfoPlist } from '@expo/config-plugins';

// Google Sign-In 콜백 URL 스킴 — @react-native-google-signin 플러그인이 처리하지 않아 직접 추가
const withGoogleUrlScheme = (config: ExpoConfig): ExpoConfig => {
  // REVERSED_CLIENT_ID: 611902629604-xxx.apps.googleusercontent.com → com.googleusercontent.apps.611902629604-xxx
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const googleReversedClientId = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : '';

  if (!googleReversedClientId) return config;

  return withInfoPlist(config, (mod) => {
    const urlTypes: { CFBundleURLSchemes: string[] }[] = mod.modResults['CFBundleURLTypes'] ?? [];
    if (!urlTypes.some((t) => t.CFBundleURLSchemes?.includes(googleReversedClientId))) {
      urlTypes.push({ CFBundleURLSchemes: [googleReversedClientId] });
    }
    mod.modResults['CFBundleURLTypes'] = urlTypes;
    return mod;
  });
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = {
  ...config,
  name: '웅깅',
  slug: 'woongking',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/app_icon_3.png',
  userInterfaceStyle: 'light',
  scheme: 'woongking', // 딥링크·푸시 알림 이동을 위한 앱 스킴
  splash: {
    image: './assets/app_icon_3.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.woongking.app',
    googleServicesFile: './GoogleService-Info.plist',
    usesAppleSignIn: true, // Apple 로그인 capability 활성화
    infoPlist: {
      NSUserNotificationsUsageDescription:
        '숙제 마감, 피드백, 공지 알림을 받으려면 알림 권한이 필요합니다.',
    },
  },
  android: {
    package: 'com.woongking.app',
    adaptiveIcon: {
      foregroundImage: './assets/app_icon_3.png',
      backgroundColor: '#ffffff',
    },
    // Expo SDK 52+ 런타임 지원 필드지만 expo/config 타입 정의에 아직 미반영
    // 타입 업데이트 되면 이 주석과 ts-expect-error 제거 (자동으로 컴파일 에러로 알려줌)
    // @ts-expect-error edgeToEdgeEnabled 는 SDK 런타임만 지원
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    // FCM 수신을 위한 Android 추가 권한
    permissions: ['android.permission.RECEIVE_BOOT_COMPLETED'],
    googleServicesFile: './google-services.json',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    // React Native Firebase — phone auth 정상 동작을 위해 필수
    // GoogleService-Info.plist + google-services.json 으로 자동 초기화됨
    '@react-native-firebase/app',
    // Firebase iOS Pod 들이 Swift static library 통합을 요구하므로 useFrameworks: 'static' 필수
    // 미설정 시 pod install 단계에서 "FirebaseAuth depends upon ... which do not define modules" 에러
    [
      'expo-build-properties',
      {
        ios: { useFrameworks: 'static' },
      },
    ],
    // Podfile post_install에 CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES=YES 자동 주입 (RNFB pod 한정)
    './plugins/withPodfileNonModularHeaders',
    '@react-native-google-signin/google-signin',
    [
      '@react-native-kakao/core',
      {
        nativeAppKey: process.env.EXPO_PUBLIC_KAKAO_APP_KEY,
        ios: { handleKakaoOpenUrl: true },
        android: { handleKakaoOpenUrl: true },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: '숙제 사진을 찍으려면 카메라 접근 권한이 필요합니다.',
      },
    ],
    [
      'expo-notifications',
      {
        // 알림 아이콘 (없으면 기본 앱 아이콘 사용)
        // icon: './assets/notification-icon.png',
        color: '#5B50E8',           // 알림 아이콘 배경색 (Android)
        iosDisplayInForeground: true, // 앱 포그라운드 상태에서도 알림 표시
        sounds: [],
      },
    ],
  ],
  // Firebase 설정값을 앱 번들에 주입 (EXPO_PUBLIC_ 변수는 앱 코드에서도 직접 접근 가능)
  extra: {
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  },
  };
  return withGoogleUrlScheme(base);
};
