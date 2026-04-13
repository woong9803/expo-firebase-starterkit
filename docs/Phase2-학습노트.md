# Phase 2 학습 노트 — dev-app-first 온보딩 및 인증 시스템

> 이 문서는 Phase 2에서 만든 파일들이 **무엇인지, 왜 필요한지**를 설명합니다.
> Phase 1 학습노트를 읽었다고 가정하고 이어서 설명합니다.

---

## 전체 인증 흐름 한눈에 보기

```
앱 처음 실행
     ↓
[로그인 화면]  ──────────────────────────────────────────┐
     ↓ 신규 가입                                         │ 기존 계정 로그인
[회원가입]  →  [휴대폰 OTP 인증]  →  [역할 선택]         │
                                          ↓              │
                              ┌─────────────────────┐    │
                              │ 원장님  선생님  학생  학부모│    │
                              └─────────────────────┘    │
                                    ↓                     │
                          ┌─────────────────────────┐    │
                          │원장님: 학원 정보 입력       │    │
                          │선생님: 학원코드 입력         │    │
                          │학생:   반 코드 입력          │    │
                          │학부모: 자녀 연동코드 입력    │    │
                          └─────────────────────────┘    │
                                    ↓                     │
                    [앱 메인 화면 — 역할별 분기]  ←────────┘
```

---

## 1. lib/auth.ts — 인증 헬퍼 함수 모음

### 왜 이 파일이 필요한가?

**비유:** 요리 레시피 책처럼, 자주 쓰는 인증 과정을 함수로 만들어놨어요.
매번 로그인할 때마다 Firebase 코드를 처음부터 쓰는 대신, 이 함수들을 불러서 써요.

```
login.tsx          ┐
register.tsx       ├──→ lib/auth.ts ──→ Firebase Auth
phone-verify.tsx   ┘                ──→ Firestore
```

**만들어진 함수 13개:**

| 함수 | 하는 일 |
|------|---------|
| `signInWithEmail` | 이메일/비밀번호로 로그인 |
| `signUpWithEmail` | 이메일/비밀번호로 회원가입 |
| `signInWithGoogle` | Google 계정으로 로그인 |
| `signInWithApple` | Apple 계정으로 로그인 (iPhone만) |
| `signInWithKakao` | 카카오 계정으로 로그인 |
| `sendPhoneOtp` | 휴대폰으로 인증번호 발송 |
| `verifyPhoneOtp` | 입력한 인증번호 확인 |
| `createUserDoc` | Firestore에 사용자 정보 저장 |
| `updateUserDoc` | Firestore 사용자 정보 수정 |
| `validateAcademyCode` | 학원코드가 유효한지 확인 |
| `validateInviteCode` | 반 초대코드가 유효한지 확인 |
| `validateLinkCode` | 자녀 연동코드가 유효한지 확인 |
| `generateLinkCode` | 6자리 랜덤 코드 생성 |
| `checkPhoneDuplicate` | 이미 가입된 번호인지 확인 |

---

## 2. 소셜 로그인 3종 — Google / Apple / 카카오

### 소셜 로그인이란?

**비유:** 새 카페에 갈 때 직접 회원가입하는 대신, 카카오 계정으로 바로 로그인하는 것처럼요.

```
[Google 버튼 클릭]
       ↓
Google에서 "이 사람이 맞아요" 확인
       ↓
Google이 "토큰(신분증)"을 줌
       ↓
Firebase에 토큰을 제출 → 로그인 완료
```

### Google 로그인

```typescript
// @react-native-google-signin/google-signin 패키지 사용
const signInWithGoogle = async () => {
  const userInfo = await GoogleSignin.signIn()
  const credential = GoogleAuthProvider.credential(userInfo.data?.idToken)
  return signInWithCredential(auth, credential)  // Firebase에 로그인
}
```

### Apple 로그인 (iPhone만 가능)

```typescript
// expo-apple-authentication 패키지 사용
// Platform.OS === 'ios' 일 때만 버튼 표시
const signInWithApple = async () => {
  const appleCredential = await AppleAuthentication.signInAsync({ ... })
  const credential = new OAuthProvider('apple.com').credential({
    idToken: appleCredential.identityToken
  })
  return signInWithCredential(auth, credential)
}
```

### 카카오 로그인 (가장 복잡)

**왜 복잡한가?** 카카오는 Firebase에서 공식 지원하지 않아서, 중간에 우리 서버(Cloud Function)가 번역을 해줘야 해요.

```
[카카오 버튼 클릭]
       ↓
카카오 SDK → 카카오 액세스 토큰 획득
       ↓
Cloud Function(kakaoLogin)에 토큰 전달
       ↓
Cloud Function이 카카오 서버에 확인 → "맞아요"
       ↓
Cloud Function이 Firebase Custom Token 발급
       ↓
Firebase에 Custom Token으로 로그인 완료
```

> **⚠️ 보안 주의:** 카카오 Admin Key(마스터 비밀번호 같은 것)는 절대 앱 코드에 넣으면 안 됩니다.
> `functions/.env` 파일 서버에만 보관해요.

---

## 3. 휴대폰 OTP 인증 — app/(auth)/phone-verify.tsx

### OTP란?

**비유:** 은행 ATM에서 "지금 이 번호로 문자 보냈어요, 확인해주세요" 하는 것과 같아요.

```
사용자가 번호 입력
      ↓
Firebase가 문자 발송 ("인증번호: 123456")
      ↓
사용자가 6자리 입력
      ↓
Firebase에서 확인 → 인증 완료
```

### OTP 박스 UI (6칸)

ui-screens.md 스펙에 따라 3가지 상태로 색이 바뀌어요:

```
┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐
│   │ │   │ │ 3 │ │   │ │   │ │   │
└───┘ └───┘ └───┘ └───┘ └───┘ └───┘
 미입력    미입력  현재입력   미입력...

미입력:    테두리 #E2E8F0  / 배경 #F8FAFC
현재 입력: 테두리 #2176C7  / 파란 빛 번짐 효과
입력 완료: 테두리 #378ADD  / 배경 #E6F1FB / 글자 #0C447C
```

### 자동 포커스 이동 원리

```typescript
// 숫자 입력 시 다음 칸으로 자동 이동
const handleOtpChange = (text: string, index: number) => {
  if (text && index < 5) {
    inputRefs.current[index + 1]?.focus()  // 다음 칸으로 이동
  }
}

// 지우기(Backspace) 시 이전 칸으로 이동
const handleKeyPress = (key: string, index: number) => {
  if (key === 'Backspace' && !otp[index] && index > 0) {
    inputRefs.current[index - 1]?.focus()  // 이전 칸으로 이동
  }
}
```

### 재발송 타이머

```
인증번호 받기 클릭
      ↓
60초 카운트다운 시작 (59 → 58 → ... → 0)
      ↓
0이 되면 재전송 버튼 활성화
```

---

## 4. StepIndicator — 온보딩 진행 표시

### 왜 필요한가?

**비유:** 인터넷 쇼핑할 때 "1. 장바구니 → 2. 배송정보 → 3. 결제" 순서표처럼,
지금 어느 단계인지 보여줘요.

```
① → ② → ③
완료  현재  미완료
```

### 사용 방법

```typescript
// 3단계 중 2번째 단계 진행 중
<StepIndicator steps={3} current={2} />
```

**화면별 스텝:**

| 화면 | 스텝 |
|------|------|
| register.tsx | `current={1}` |
| phone-verify.tsx | `current={2}` |
| role-select.tsx / code-input.tsx | `current={3}` |

### 3가지 상태 디자인

```
완료(이미 지난 단계):  파란 원 + 흰 체크 ✓
현재(지금 이 단계):    파란 원 + 숫자 + 파란 빛 번짐
미완료(아직 안 한 단계): 회색 원 + 회색 숫자
```

`components/` 폴더에 분리해서 **register, phone-verify, code-input 3곳**에서 공용으로 사용해요.

---

## 5. 역할 선택 — app/(auth)/role-select.tsx

### 4가지 역할 카드

```
┌──────────────┐  ┌──────────────┐
│ 🏫            │  │ 👨‍🏫            │
│ 원장님         │  │ 선생님         │
│ 학원을 운영해요 │  │ 수업을 담당해요 │
└──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ 📚            │  │ 👨‍👧            │
│ 학생           │  │ 학부모         │
│ 숙제를 제출해요 │  │ 자녀 현황 확인  │
└──────────────┘  └──────────────┘
```

카드를 선택하면 테두리가 파란색으로 바뀌고 체크 표시가 나타나요:
```
선택 전:  테두리 #E2E8F0 (회색)
선택 후:  테두리 #2176C7 (파란색) + 배경 #E6F1FB (연한 파란색)
```

### 역할 선택 후 분기

```
원장님 선택   →  학원 등록 화면 (academy-register.tsx)
선생님 선택   →  학원코드 입력 화면
학생 선택     →  반 코드 입력 화면
학부모 선택   →  자녀 연동코드 입력 화면
```

---

## 6. 학원 등록 — app/(auth)/academy-register.tsx (원장님 전용)

### 학원 등록 과정

원장님이 가입하면 바로 학원을 쓸 수 있는 게 아니라, **승인 대기 상태**가 돼요.

```
원장님 정보 입력
      ↓
Firestore academies 컬렉션에 문서 생성
      ↓
status: 'pending'  ← 이 상태! (아직 승인 안 됨)
      ↓
승인 대기 화면으로 이동
```

**저장되는 정보:**
```typescript
{
  name: "하늘학원",
  academy_type: "학원",       // 학원 / 교습소 / 개인과외
  academy_code: "A3K9PQ",    // 선생님 가입용 코드 (자동 생성)
  owner_name: "홍길동",
  owner_phone: "010-1234-5678",
  address: "서울시 강남구...",
  status: "pending",          // 승인 대기 상태
  plan: "free",
  submitted_at: serverTimestamp(),
}
```

> **academy_code란?** 선생님이 이 학원에 가입할 때 입력하는 6자리 코드예요.
> 학원 등록 시 자동으로 생성됩니다. (예: "A3K9PQ")

---

## 7. 코드 입력 — app/(auth)/code-input.tsx

### 역할별 코드 종류

| 역할 | 입력하는 코드 | 검색하는 위치 |
|------|-------------|-------------|
| 선생님 | 학원코드 | `academies` 컬렉션 |
| 학생 | 반 코드 | `classes` 컬렉션 |
| 학부모 | 자녀 연동코드 | `users` 컬렉션 |

### 학생 가입 시 연동코드 자동 발급

```
학생이 반 코드 입력 → 검증 성공
              ↓
linkCode = generateLinkCode()  // 예: "B7XM2Q"
              ↓
users 문서에 link_code: "B7XM2Q" 저장
              ↓
나중에 학부모가 이 코드로 자녀와 연결
```

### 브루트포스 방지 (해킹 방어)

**비유:** ATM에서 비밀번호를 5번 틀리면 카드가 잠기는 것처럼요.

```
코드 입력 실패 1회 → 경고 (1/5회)
코드 입력 실패 2회 → 경고 (2/5회)
...
코드 입력 실패 5회 → 30초 잠금! ⛔
                      (30 → 29 → ... → 0 카운트다운)
                              ↓
                         잠금 해제 → 다시 입력 가능
```

```typescript
const MAX_ATTEMPTS = 5   // 최대 시도 횟수
const LOCK_SECONDS = 30  // 잠금 시간

if (attemptCount >= MAX_ATTEMPTS) {
  setIsLocked(true)      // 입력 차단
  startLockTimer()       // 30초 카운트다운 시작
}
```

---

## 8. 승인 대기 화면 — app/(auth)/pending.tsx

원장님이 학원을 등록하면 이 화면에 머물러요.

```
┌─────────────────────────────────┐
│              E                  │
│         승인 대기 중이에요         │
│    관리자 승인 후 모든 기능 이용 가능│
│                                 │
│ ✅ 지금 사용 가능한 기능           │
│  ✓ 학생 최대 3명 등록             │
│  ✓ 반 1개 운영                   │
│  ✓ 기본 출결·숙제·공지            │
│                                 │
│ 🔒 승인 후 사용 가능한 기능        │
│  🔒 선생님 초대                  │
│  🔒 Pro 플랜 전환                │
│                                 │
│         [로그아웃]               │
└─────────────────────────────────┘
```

**왜 기능을 제한하나?** 가짜 학원이 만들어지는 것을 막기 위해서예요.
파일럿 단계에서는 Firestore 콘솔에서 `status`를 `active`로 직접 바꿔서 승인해요.

---

## 9. Cloud Functions — 서버에서 실행되는 코드

### Cloud Functions가 뭔가?

**비유:** 카페에서 직원(Cloud Function)이 주방(서버)에서 커피를 만들어주는 것처럼요.
보안이 필요하거나 복잡한 작업은 앱에서 직접 하지 않고 서버에서 해요.

```
앱 (클라이언트)
     ↓ 요청
Cloud Function (서버)  ←── 비밀 키/어드민 권한 사용
     ↓ 결과
앱 (클라이언트)
```

### functions/src/auth/kakaoLogin.ts

```
[앱] 카카오 액세스 토큰 → [서버] kakaoLogin 함수
                                  ↓
                         카카오 API에 "이 토큰 맞아?" 확인
                                  ↓
                         Firebase Custom Token 발급
                                  ↓
                    [앱] Custom Token으로 Firebase 로그인
```

**핵심 코드 흐름:**
```typescript
// 1. 카카오 서버에서 사용자 정보 가져오기
const kakaoUser = await axios.get('https://kapi.kakao.com/v2/user/me', {
  headers: { Authorization: `Bearer ${accessToken}` }
})

// 2. 카카오 ID로 Firebase Custom Token 발급
const customToken = await admin.auth().createCustomToken(`kakao:${kakaoUser.id}`)

// 3. 앱에 전달
return { customToken }
```

### functions/src/auth/createStudentAccount.ts

선생님이 학생 계정을 **대신 만들어주는** 기능이에요.
(학생이 스마트폰이 없거나, 선생님이 일괄 등록할 때 사용)

```
선생님 앱에서 학생 이름 입력
              ↓
Cloud Function 실행
              ↓
가상 이메일 자동 생성: s_A3K9PQ@dev-app-first.app
임시 비밀번호 생성:    abc1!xyz
              ↓
Firebase Auth + Firestore에 학생 계정 생성
              ↓
인쇄용 카드 데이터 반환:
  ┌───────────────────────┐
  │ 학생: 홍길동            │
  │ 이메일: s_A3K9PQ@...   │
  │ 임시비밀번호: abc1!xyz  │
  │ 연동코드: B7XM2Q       │
  └───────────────────────┘
              ↓
선생님이 프린트해서 학생에게 전달
```

**보안 체크:**
```typescript
// teacher 또는 admin 역할만 이 함수를 호출할 수 있음
if (callerRole !== 'teacher' && callerRole !== 'admin') {
  throw new HttpsError('permission-denied', '선생님만 학생 계정을 생성할 수 있습니다')
}
```

---

## 10. Firestore Security Rules 업데이트

### 학원 상태(status)에 따른 기능 제한

Phase 1에서 만든 Rules에 학원 승인 상태 체크를 추가했어요.

**추가된 헬퍼 함수:**

```javascript
// 학원이 완전 승인된 상태인지 확인 (active만)
function isAcademyActive(academyId) {
  return get(academies/academyId).data.status == 'active'
}

// 학원이 최소한 대기 상태인지 확인 (pending 또는 active)
// rejected(거부된) 학원은 false 반환
function isAcademyPendingOrActive(academyId) {
  return get(academies/academyId).data.status in ['pending', 'active']
}
```

**학원 상태별 가능한 작업:**

| 기능 | pending (대기) | active (승인) | rejected (거부) |
|------|:---:|:---:|:---:|
| 숙제 출제 | ✅ | ✅ | ❌ |
| 출결 입력 | ✅ | ✅ | ❌ |
| 공지 작성 | ✅ | ✅ | ❌ |
| 반 생성 | ✅ (1개까지) | ✅ | ❌ |
| 학원 설정 수정 | ❌ | ✅ | ❌ |

> **⚠️ 반 1개 제한**은 Rules에서 문서 개수를 세는 것이 불가능해서,
> 앱 코드와 Cloud Functions에서 추가로 검증해요.

---

## 11. Phase 2에서 배운 핵심 개념 정리

### 개념 1: 소셜 로그인의 원리 (OAuth)

```
사용자 → 소셜 서비스에 로그인
         ↓
       소셜 서비스가 "토큰" 발급
         ↓
       Firebase에 토큰 제출
         ↓
       Firebase가 로그인 처리
```

직접 비밀번호를 우리 서버에 저장하지 않고, 큰 회사(Google/Apple/카카오)의 인증을 믿는 방식이에요.

### 개념 2: 서버리스(Serverless)

**비유:** 식당 대신 배달 음식을 시키는 것처럼, 서버를 직접 운영하지 않아요.

Cloud Functions = 필요할 때만 켜지는 서버.
요청이 오면 자동으로 실행되고, 끝나면 자동으로 꺼져요.
서버 관리 비용 없이 서버 기능을 쓸 수 있어요.

### 개념 3: 브루트포스(Brute Force) 공격

**비유:** 열쇠가 1000개라면 하나씩 다 꽂아보는 것처럼,
모든 코드 조합을 자동으로 입력해보는 해킹 방법이에요.

```
나쁜 사람의 시도:
AAAAAA → 실패
AAAAAB → 실패
AAAAAC → 실패
... (계속 시도)
```

**방어 방법:** 5번 실패하면 30초 동안 입력 자체를 막아버려요.

### 개념 4: Custom Token

카카오처럼 Firebase가 직접 지원하지 않는 서비스를 쓸 때 사용해요.

```
일반 로그인:  사용자 → Firebase
Custom Token: 사용자 → 우리 서버 → Firebase
              (우리 서버가 중간에서 "검증됐어요" 보증)
```

### 개념 5: ref (useRef)

OTP 6칸처럼 여러 입력 칸이 있을 때, 각 칸을 직접 제어하기 위해 사용해요.

```typescript
// 6개의 입력 칸에 대한 참조(주소) 보관
const inputRefs = useRef<TextInput[]>([])

// 3번째 칸으로 강제 포커스 이동
inputRefs.current[2].focus()
```

**비유:** 리모컨으로 TV 채널을 바꾸는 것처럼,
ref는 화면 요소를 직접 조작하는 리모컨이에요.

---

## 12. 파일별 역할 요약

```
Phase 2에서 새로 만든 파일들:

lib/
└── auth.ts              ← 인증 관련 모든 함수 (13개)

app/(auth)/
├── login.tsx            ← 로그인 화면 (이메일 + 소셜 3종)
├── register.tsx         ← 회원가입 화면
├── phone-verify.tsx     ← 휴대폰 OTP 인증 (6칸 박스 UI)
├── role-select.tsx      ← 역할 선택 (4개 카드)
├── academy-register.tsx ← 학원 등록 (원장님 전용)
├── code-input.tsx       ← 코드 입력 (선생님/학생/학부모)
└── pending.tsx          ← 학원 승인 대기

components/
└── StepIndicator.tsx    ← 온보딩 단계 표시 (재사용 가능)

functions/src/auth/
├── kakaoLogin.ts        ← 카카오 로그인 Cloud Function
└── createStudentAccount.ts ← 학생 계정 직접 생성

firestore.rules          ← 학원 승인 상태 체크 규칙 추가
```

---

## Phase 2 완료 체크리스트

- ✅ 이메일/비밀번호 로그인·회원가입
- ✅ Google 로그인
- ✅ Apple 로그인 (iOS 전용)
- ✅ 카카오 로그인 (Cloud Function 연동)
- ✅ 휴대폰 OTP 인증 (6칸 UI + 자동 포커스)
- ✅ 역할 선택 화면 (4개 카드 UI)
- ✅ 학원 등록 (원장님, status: pending으로 생성)
- ✅ 학원코드 입력 (선생님)
- ✅ 반 코드 입력 + 연동코드 자동 발급 (학생)
- ✅ 자녀 연동코드 입력 (학부모)
- ✅ 브루트포스 방지 (5회/30초)
- ✅ 승인 대기 화면 (기능 제한 안내)
- ✅ 학생 계정 직접 생성 (선생님용 Cloud Function)
- ✅ Firestore Rules 업데이트 (rejected 학원 차단)

---

## 다음 단계 (Phase 3)

Phase 2가 "건물의 출입문(인증)"을 만든 것이라면,
Phase 3은 "건물 안의 핵심 기능"을 만드는 거예요.

- 숙제 스캔 제출 (카메라 촬영 → 자동 보정 → Firebase Storage 업로드)
- 선생님 숙제 출제 및 피드백 (👍/💧)
- 실시간 출결 명렬표
- 공지사항 작성 및 알림
