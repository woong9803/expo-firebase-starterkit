# APNs 설정 및 Phone Auth(SMS OTP) 활성화 가이드

Firebase Phone Auth는 iOS에서 **APNs(Apple Push Notification service)** 를 통해  
Silent Push로 자동 인증합니다. 아래 순서대로 설정하면 SMS OTP가 실제로 동작합니다.

> **중요**: Expo Go에서는 APNs 토큰을 받을 수 없어 Phone Auth가 동작하지 않습니다.  
> 반드시 **EAS Build** 또는 **expo run:ios** (로컬 빌드) 환경에서 테스트하세요.

---

## 전제 조건

- Apple Developer Program 계정 (유료, 연 $99)
- Firebase 프로젝트: `woongking` (이미 설정됨)
- `app.config.ts`의 `bundleIdentifier`: `com.woongking.app` (이미 설정됨)

---

## Step 1 — Apple Developer에서 APNs 인증 키 생성

1. [Apple Developer Console](https://developer.apple.com) → **Certificates, Identifiers & Profiles** 이동
2. 좌측 메뉴 **Keys** 클릭 → **+ 버튼**으로 새 키 생성
3. Key Name: `WoongkingAPNs` (임의 이름)
4. **Apple Push Notifications service (APNs)** 체크박스 활성화
5. **Continue** → **Register** 클릭
6. **.p8 파일 다운로드** — **이 파일은 딱 1번만 다운로드 가능, 반드시 안전하게 보관**
7. **Key ID** 메모 (10자리 영숫자, 이후 Firebase에 입력)
8. **Team ID** 확인: 우측 상단 계정명 클릭 → Membership Details에서 확인

---

## Step 2 — Firebase 콘솔에 APNs 키 업로드

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 선택
2. **프로젝트 설정** (톱니바퀴 아이콘) → **Cloud Messaging** 탭 이동
3. **Apple 앱 구성** 섹션 → `com.woongking.app` 앱 선택
4. **APNs 인증 키** → **업로드** 버튼 클릭
5. 다음 정보 입력:
   - **APNs 인증 키 (.p8 파일)**: Step 1에서 다운로드한 파일 선택
   - **키 ID**: Step 1에서 메모한 Key ID
   - **팀 ID**: Step 1에서 확인한 Team ID
6. **업로드** 클릭 → 완료

---

## Step 3 — EAS Build로 개발 빌드 생성

```bash
# EAS CLI 설치 (최초 1회)
npm install -g eas-cli

# EAS 로그인
eas login

# 개발용 빌드 생성 (실제 기기 설치용)
eas build --platform ios --profile development

# 또는 로컬 빌드 (Mac + Xcode 필요)
npx expo run:ios
```

> Expo Go 앱에서는 APNs 토큰 발급이 불가하여 Phone Auth 동작 안 함.  
> 반드시 위 방법으로 생성한 빌드를 실제 기기에 설치하여 테스트.

---

## Step 4 — Android Phone Auth 설정 (별도)

Android는 APNs 대신 **Google Play Services**를 사용하므로 별도 APNs 설정 불필요.  
단, 다음을 확인하세요:

1. `google-services.json`이 프로젝트 루트에 존재 (이미 설정됨 ✅)
2. `app.config.ts`의 `android.package`: `com.woongking.app` (이미 설정됨 ✅)
3. SHA-1 인증서 지문이 Firebase 콘솔에 등록되어 있는지 확인

---

## 동작 확인 방법

1. EAS Build 또는 `expo run:ios`로 실제 기기에 앱 설치
2. 가입 흐름 진행 → 휴대폰 번호 입력 → **인증번호 받기** 버튼 탭
3. 실제 SMS로 6자리 OTP 수신 확인
4. OTP 입력 → 인증 완료 → 다음 화면(역할 선택)으로 이동

---

## 문제 해결

| 오류 | 원인 | 해결 |
|------|------|------|
| `auth/invalid-phone-number` | 번호 형식 오류 | 01012345678 형식 확인 |
| `auth/too-many-requests` | 단기간 과다 요청 | 잠시 후 재시도 |
| `auth/quota-exceeded` | 일일 한도 초과 | 다음 날 재시도 또는 Firebase 요금제 업그레이드 |
| OTP 미수신 (실기기) | APNs 미설정 | Step 1~2 재확인 |
| OTP 미수신 (시뮬레이터) | 시뮬레이터는 APNs 미지원 | 실제 기기로 테스트 |

---

## Firebase Phone Auth 테스트 번호 (개발용)

실제 SMS 없이 테스트하려면 Firebase 콘솔에서 테스트 번호를 등록하세요:

1. Firebase 콘솔 → **Authentication** → **Sign-in method** → **Phone** → **Phone numbers for testing**
2. 번호와 OTP 코드 직접 지정 (예: `+82 10-0000-0000` / OTP: `123456`)
3. 앱에서 해당 번호 입력 시 실제 SMS 없이 지정한 OTP로 인증 가능

---

*작성일: 2026-04-17 | 관련 파일: `app/(auth)/phone-input.tsx`, `lib/auth.ts`*
