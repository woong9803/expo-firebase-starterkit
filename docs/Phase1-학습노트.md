# Phase 1 학습 노트 — dev-app-first 프로젝트 기초 세팅

> 이 문서는 Phase 1에서 만든 파일들이 **무엇인지, 왜 필요한지**를 설명합니다.
> 프로그래밍을 처음 접하는 분도 이해할 수 있도록 비유와 함께 설명합니다.

---

## 전체 구조 한눈에 보기

```
dev-app-first 앱
│
├── Firebase (백엔드 서버) ──── 구글이 제공하는 서버. 우리가 서버를 직접 만들 필요 없음
│   ├── Auth          ──── 로그인/회원가입 담당
│   ├── Firestore     ──── 데이터베이스 (학원, 사용자, 숙제 등 저장)
│   └── Storage       ──── 이미지 파일 저장 (숙제 사진 등)
│
└── Expo 앱 (프론트엔드) ────── 폰에서 실행되는 앱
    ├── app/          ──── 화면들 (로그인 화면, 홈 화면 등)
    ├── lib/          ──── Firebase 연결 설정
    ├── store/        ──── 앱 전체에서 공유하는 데이터 보관함
    ├── types/        ──── 데이터 형식 정의
    └── constants/    ──── 앱에서 쓰는 텍스트 모음
```

---

## 1. Firebase 연결 설정

### `lib/firebase.ts` — Firebase와 앱을 연결하는 플러그

**비유:** 집에 전기를 연결하는 것처럼, 앱과 Firebase 서버를 연결하는 파일이에요.

```
Firebase 서버  ←───── lib/firebase.ts ─────→  우리 앱
(구글 클라우드)                               (Expo 앱)
```

**이 파일이 하는 일:**
- Firebase에 접속하는 데 필요한 비밀번호(API Key 등)를 설정
- 앱에서 사용할 3가지 Firebase 서비스를 준비

```typescript
// 이 3가지를 다른 파일에서 가져다 씀
export const auth    // 로그인/회원가입 담당
export const db      // 데이터베이스 담당
export const storage // 파일 저장 담당
```

**중요한 설계 결정:**
- `AsyncStorage`를 사용 → 로그인 상태를 폰에 저장 → 앱을 껐다 켜도 로그인 유지
- `getApps().length === 0` 체크 → 앱을 두 번 초기화하는 실수 방지

---

## 2. 환경변수

### `.env.local` — 비밀 정보를 안전하게 보관하는 금고

**비유:** 집 열쇠를 현관에 붙여놓으면 안 되듯이, Firebase 비밀번호를 코드에 직접 쓰면 안 돼요.

```
❌ 잘못된 방법:  apiKey: "AIzaSyAqBBFy46y..." (코드에 직접 작성 → 깃허브에 올라가면 위험!)
✅ 올바른 방법:  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY (.env.local에서 읽어옴)
```

**규칙:**
- `EXPO_PUBLIC_` 으로 시작하는 변수 → 앱 코드에서 읽을 수 있음
- `EXPO_PUBLIC_` 없는 변수 → 서버(Cloud Functions)에서만 사용
- `.gitignore`에 등록 → 깃허브에 절대 올라가지 않음

---

## 3. 데이터 구조 정의

### `types/index.ts` — 데이터의 "양식지"

**비유:** 학원 등록할 때 이름, 생년월일, 연락처를 적는 양식지처럼,
Firestore에 저장할 데이터의 형식을 미리 정해놓은 파일이에요.

**왜 필요한가?** TypeScript는 실수를 잡아주는 검사관이에요.
```
예: user.nmae = "홍길동"  → ❌ 오류! (nmae가 아니라 name이에요)
    user.name = "홍길동"  → ✅ 정상
```

**정의된 데이터 형식들:**

| 이름 | 설명 | 저장 위치 |
|------|------|-----------|
| `User` | 사용자 정보 (이름, 역할, 학원ID 등) | `users/{uid}` |
| `Academy` | 학원 정보 (이름, 플랜, 승인 상태 등) | `academies/{academyId}` |
| `Class` | 반 정보 (반 이름, 담당 선생님 등) | `classes/{classId}` |
| `Homework` | 숙제 정보 (제목, 마감일 등) | `homeworks/{hwId}` |
| `Submission` | 숙제 제출물 (이미지, 상태, 피드백) | `homeworks/{hwId}/submissions/{studentUid}` |
| `AttendanceRecord` | 출결 기록 (출석/지각/결석/휴원) | `attendances/{classId_date}/records/{uid}` |
| `Notice` | 공지사항 | `notices/{noticeId}` |
| `AppNotification` | 앱 알림 | `notifications/{notifId}` |
| `AppConfig` | 앱 버전 설정 | `appConfig/v1` |

**User 타입 예시:**
```typescript
interface User {
  uid: string          // 고유 ID (Firebase가 자동 생성)
  name: string         // 이름 "홍길동"
  role: 'admin' | 'teacher' | 'student' | 'parent'  // 역할 4가지 중 하나만 가능
  academy_id: string   // 소속 학원 ID
  phone_number: string // 연락처
  ...
}
```

---

## 4. Firestore 데이터베이스 구조

### Firestore는 어떻게 생겼나?

**비유:** 엑셀 파일이 아니라 폴더 안에 폴더가 있는 구조예요.

```
Firestore (데이터베이스)
│
├── academies/          ← 학원 폴더
│   └── abc123/         ← 특정 학원 문서
│       name: "하늘학원"
│       status: "active"
│
├── users/              ← 사용자 폴더
│   └── user001/        ← 특정 사용자 문서
│       name: "홍길동"
│       role: "teacher"
│       academy_id: "abc123"
│
├── homeworks/          ← 숙제 폴더
│   └── hw001/          ← 특정 숙제 문서
│       title: "수학 1단원"
│       due_date: "2026-04-10"
│       │
│       └── submissions/         ← 제출물 (하위 폴더)
│           └── student001/      ← 학생별 제출물
│               image_urls: [...]
│               status: "submitted"
│
└── attendances/        ← 출결 폴더
    └── class01_2026-04-08/     ← 반ID_날짜
        └── records/
            └── student001/
                status: "present"
```

### `lib/firestore.ts` — Firestore 경로 모음집

**왜 필요한가?** 경로를 매번 직접 쓰면 오타가 생길 수 있어요.

```typescript
// ❌ 오타 위험
collection(db, 'homwworks')  // 오타! 오류 발생

// ✅ 헬퍼 함수 사용
Collections.homeworks()  // 오타 없음, 자동완성 지원
```

**사용 예시:**
```typescript
// 특정 학원 가져오기
const academyRef = Collections.academy('abc123')

// 특정 숙제의 제출물 목록
const submissionsRef = Collections.submissions('hw001')

// 출결 (반ID + 날짜 조합)
const attendanceRef = Collections.attendance('class01', '2026-04-08')
```

---

## 5. 전역 상태 관리

### `store/useAuthStore.ts` — 앱 전체 공유 메모장

**비유:** 학원 칠판처럼, 어느 교실에서든 볼 수 있는 공유 정보예요.
"지금 로그인한 사람이 누구인지"를 앱 전체에서 알 수 있게 해줘요.

```
로그인 화면 ──┐
홈 화면     ──┤  → useAuthStore → { user: 홍길동, role: teacher, academy: 하늘학원 }
설정 화면   ──┘
(어느 화면에서든 이 정보에 접근 가능)
```

**보관하는 정보:**
```typescript
user        // 로그인한 사람 정보 (이름, 역할 등)
isLoading   // 로그인 확인 중인지 여부 (true/false)
academyId   // 소속 학원 ID
academy     // 소속 학원 상세 정보
```

**제공하는 기능:**
```typescript
setUser()      // 로그인 성공 시 사용자 정보 저장
setAcademy()   // 학원 정보 저장
clearUser()    // 로그아웃 시 모든 정보 초기화
```

---

## 6. 텍스트 상수

### `constants/strings.ts` — 앱에서 쓰는 모든 글자 모음

**비유:** 메뉴판처럼, 앱에서 보여줄 텍스트를 한 곳에 모아놨어요.

**왜 필요한가?**
```typescript
// ❌ 여러 곳에 흩어져 있으면 → 글자 바꿀 때 다 찾아서 수정해야 함
<Text>로그인</Text>
<Text>로그인</Text>
<Text>로그인</Text>

// ✅ 한 곳에서 관리 → strings.ts만 수정하면 전체 반영
<Text>{strings.auth.login}</Text>
```

**구성:**
```typescript
strings.auth.login      // "로그인"
strings.auth.signup     // "회원가입"
strings.roles.admin     // "원장님"
strings.roles.teacher   // "선생님"
strings.homework.submit // "제출"
strings.errors.codeNotFound // "코드를 찾을 수 없어요"
```

---

## 7. 화면 구조 (라우팅)

### `app/` 폴더 — 앱의 지도

**비유:** 건물 층별 안내도처럼, 어떤 화면이 있는지 보여줘요.

```
app/
├── index.tsx              ← 앱 시작점 (로딩 스피너)
├── _layout.tsx            ← 전체 틀 (로그인 여부 확인)
│
├── (auth)/                ← 로그인 전 화면 그룹
│   ├── _layout.tsx
│   ├── login.tsx          ← 로그인 화면
│   ├── register.tsx       ← 회원가입 화면
│   ├── role-select.tsx    ← 역할 선택 화면
│   ├── code-input.tsx     ← 학원코드/반코드 입력
│   └── pending.tsx        ← 학원 승인 대기 화면
│
└── (app)/                 ← 로그인 후 화면 그룹
    ├── _layout.tsx        ← 역할별 분기 (핵심!)
    ├── (admin)/index.tsx  ← 원장님 홈
    ├── (teacher)/index.tsx← 선생님 홈
    ├── (student)/index.tsx← 학생 홈
    └── (parent)/index.tsx ← 학부모 홈
```

### 앱 실행 흐름

```
앱 시작
  ↓
index.tsx (로딩 스피너 표시)
  ↓
_layout.tsx가 Firebase에 물어봄: "지금 로그인한 사람 있어?"
  ↓
  ├── 없음 → /(auth)/login 으로 이동 → 로그인 화면 표시
  │
  └── 있음 → /(app) 으로 이동
                ↓
              (app)/_layout.tsx 가 역할 확인
                ↓
                ├── admin   → (admin)/index.tsx
                ├── teacher → (teacher)/index.tsx
                ├── student → (student)/index.tsx
                └── parent  → (parent)/index.tsx
```

---

## 8. 보안 규칙

### `firestore.rules` — 데이터베이스 경비원

**비유:** 건물에 경비원이 있듯이, 누가 어떤 데이터에 접근할 수 있는지 통제해요.

**핵심 원칙:**
1. **로그인 안 한 사람** → 아무것도 못 봄
2. **다른 학원 데이터** → 못 봄 (내 학원 데이터만 볼 수 있음)
3. **다른 사람 제출물** → 학생은 자기 것만, 선생님은 모두 볼 수 있음
4. **알림** → 내가 받은 것만 읽을 수 있음, 클라이언트에서 직접 쓰기 불가

**역할별 권한 요약:**

| 기능 | 원장 | 선생님 | 학생 | 학부모 |
|------|------|--------|------|--------|
| 학원 설정 변경 | ✅ | ❌ | ❌ | ❌ |
| 반 생성/삭제 | ✅ | ✅ | ❌ | ❌ |
| 숙제 출제 | ✅ | ✅ | ❌ | ❌ |
| 숙제 제출 | ❌ | ❌ | ✅ | ❌ |
| 출결 입력 | ✅ | ✅ | ❌ | ❌ |
| 공지 작성 | ✅ | ✅ | ❌ | ❌ |

### `storage.rules` — 파일 저장소 경비원

- 숙제 이미지: 학생 본인만 업로드 가능, 최대 10MB, 이미지 파일만
- 프로필 이미지: 본인만 업로드 가능, 최대 5MB

---

## 9. 앱 설정

### `app.config.ts` — 앱의 주민등록증

**앱의 기본 정보를 등록하는 파일이에요.**

| 항목 | 값 |
|------|-----|
| 앱 이름 | dev-app-first |
| iOS 번들 ID | com.dev-app-first.app |
| Android 패키지명 | com.dev-app-first.app |
| 딥링크 스킴 | edu-one-pass:// |

> **딥링크 스킴이란?** 카카오톡 링크를 클릭했을 때 앱이 자동으로 열리는 기능에 필요한 주소예요.

---

## 10. Phase 1에서 배운 핵심 개념 정리

### 개념 1: 프론트엔드 vs 백엔드

```
사용자가 보는 화면 = 프론트엔드 (Expo 앱)
데이터를 저장하는 곳 = 백엔드 (Firebase)
```

### 개념 2: 환경변수

비밀 정보(API Key 등)는 코드에 직접 쓰지 않고 `.env.local` 파일에 보관.
깃허브에 올라가지 않도록 `.gitignore`에 등록 필수.

### 개념 3: TypeScript

JavaScript에 "타입 검사" 기능을 추가한 언어.
오타나 잘못된 데이터 형식을 실행 전에 미리 잡아줌.

### 개념 4: 전역 상태 (Zustand)

여러 화면에서 공통으로 사용하는 데이터를 한 곳에서 관리.
"로그인한 사용자 정보"처럼 어디서든 필요한 데이터에 활용.

### 개념 5: 라우팅 (expo-router)

파일 이름이 곧 화면 주소가 됨.
```
app/(auth)/login.tsx → /(auth)/login 주소로 접근 가능
```

### 개념 6: Security Rules

앱 코드에서 권한을 체크하는 건 우회 가능 → 위험.
Firestore Rules에서 서버 단에서 권한을 체크해야 진짜 안전.

---

## Phase 1 완료 체크리스트

- ✅ Firebase 연결 (Auth, Firestore, Storage)
- ✅ TypeScript 타입 정의 완성
- ✅ UI 텍스트 상수 파일
- ✅ 전역 상태 관리 (Zustand)
- ✅ 환경변수 설정
- ✅ 라우트 파일 구조 생성
- ✅ 인증 상태에 따른 화면 분기 로직
- ✅ Firestore Security Rules
- ✅ Storage Rules
- ✅ 앱 실행 확인 (로그인 화면 표시)

---

## 다음 단계 (Phase 2)

Phase 1이 "건물의 뼈대"를 세운 것이라면,
Phase 2는 "실제 방을 꾸미는 것"이에요.

- 로그인/회원가입 UI 디자인
- 소셜 로그인 (Google, Apple, 카카오)
- 휴대폰 번호 OTP 인증
- 역할 선택 화면
- 학원코드/반코드 입력 화면
