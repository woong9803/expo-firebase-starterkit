import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '웅깅',
  slug: 'woongking',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/app_icon.png',
  userInterfaceStyle: 'light',
  scheme: 'woongking', // 딥링크·푸시 알림 이동을 위한 앱 스킴
  splash: {
    image: './assets/app_icon.png',
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
      foregroundImage: './assets/app_icon.png',
      backgroundColor: '#ffffff',
    },
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
    '@react-native-google-signin/google-signin', // Google 로그인
    [
      'react-native-kakao-login',
      { kakaoAppKey: process.env.EXPO_PUBLIC_KAKAO_APP_KEY ?? '' },
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
});
