/**
 * Expo config plugin — RN Firebase Auth iOS 의 silent push verifier 활성화
 *
 * 배경:
 *  - Firebase Phone Auth iOS 는 사용자 검증 시 1순위로 silent push verifier 사용
 *    (사용자 눈에 안 보이게 백그라운드에서 처리)
 *  - 실패 시 reCAPTCHA WebView fallback (사용자 눈에 보이는 "Verifying you're not a robot..." 화면)
 *  - silent push verifier 가 동작하려면 APNs 토큰이 Firebase Auth SDK 에 등록돼야 함
 *  - Firebase iOS SDK 는 AppDelegate swizzle 로 자동 hook 시도하지만,
 *    useFrameworks: 'static' + RN Firebase 24.x + RN 0.83 조합에서 자동 swizzle 이 불안정
 *  - → AppDelegate 의 didRegisterForRemoteNotificationsWithDeviceToken 에
 *    Auth.auth().setAPNSToken(deviceToken, type:) 명시 호출이 필요
 *
 * 이 plugin 이 하는 일:
 *  1) AppDelegate.swift 에 'import FirebaseAuth' 추가 (없으면)
 *  2) didRegisterForRemoteNotificationsWithDeviceToken 메서드를 클래스에 추가 (없으면)
 *  3) Debug 빌드 → APNs sandbox / Release 빌드 → APNs production 자동 분기
 *
 * 적용 시점:
 *  - npx expo prebuild 또는 npx expo run:ios 가 ios/ 폴더 생성할 때 자동 적용
 */

const { withAppDelegate } = require('@expo/config-plugins');

const FIREBASE_AUTH_IMPORT = 'import FirebaseAuth';

const APNS_METHOD = `
  // ─── RN Firebase Auth silent push verifier 활성화 ──────────────────
  // APNs 토큰을 Firebase Auth SDK 에 명시 등록 — withFirebaseAuthAPNs plugin 자동 주입
  // 미설정 시 Phone Auth 가 reCAPTCHA WebView fallback 으로 동작
  // type: .unknown 사용 — Firebase SDK 가 entitlement(aps-environment) 기반 자동 감지
  // (.sandbox/.prod 명시 시 entitlement 와 mismatch 가능 → silent push 실패)
  public override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    NSLog("[FirebaseAuth] didRegisterForRemoteNotificationsWithDeviceToken 호출됨, token len: \\(deviceToken.count)")
    Auth.auth().setAPNSToken(deviceToken, type: .unknown)
    NSLog("[FirebaseAuth] setAPNSToken 호출 완료 / type: .unknown")
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  // APNs 등록 실패 시 로그 — 진단용
  public override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("[FirebaseAuth] APNs 등록 실패: \\(error.localizedDescription)")
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }
`;

module.exports = function withFirebaseAuthAPNs(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    // 1) FirebaseAuth import 추가 (없으면 FirebaseCore 다음 줄에 삽입)
    if (!contents.includes(FIREBASE_AUTH_IMPORT)) {
      contents = contents.replace(
        'import FirebaseCore',
        `import FirebaseCore\n${FIREBASE_AUTH_IMPORT}`
      );
    }

    // 2) didRegisterForRemoteNotificationsWithDeviceToken 메서드 추가 (없으면)
    //    AppDelegate 클래스의 마지막 } 직전에 삽입
    //    (마커: '\n}\n\nclass ReactNativeDelegate' — Expo 가 생성하는 표준 구조)
    if (!contents.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
      const marker = '\n}\n\nclass ReactNativeDelegate';
      const idx = contents.indexOf(marker);
      if (idx !== -1) {
        contents = contents.slice(0, idx) + APNS_METHOD + contents.slice(idx);
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
