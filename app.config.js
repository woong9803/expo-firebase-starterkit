// Expo dynamic config (JS)
// .ts에서 .js로 전환 — EAS 빌드 서버 환경에서 TypeScript 트랜스파일이 깨지는 이슈 회피
// 동작 자체는 .ts와 동일 (런타임 함수형 config)

const { withInfoPlist } = require('@expo/config-plugins');

// Google Sign-In 콜백 URL 스킴 — @react-native-google-signin 플러그인이 처리하지 않아 직접 추가
const withGoogleUrlScheme = (config) => {
  // REVERSED_CLIENT_ID: 611902629604-xxx.apps.googleusercontent.com → com.googleusercontent.apps.611902629604-xxx
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const googleReversedClientId = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : '';

  if (!googleReversedClientId) return config;

  return withInfoPlist(config, (mod) => {
    const urlTypes = mod.modResults['CFBundleURLTypes'] ?? [];
    if (!urlTypes.some((t) => t.CFBundleURLSchemes?.includes(googleReversedClientId))) {
      urlTypes.push({ CFBundleURLSchemes: [googleReversedClientId] });
    }
    mod.modResults['CFBundleURLTypes'] = urlTypes;
    return mod;
  });
};

module.exports = ({ config }) => {
  const base = {
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
        // Firebase Phone Auth — APNs Silent Push 수신을 위해 필수
        // 미설정 시 reCAPTCHA fallback 으로 무한 루프 발생
        UIBackgroundModes: ['remote-notification'],
      },
      // APNs entitlement — APNS_ENV 환경변수로 분기 (eas.json의 build.<profile>.env 에서 설정)
      // production 빌드만 'production', development/preview 빌드는 'development'
      // 잘못 설정 시 APNs 토큰 발급 실패 → Phone Auth reCAPTCHA fallback 무한 루프 발생
      entitlements: {
        'aps-environment': process.env.APNS_ENV === 'production' ? 'production' : 'development',
      },
    },
    android: {
      package: 'com.woongking.app',
      adaptiveIcon: {
        foregroundImage: './assets/app_icon_3.png',
        backgroundColor: '#ffffff',
      },
      // Expo SDK 52+ 런타임 지원 필드 — 타입 정의 미반영이지만 .js라 무관
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
      // ⚠️ @react-native-firebase/messaging 은 사용하지 않음
      // 이유: useFrameworks: 'static' + RN Firebase 24 + RN 0.83 조합에서
      // RNFBApp 이 modular framework 로 먼저 로드되며 React-Core 매크로(RCT_EXPORT_METHOD 등)
      // 를 흡수해 RNFBMessaging 컴파일 단계에서 헤더 모듈 충돌 발생
      // → APNs 토큰은 expo-notifications.getDevicePushTokenAsync() 로 받고
      //    auth().setAPNSToken() 으로 RN Firebase Auth 에 직접 주입 (lib/auth.ts 참조)
      // Firebase iOS Pod 들이 Swift static library 통합을 요구하므로 useFrameworks: 'static' 필수
      // 미설정 시 pod install 단계에서 "FirebaseAuth depends upon ... which do not define modules" 에러
      [
        'expo-build-properties',
        {
          ios: {
            useFrameworks: 'static',
            // New Architecture(Fabric/TurboModules) 비활성화 — RN 0.83 + Hermes + static frameworks 조합에서
            // 시작 시 TurboModule 큐에서 ObjC NSException catch 실패 → abort() 발생 회피
            // 반드시 ios 객체 안에 두어야 적용됨 (최상위에 두면 무시됨)
            newArchEnabled: false,
            // React-Core 를 소스에서 컴파일 — SDK 55 기본값(prebuilt RNCore binary)은
            // useFrameworks: 'static' + RN Firebase 24 조합과 호환 안 됨
            // (RNFBFirestoreModule.m 컴파일 시 RCT_EXTERN / RCT_EXPORT_METHOD 매크로 인식 실패)
            // 첫 빌드는 5~15분 소요되지만 이후 캐시 사용
            buildReactNativeFromSource: true,
          },
          android: {
            newArchEnabled: false,
          },
        },
      ],
      // Podfile post_install에 CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES=YES 자동 주입 (RNFB pod 한정)
      './plugins/withPodfileNonModularHeaders',
      // RN Firebase Auth iOS silent push verifier 활성화 — Phone Auth reCAPTCHA fallback 회피
      // AppDelegate 의 didRegisterForRemoteNotificationsWithDeviceToken 에 Auth.setAPNSToken 호출 자동 주입
      './plugins/withFirebaseAuthAPNs',
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
          color: '#5B50E8',           // 알림 아이콘 배경색 (Android)
          // iosDisplayInForeground 제거 — SDK 50+ 에서 제거된 레거시 옵션.
          // 일부 빌드에서 iOS 네이티브 willPresent 응답을 강제로 덮어써
          // setNotificationHandler 표시와 중복(알림 2회 수신) 유발.
          // 포그라운드 표시는 lib/fcm.ts 의 setNotificationHandler 에서 단일 제어.
          sounds: [],
        },
      ],
    ],
    // Firebase 설정값을 앱 번들에 주입 (EXPO_PUBLIC_ 변수는 앱 코드에서도 직접 접근 가능)
    extra: {
      // EAS 프로젝트 식별자 — eas init 시 발급됨 (dynamic config라 수동 추가)
      eas: {
        projectId: '482ed6d7-52dc-4f7f-bbd7-3080916da598',
      },
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
