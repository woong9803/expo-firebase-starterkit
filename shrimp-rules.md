# dev-app-first — AI Agent 개발 지침

> 이 문서는 AI Coding Agent 전용입니다. 개발자 문서가 아닙니다.

---

## 1. 프로젝트 개요

- **앱 이름**: dev-app-first (학원 관리 앱)
- **스택**: React Native + Expo + TypeScript (strict) / Firebase (Firestore·Auth·Storage·FCM·Functions)
- **웹 대시보드**: React + Vite + TailwindCSS + React Query (admin 전용)
- **사용자 역할**: `admin`(원장) · `teacher`(선생님) · `student`(학생) · `parent`(학부모)

---

## 2. 디렉토리 구조 및 역할

```
app/
├── (auth)/          # 로그인 전 화면 (가입·로그인·OTP)
├── (app)/
│   ├── _layout.tsx  # 역할(role) 분기 유일한 지점
│   ├── (admin)/     # 원장 전용
│   ├── (teacher)/   # 선생님 전용
│   ├── (student)/   # 학생 전용
│   ├── (parent)/    # 학부모 전용
│   └── shared/      # 역할 공유 화면 (출결·숙제 등)

components/          # 2곳 이상에서 쓰이는 재사용 컴포넌트만
lib/
└── firebase.ts      # Firebase 초기화 유일한 지점
store/               # Zustand 전역 상태
types/
└── index.ts         # 모든 TypeScript 타입 정의
constants/
└── strings.ts       # 모든 UI 문자열 (한글/영문 하드코딩 금지)
functions/
├── auth/            # kakaoCustomToken
├── homework/        # sendHomeworkDueAlert (onSchedule)
├── academy/         # onAcademyApproved, deactivateExpiredAcademies
├── notifications/   # FCM 발송 공통 헬퍼
└── index.ts         # 함수 export 진입점
```

---

## 3. 파일 동시 수정 규칙 (필수)

| 작업 | 반드시 함께 수정할 파일 |
|------|----------------------|
| Firestore 필드 추가/변경 | `types/index.ts` 타입 정의 동시 업데이트 |
| UI 문자열 추가 | `constants/strings.ts`에 먼저 추가 후 import |
| 새 역할별 화면 추가 | `app/(app)/_layout.tsx` role 분기 확인 |
| Cloud Function 추가 | `functions/index.ts`에 export 추가 |
| FCM 발송 로직 추가 | `functions/notifications/` 헬퍼 사용 (직접 작성 금지) |

---

## 4. 코딩 규칙

### UI 텍스트
- 모든 UI 문자열 → `constants/strings.ts` import 필수
- **금지**: 컴포넌트 내 한글/영문 문자열 직접 작성

### 컴포넌트
- props 타입: 컴포넌트 상단 `interface Props { }` 선언 — 인라인 타입 금지
- 스타일: `StyleSheet.create()` 사용 — 인라인 스타일 객체 직접 작성 금지
- 화면(Screen): `app/` 안에만 위치
- 재사용 컴포넌트: 2곳 이상 사용 시 `components/`로 분리 필수

### 상태관리
- 전역 상태 → `store/` Zustand만 사용
- **금지**: 컴포넌트 간 prop drilling

### 타입
- 모든 타입은 `types/index.ts`에서 import
- 컴포넌트·함수 파일에 타입 직접 정의 금지 (Props 인터페이스 제외)

---

## 5. Firebase 사용 규칙

### 클라이언트 앱
- `db`, `auth`, `storage` → `lib/firebase.ts`에서만 import
- 마감 시간 판단 → `serverTimestamp()` 필수 / `new Date()` 비교 금지
- 실시간 리스너 (`onSnapshot`) → `useEffect` cleanup에서 반드시 구독 해제

```ts
useEffect(() => {
  const unsub = onSnapshot(ref, handler)
  return () => unsub()  // 필수
}, [])
```

- 숙제 이미지 업로드 전 클라이언트 압축 필수 (200KB 이하 목표)
- 이미지 최대 5장 제한 → UI와 Firestore 저장 양쪽에서 모두 검증

### Cloud Functions
- Admin SDK → `functions/lib/admin.ts`에서만 초기화
- `onCall` 함수 에러 → `throw new HttpsError(...)` 사용 (일반 `throw Error` 금지)
- Firestore 다중 쓰기 → `batch` 또는 `transaction` 사용 (개별 `set()` 반복 금지)
- `onSchedule` 함수 → 멱등성(idempotent) 보장 필수

### 환경변수
- Expo 앱 변수 → `EXPO_PUBLIC_` 접두사 필수
- `EXPO_PUBLIC_` 변수에 시크릿·Admin Key 절대 포함 금지
- 시크릿이 필요한 요청 → Cloud Functions 경유 필수
- 카카오 Admin Key → `functions/.env`에만 저장

---

## 6. expo-router 라우팅 규칙

- 역할(role) 분기 → `app/(app)/_layout.tsx` 단 한 곳에서만 처리
- **금지**: 개별 화면 파일에서 role 조건 분기
- 공유 화면(출결·숙제 등) → `app/(app)/shared/`에 위치 (역할별 폴더 중복 생성 금지)
- 딥링크·푸시 알림 이동 → `router.push()` 사용
- `router.replace()` → 뒤로가기 불필요한 경우만 사용
- `users/{uid}.academy_id` 없으면 온보딩으로 리다이렉트

---

## 7. Firestore 데이터 구조

| 컬렉션 경로 | 설명 |
|------------|------|
| `academies/{academyId}` | 학원 최상위 문서 |
| `users/{uid}` | 사용자 (역할·학원 소속) |
| `classes/{classId}` | 반 |
| `homeworks/{homeworkId}` | 숙제 |
| `homeworks/{homeworkId}/submissions/{studentUid}` | 숙제 제출물 (서브컬렉션) |
| `attendances/{classId_date}` | 출결 문서 (키: `classId_YYYY-MM-DD`) |
| `attendances/{classId_date}/records/{studentUid}` | 출결 개별 기록 (서브컬렉션) |
| `notices/{noticeId}` | 공지사항 |
| `notifications/{notificationId}` | 앱 내 알림 |
| `app_config/version` | 최소 버전 강제 업데이트 설정 |

---

## 8. 역할별 권한

| 기능 | admin | teacher | student | parent |
|------|:-----:|:-------:|:-------:|:------:|
| 학원 설정 변경 | ✓ | ✗ | ✗ | ✗ |
| 선생님 초대/삭제 | ✓ | ✗ | ✗ | ✗ |
| 학생 비활성화 | ✓ | ✓ | ✗ | ✗ |
| 반 생성/삭제 | ✓ | ✓ | ✗ | ✗ |
| 담당 선생님 지정 | ✓ | ✓(본인 반) | ✗ | ✗ |
| 학생 반 이동 | ✓ | ✓ | ✗ | ✗ |
| 출결·숙제·공지 관리 | ✓ | ✓ | ✗ | ✗ |
| 출결 엑셀 내보내기 | ✓ | ✓ | ✗ | ✗ |
| 숙제 제출 | ✗ | ✗ | ✓ | ✗ |
| 결석 사유 전송 | ✗ | ✗ | ✗ | ✓ |

- 권한 검증 → Firestore/Storage Security Rules에서 반드시 재검증 (클라이언트 조건부 렌더링만으로 불충분)
- Pro 기능 → Rules에서 `academies.plan` 체크 필수
- 학원 승인 상태 → Rules에서 `academies.status` 체크 필수

---

## 9. 학원 승인 상태 & Pro 플랜 제한

### 학원 상태 (academies.status)
| 상태 | 값 | 제한 |
|------|----|------|
| 승인 대기 | `pending` | 학생 최대 3명, 반 1개, 선생님 초대 불가, Pro 전환 불가 |
| 승인 완료 | `active` | 정상 운영 |
| 반려 | `rejected` | 로그인 차단 |

- 30일 이내 미승인 → 자동 비활성화 → 7일 유예 후 완전 삭제
- 파일럿 단계: Firestore `status` 수동 변경으로 승인 처리

### 구독 플랜 (academies.plan)
| 플랜 | 값 | 설명 |
|------|----|------|
| 무료 | `free` | 기본 기능만 |
| 체험 | `trial` | 14일 무료 체험 (`trial_ends_at` 만료 체크) |
| 유료 | `pro` | 전체 기능 |

---

## 10. Cloud Functions 트리거 선택 기준

| 유형 | 사용 상황 |
|------|----------|
| `onCall` | 앱에서 직접 호출 (예: kakaoCustomToken) |
| `onDocumentCreated` | Firestore 문서 생성 감지 |
| `onDocumentUpdated` | Firestore 문서 변경 감지 (예: 승인 상태 변경 → FCM) |
| `onSchedule` | 주기적 자동 실행 (예: 미제출 알림, 비활성화) |

### 주요 함수 목록
- `kakaoCustomToken` (onCall) — 카카오 → Firebase Custom Token
- `sendHomeworkDueAlert` (onSchedule, 매일 18:00) — 미제출 학부모 FCM
- `onFeedbackCreated` (onDocumentUpdated) — 피드백 등록 → 학생·학부모 FCM
- `onAcademyApproved` (onDocumentUpdated) — status:active → 학원코드 발급 + FCM
- `deactivateExpiredAcademies` (onSchedule, 매일 03:00) — 30일 미승인 비활성화
- `cleanupDeletedUser` (onDocumentUpdated) — deleted_at 후 30일 완전 삭제
- `backupFirestore` (onSchedule, 매일 03:00) — Storage `/backups/YYYY-MM-DD/`

---

## 11. 도메인 용어 — 변수명 통일

| 한국어 | 영문 변수명 |
|--------|-----------|
| 원장님 | `admin` |
| 선생님 | `teacher` |
| 학생 | `student` |
| 학부모 | `parent` |
| 학원 | `academy` |
| 반 | `class` |
| 학원코드 | `academyCode` |
| 반 코드/초대코드 | `inviteCode` |
| 연동코드 | `linkCode` |
| 담당 선생님 | `headTeacher` |
| 숙제 | `homework` |
| 제출물 | `submission` |
| 지각 제출 | `lateSubmission` (`isLate: true`) |
| 스트릭 | `streak` |
| 피드백 | `feedback` (👍=pass, 💧=retry) |
| 출결 | `attendance` |
| 출석 | `present` |
| 지각 | `late` |
| 결석 | `absent` |
| 휴원 | `onLeave` |
| 결석 사유 | `reason` |
| 명렬표 | `rosterTable` |

---

## 12. 워크플로우 — 코드 수정 후 검증 순서

1. 타입 체크: `npx tsc --noEmit`
2. 관련 파일 테스트: `npx jest --testPathPattern=<수정한기능>`
3. 린트: `npx eslint <수정한파일경로>`

---

## 13. 절대 금지 사항

- UI 문자열(한글·영문) 컴포넌트 내 하드코딩
- `lib/firebase.ts` 외 다른 파일에서 Firebase 재초기화
- 마감 판단 시 `new Date()` 사용 (반드시 `serverTimestamp()`)
- `EXPO_PUBLIC_` 변수에 시크릿·Admin Key 포함
- 카카오 Admin Key를 클라이언트 코드에 포함
- `app/(app)/_layout.tsx` 외의 파일에서 role 분기 처리
- 개별 화면에서 역할별 같은 화면을 중복 생성 (shared/ 사용)
- `onCall` 함수에서 일반 `throw Error` 사용 (`HttpsError` 필수)
- Firestore 다중 쓰기 시 개별 `set()` 반복 (batch/transaction 필수)
- 인라인 스타일 객체 직접 작성 (StyleSheet.create() 필수)
- props drilling (Zustand store 사용)
- `onSnapshot` 구독 해제 누락
- 숙제 이미지 5장 초과 허용 (UI + Firestore 양쪽 검증 필수)
- `functions/lib/admin.ts` 외 파일에서 Admin SDK 초기화
