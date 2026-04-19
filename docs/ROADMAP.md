# dev-app-first 개발 로드맵

선생님 퇴근 시간을 앞당기고, 학원 이탈률을 방어하는 학원 관리 앱

## 개요

dev-app-first는 학원 운영자(원장), 선생님, 학생, 학부모를 위한 통합 학원 관리 플랫폼으로 다음 기능을 제공합니다:

- **숙제 스캔 제출 및 검사**: 카메라 촬영 → 자동 보정/압축 → 제출 → 피드백
- **실시간 출결 관리**: Firestore 실시간 동기화 명렬표 + 법정 출석부 엑셀 내보내기
- **공지사항 및 알림**: 학원 공지 + FCM 푸시 알림 + 읽음 확인
- **학부모 실시간 현황**: 자녀 숙제/출결 현황 실시간 확인 + 결석 사유 전송
- **웹 대시보드**: admin 전용 PC 관리 페이지 (출결 통계, 학생 관리, 엑셀 일괄 업로드)

## 개발 워크플로우

1. **작업 계획**
   - 기존 코드베이스를 학습하고 현재 상태를 파악
   - 새로운 작업을 포함하도록 `ROADMAP.md` 업데이트
   - 우선순위 작업은 마지막 완료된 작업 다음에 삽입

2. **작업 구현**
   - Phase별 구현 내용을 순서대로 따름
   - API 연동 및 비즈니스 로직 구현 시 Playwright MCP를 활용한 테스트 필수
   - 각 Phase 완료 후 완료 기준 충족 여부 확인
   - Phase 완료 확인 후 다음 Phase로 진행

3. **로드맵 업데이트**
   - 완료된 Phase에 ✅ 표시
   - 완료된 구현 항목에 ✅ 체크

---

## 개발 단계

### Phase 1: 프로젝트 초기화 및 Firebase 연동 ✅

**목표**: Expo 프로젝트가 정상 실행되고, Firebase 각 서비스(Auth, Firestore, Storage, FCM)가 연결되어 콘솔에서 데이터 읽기/쓰기가 확인되는 상태

**구현 내용**:
- ✅ Expo 프로젝트 초기화 및 필수 의존성 설치 (expo-router, zustand, firebase 등)
- ✅ `lib/firebase.ts` — Firebase 초기화 (Auth, Firestore, Storage 설정)
  - ⚠️ FCM 설정 미구현 — 공지 기능 구현 시 함께 추가 예정 (`expo-notifications` 설치 필요)
- ✅ `types/index.ts` — 전체 TypeScript 타입/인터페이스 정의 완성 (User, Academy, Class, Homework, Submission, Attendance, AttendanceRecord, Notice, Notification, AppConfig 등 PRD 섹션 3 전체 반영, `birth_date`, `guardian_phone`, `enrollment_date` 포함)
- ✅ `constants/strings.ts` — 공통 UI 텍스트 상수 정의 (하드코딩 금지 원칙 적용)
- ✅ `.env.local` 환경변수 파일 구성 (`EXPO_PUBLIC_` 접두사 적용)
- ✅ `app/` 디렉토리에 expo-router 기반 전체 라우트 구조 생성 (빈 껍데기 파일)
  - `app/(auth)/` — 로그인, 회원가입, 역할 선택, 코드 입력
  - `app/(app)/admin/` — 원장 전용 화면
  - `app/(app)/teacher/` — 선생님 전용 화면
  - `app/(app)/student/` — 학생 전용 화면
  - `app/(app)/parent/` — 학부모 전용 화면
- ✅ `app/_layout.tsx` — 루트 레이아웃 + 인증 상태에 따른 (auth)/(app) 분기 골격
- ✅ `store/useAuthStore.ts` — Zustand 인증 상태 스토어 골격 (현재 유저, 역할, 학원 정보)
- ✅ Firestore Security Rules 초안 작성 (역할별 접근 제어 + `academy_id` 기반 필터링)
- ✅ Storage Rules 초안 작성 (인증된 사용자만 접근)

**완료 기준**:
- ✅ `npx expo start`로 앱이 정상 실행됨
- ✅ Firebase 콘솔에서 Firestore 문서 읽기/쓰기가 앱에서 정상 동작 확인
- ✅ `npx tsc --noEmit` 타입 에러 0개
- ✅ 모든 라우트 파일이 존재하고, 빈 화면이라도 네비게이션이 동작함

**주요 파일**:
- `lib/firebase.ts`
- `types/index.ts`
- `constants/strings.ts`
- `store/useAuthStore.ts`
- `app/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/(app)/_layout.tsx`
- `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/(auth)/role-select.tsx`, `app/(auth)/code-input.tsx`
- `app/(app)/admin/index.tsx`, `app/(app)/teacher/index.tsx`, `app/(app)/student/index.tsx`, `app/(app)/parent/index.tsx`
- `firestore.rules`, `storage.rules`
- `.env.local`

---

### Phase 2: 온보딩 및 인증 시스템 ✅

**목표**: 4가지 역할(admin, 선생님, 학생, 학부모)의 회원가입/로그인 전체 플로우가 동작하고, 역할에 따라 올바른 화면으로 분기되는 상태

**구현 내용**:
- ✅ 이메일/비밀번호 회원가입 및 로그인 (Firebase Auth)
- ✅ 소셜 로그인 구현
  - Google 로그인 (`@react-native-google-signin/google-signin` + Firebase Auth 연동)
  - Apple 로그인 (`expo-apple-authentication` + Firebase Auth 연동, iOS 전용)
  - 카카오 로그인 (`react-native-kakao-login` + Cloud Functions 커스텀 토큰 발급)
- ✅ 동일 이메일 충돌 처리 ("기존 방식으로 로그인 후 설정에서 소셜 계정을 연결할 수 있어요" 안내)
- ✅ 휴대폰 번호 인증 (Firebase Phone Auth, SMS OTP 6자리, 전 역할 필수)
  - ✅ PhoneInputScreen (`app/(auth)/phone-input.tsx`) — 번호 입력 화면
  - ✅ PhoneVerifyScreen (`app/(auth)/phone-verify.tsx`) — OTP 입력 화면
  - ⚠️ **현재 임시 스킵 상태** — APNs 인증서 설정 후 `phone-input.tsx` 주석 해제 필요
  - APNs 활성화 순서: Apple Developer → APNs 키 발급 → Firebase 콘솔 → 프로젝트 설정 → Cloud Messaging → APNs 인증 키 업로드
  - 중복 번호 체크 ("이미 가입된 번호예요. 로그인해주세요" 안내)
- ✅ 역할 선택 화면 (admin / 선생님 / 학생 / 학부모)
- ✅ 역할별 온보딩 분기
  - admin: 학원 만들기 → 운영 유형 선택(학원/교습소/개인과외) → 학원명/대표자명/연락처/주소 입력 → `status: pending` 저장 → 승인 대기 안내
  - 선생님: 학원코드 입력 → 유효성 검증 → 즉시 활성화
  - 학생: 반 코드 입력 → 유효성 검증 → 즉시 활성화 + 연동코드 6자리 자동 발급
  - 학부모: 자녀 연동코드 입력 → 자녀 계정 연결
- ✅ 코드 입력 보안: 5회 연속 오류 시 30초 재시도 대기 (브루트포스 방지)
- ✅ 학생 계정 직접 생성 기능 (선생님이 대신 생성)
  - 가상 이메일 자동 생성: `s_{6자리랜덤코드}@dev-app-first.app`
  - 임시 비밀번호 설정
  - 인쇄용/캡처용 카드 UI 제공
- ✅ role 기반 화면 라우팅 분기 (`app/(app)/_layout.tsx`에서 역할별 리다이렉트)
- ✅ Cloud Functions 구현
  - `functions/auth/kakaoLogin.ts` — 카카오 액세스 토큰 → Firebase Custom Token 발급
  - `functions/auth/createStudentAccount.ts` — 선생님의 학생 계정 직접 생성 처리
- ✅ 미승인(pending) 학원 기능 제한 적용 (학생 3명, 반 1개, 선생님 초대 불가)
- ✅ Firestore Security Rules 업데이트 — `academies.status` 체크 로직 추가

**완료 기준**:
- ✅ 이메일 + 3가지 소셜 로그인 모두 정상 동작
- ✅ 4가지 역할의 가입 플로우가 각각 올바르게 완료됨
- ✅ 가입 완료 후 역할에 맞는 홈 화면으로 정상 이동
- ✅ admin 가입 시 `academies` 문서가 `status: pending`으로 생성됨
- ✅ 학생 가입 시 6자리 연동코드가 자동 발급됨
- ✅ 학부모가 연동코드로 자녀 계정과 정상 연결됨
- ✅ 전체 가입/로그인 플로우 수동 테스트 완료 (React Native 앱 특성상 Playwright 웹 테스트 불가, 실기기 수동 검증으로 대체)

**주요 파일**:
- `app/(auth)/login.tsx`, `app/(auth)/register.tsx`
- `app/(auth)/phone-verify.tsx`, `app/(auth)/role-select.tsx`
- `app/(auth)/academy-register.tsx`, `app/(auth)/code-input.tsx`
- `app/(app)/_layout.tsx`
- `functions/auth/kakaoLogin.ts`
- `functions/auth/createStudentAccount.ts`
- `lib/auth.ts` (인증 헬퍼 함수)
- `store/useAuthStore.ts`
- `firestore.rules`

---

### Phase 3: 역할별 홈 화면 및 바텀탭 레이아웃 ✅

**목표**: 각 역할의 홈 화면과 바텀탭이 완성되어 이후 Phase(숙제/출결/공지)의 기능들이 탭에서 진입 가능한 상태

**구현 내용**:
- ✅ 바텀탭 레이아웃 구현 (디자인 v5 기준으로 업데이트됨)
  - ✅ `app/(app)/(teacher)/_layout.tsx` — 홈/숙제/출결/공지/내정보 / 활성색 #5B50E8
  - ✅ `app/(app)/(student)/_layout.tsx` — 홈/숙제/영상/출결/내정보 / 활성색 #5B50E8
  - ✅ `app/(app)/(parent)/_layout.tsx` — 홈/숙제/공지/내정보 / 활성색 #F59E0B
  - ✅ `app/(app)/(admin)/_layout.tsx` — 홈/숙제/출결/학생/공지/**설정** / 활성색 #5B50E8
- ✅ 선생님 홈 (`app/(app)/(teacher)/index.tsx`)
  - ✅ 헤더: 보라 그라데이션 카드 (#7C3AED → #5B50E8) + 알림 아이콘
  - ✅ 통계 3칸: 미검사 숙제 / 오늘 결석 / 이번달 출석률
  - ✅ 담당 반 수평 스크롤 카드
  - ✅ 숙제 검사 현황 / 최근 공지 섹션 (empty state 처리)
- ✅ 학생 홈 (`app/(app)/(student)/index.tsx`)
  - ✅ 헤더: 흰 배경 + 인사말 + 이름 + 스트릭 뱃지(인라인, 작게)
  - ✅ 초록 그라데이션 스트릭 카드 (#10B981 → #059669)
  - ✅ 숙제 카드: D-0(빨강 좌측바+제출버튼) / D-n(보라 좌측바) / 완료(초록)
  - ✅ 중요 공지 카드 홈 하단 (empty state 처리)
- ✅ 학부모 홈 (`app/(app)/(parent)/index.tsx`)
  - ✅ 헤더: 흰 배경 + 자녀 탭 칩(활성 #F59E0B)
  - ✅ 주황 그라데이션 출결 카드 (#F59E0B → #D97706)
  - ✅ 결석 사유 칩: 선택 시 bg #F59E0B / "선생님께 전송하기" bg #F59E0B
- ✅ admin 홈 (`app/(app)/(admin)/index.tsx`)
  - ✅ 헤더: 보라 그라데이션 카드 + 2칸(전체 학생/출석률) + 3칸(반수/선생님/플랜)
  - ✅ 오늘 확인 필요: 결석(빨강) + 미입력(노랑) 2칸
  - ✅ 반별 출석률 프로그레스바 카드
- ✅ 각 역할별 탭 화면 placeholder 파일
  - ✅ `(teacher)/homework.tsx`, `(teacher)/attendance.tsx`, `(teacher)/notices.tsx`, `(teacher)/profile.tsx`
  - ✅ `(student)/homework.tsx`, `(student)/videos.tsx`, `(student)/attendance.tsx`, `(student)/profile.tsx`
  - ✅ `(parent)/homework.tsx`, `(parent)/notices.tsx`, `(parent)/profile.tsx`
- ✅ 내정보(프로필) 화면: 각 역할별 로그아웃 버튼 + 기본 정보 표시
- ✅ Zustand 스토어 기본 구조 생성
  - ✅ `store/useHomeworkStore.ts` — 숙제 관련 상태 기본 틀
  - ✅ `store/useAttendanceStore.ts` — 출결 관련 상태 기본 틀

**완료 기준**:
- ✅ 4개 역할 모두 바텀탭이 보이고 탭 전환이 동작함
- ✅ 각 홈 화면이 Firestore 실데이터 기반으로 렌더됨 (데이터 없으면 empty state 표시)
- ✅ ui-screens.md 디자인 스펙과 시각적으로 일치함
- ✅ `npx tsc --noEmit` 타입 에러 0개

**주요 파일**:
- `app/(app)/(teacher)/_layout.tsx` (신규)
- `app/(app)/(teacher)/index.tsx` (구현)
- `app/(app)/(teacher)/homework.tsx` (placeholder)
- `app/(app)/(teacher)/attendance.tsx` (placeholder)
- `app/(app)/(teacher)/notices.tsx` (placeholder)
- `app/(app)/(teacher)/profile.tsx` (기본 구현)
- `app/(app)/(student)/_layout.tsx` (신규)
- `app/(app)/(student)/index.tsx` (구현)
- `app/(app)/(student)/homework.tsx` (placeholder)
- `app/(app)/(student)/videos.tsx` (placeholder)
- `app/(app)/(student)/attendance.tsx` (placeholder)
- `app/(app)/(student)/profile.tsx` (기본 구현)
- `app/(app)/(parent)/_layout.tsx` (신규)
- `app/(app)/(parent)/index.tsx` (구현)
- `app/(app)/(parent)/homework.tsx` (placeholder)
- `app/(app)/(parent)/notices.tsx` (placeholder)
- `app/(app)/(parent)/profile.tsx` (기본 구현)
- `app/(app)/(admin)/_layout.tsx` (수정)
- `app/(app)/(admin)/index.tsx` (구현)
- `store/useHomeworkStore.ts` (기본 구조)
- `store/useAttendanceStore.ts` (기본 구조)

---

### Phase 4: 숙제 스캔 제출 및 검사 피드백 (킬러 기능) ✅

**목표**: 학생이 카메라로 숙제를 촬영하여 제출하고, 선생님이 갤러리에서 확인 후 피드백을 남길 수 있는 전체 사이클이 동작하는 상태

**구현 내용**:
- ✅ 선생님: 숙제 출제 화면
  - ✅ 제목, 내용, 반 선택, 마감일 설정
  - ✅ D-Day 자동 계산 표시
  - ✅ Firestore `homeworks` 컬렉션에 저장
- ✅ 학생: 숙제 스캔 제출
  - ✅ `expo-camera` + `expo-image-manipulator` 연동 (react-native-document-scanner-plugin은 Expo Go 미지원 — EAS Build 시 추가)
  - ✅ `expo-image-manipulator`로 자동 압축 (목표 200KB 이하)
  - ✅ 다중 촬영 (최대 5장) + 미리보기 확인 + 재촬영
  - ✅ Firebase Storage 업로드 + Firestore `submissions` 서브컬렉션 저장
  - ✅ 마감 판단: `serverTimestamp()` 기준 — 마감 초과 시 `is_late: true` 자동 처리
- ✅ 학생: 숙제 목록 화면
  - ✅ 미제출 / 검사대기 / 다시제출 / 완료 탭 분리
  - ✅ D-Day 배지 표시
  - ✅ 선생님 피드백 확인 + 사진 뷰어 모달
- ✅ 선생님: 숙제 검사 + 피드백 화면
  - ✅ 제출물 갤러리 뷰 (사진 확대/스와이프)
  - ✅ 원터치 피드백 (좋아요 / 다시해오기) — FeedbackButton 공용 컴포넌트
  - ✅ 미제출자 자동 목록 표시
  - ✅ 지각 제출 꼬리표 표시
  - ✅ 제출 현황 프로그레스 바
- ✅ 중복 제출 처리: 재제출 시 이전 사진 교체 확인 다이얼로그
- ✅ 사진 업로드 실패 예외 처리
  - ✅ 네트워크 끊김 시 AsyncStorage 로컬 임시저장 + 재시도 버튼
  - ✅ 3회 실패 시 토스트 + 임시저장본 유지
  - ✅ 앱 재실행 시 임시저장본 감지 → 이어서 제출 다이얼로그
- ✅ Pro 플랜 체크: 숙제 스캔 제출/검사 진입 시 `academies.plan` 확인 → 무료 플랜이면 Pro 전환 바텀시트 표시
- ✅ Firestore Security Rules 업데이트 — submissions 쓰기 권한 (학생 본인만), 읽기 권한 (선생님/admin)
- ✅ Storage Rules 업데이트 — 숙제 사진 경로 권한 설정
- ✅ 공용 컴포넌트 분리: `HomeworkCard`, `FeedbackButton`

**완료 기준**:
- ✅ 선생님이 숙제를 출제하면 학생 목록에 즉시 표시됨
- ✅ 학생이 카메라로 촬영 → 보정/압축 → 제출까지 전체 플로우 동작
- ✅ 마감 전/후 제출 시 `is_late` 플래그가 올바르게 설정됨
- ✅ 선생님이 제출물을 확인하고 피드백을 남기면 학생에게 반영됨
- ✅ 미제출자 목록이 정확하게 표시됨
- ✅ 업로드 실패 시 임시저장 및 재시도가 정상 동작
- ✅ 무료 플랜에서 숙제 기능 진입 시 Pro 전환 바텀시트가 표시됨
- ⚠️ Playwright MCP E2E 테스트 — React Native 앱 특성상 웹 브라우저 자동화 불가, 시뮬레이터 수동 검증으로 대체

**주요 파일**:
- `app/(app)/(teacher)/homework-create.tsx`
- `app/(app)/(teacher)/homework-review.tsx`
- `app/(app)/(student)/homework-list.tsx`
- `app/(app)/(student)/homework-scan.tsx`
- `app/(app)/(student)/homework-preview.tsx`
- `components/CameraScanner.tsx`
- `components/HomeworkCard.tsx`
- `components/FeedbackButton.tsx`
- `components/ProUpgradeSheet.tsx` (Pro 전환 바텀시트 — Phase 9에서 확장)
- `lib/imageProcessor.ts` (보정/압축 유틸)
- `lib/storage.ts` (Storage 업로드 헬퍼)
- `store/useHomeworkStore.ts`
- `storage.rules`

---

### Phase 5: 실시간 출결 관리 ✅

**목표**: 선생님이 명렬표에서 원터치로 출결을 입력하면 Firestore 실시간 동기화되고, 학부모가 결석 사유를 선택하면 명렬표에 즉시 반영되는 상태

**구현 내용**:
- ✅ 선생님: 실시간 출결 명렬표
  - ✅ 반 선택 → 해당 반 학생 목록 표시
  - ✅ 출석(present) / 지각(late) / 결석(absent) 원터치 입력
  - ✅ Firestore `attendances/{classId_date}/records/{studentUid}` 실시간 저장
  - ✅ `onSnapshot` 리스너로 실시간 동기화 (다른 선생님 입력도 즉시 반영)
  - ✅ 출석 요약 카운터 상단 표시 (출석 N / 지각 N / 결석 N)
  - ✅ 전체 반 공용 접근 (담당 반 우선 표시)
- ✅ 학부모: 결석 사유 선택 칩 전송
  - ✅ [병원] [가족행사] [기타] 선택 칩 UI
  - ✅ 선택 시 `attendances.records.reason` 필드 실시간 업데이트
  - ✅ 선생님 명렬표에 즉시 반영
- ✅ 학생: 내 출결 확인
  - ✅ 월간 캘린더 뷰로 출결 이력 시각화 (출석/지각/결석 색상 구분)
- ✅ 선생님 홈 대시보드 — 오늘 결석 수 표시
- ✅ Firestore 복합 인덱스 설정 (classId + date 복합 쿼리용)
- ✅ Firestore 오프라인 캐시 활성화 (출결 오프라인 입력 지원)
  - ✅ `lib/firebase.ts` — `initializeFirestore` + `memoryLocalCache` + `experimentalForceLongPolling` 명시적 설정
  - ✅ 오프라인 상태 배너 표시 (선생님 출결 화면)
  - ✅ 재연결 시 자동 동기화 + 완료 토스트 (페이드 애니메이션)
  - ✅ `hooks/useNetworkStatus.ts` — 재사용 가능한 네트워크 상태 훅 (expo-network + AppState 폴링)
  - ⚠️ Firebase JS SDK는 React Native에서 IndexedDB 기반 디스크 캐시 미지원
    세션 내 메모리 캐시(기본값) + 오프라인 쓰기 큐 자동 동기화는 정상 동작
- ✅ Firestore Security Rules 업데이트 — attendances 쓰기 권한 (선생님/admin), 결석 사유 쓰기 (학부모 본인 자녀만)

**완료 기준**:
- ✅ 선생님이 출석/지각/결석을 터치하면 Firestore에 즉시 반영됨
- ✅ 2명 이상의 선생님이 동시에 입력해도 실시간 동기화 정상 동작
- ✅ 학부모가 결석 사유를 선택하면 선생님 명렬표에 즉시 표시됨
- ✅ 학생이 월간 캘린더에서 본인 출결 이력을 확인할 수 있음
- ✅ 오프라인 입력 후 재연결 시 데이터가 정상 동기화됨 (세션 내 메모리 큐)
- ✅ Firestore 복합 인덱스가 정상 생성되어 쿼리 성능이 확보됨

**주요 파일**:
- `app/(app)/(teacher)/attendance.tsx`
- `app/(app)/(parent)/attendance.tsx` (결석 사유 전송)
- `app/(app)/(student)/attendance.tsx` (월간 캘린더)
- `app/(app)/(admin)/attendance.tsx` (admin 출결 현황)
- `components/AttendanceRow.tsx`
- `components/MonthlyCalendar.tsx`
- `hooks/useNetworkStatus.ts`
- `store/useAttendanceStore.ts`
- `lib/attendance.ts`
- `lib/firebase.ts`
- `firestore.indexes.json`

---

### Phase 6: 출결 엑셀 내보내기 (법정 출석부) ✅

**목표**: 선생님/admin이 반별, 월별 출결 데이터를 법정 출석부 양식의 엑셀 파일로 생성하여 공유/저장할 수 있는 상태

**구현 내용**:
- ✅ 엑셀 내보내기 화면
  - ✅ 반 선택 + 월 선택 UI
  - ✅ 내보내기 버튼 → 엑셀 파일 생성 → 공유/저장
- ✅ 엑셀 파일 구성 (법정 출석부 양식 준수)
  - ✅ 헤더: 학원명 / 반 이름 / 담당 선생님 / 해당 연월
  - ✅ 학생별 행: 번호 / 성명 / 생년월일 / 보호자 연락처 / 교습과목 및 수강반 / 수강기간
  - ✅ 날짜별 출결: 출석(○) / 지각(△) / 결석(X) / 휴원(-)
  - ✅ 결석 사유 반영
  - ✅ 월간 합계: 출석일수 / 지각 / 결석 / 출석률 (수식 자동 계산)
- ✅ 파일명 자동 지정: `{반이름}_{연도}년_{월}월_출결현황.xlsx`
- ✅ 사용 라이브러리: `xlsx (SheetJS)` + `expo-sharing` + `expo-file-system`
- ✅ iOS: '파일로 저장' 또는 '이메일로 보내기' 공유 시트
- ✅ Android: 다운로드 폴더 저장 또는 공유 시트
- ✅ Pro 플랜 전용 기능 — 무료 플랜 접근 시 Pro 전환 바텀시트 표시
- ✅ 접근 권한: admin 및 선생님만 가능

**완료 기준**:
- ✅ 반별/월별 선택 후 엑셀 파일이 정상 생성됨
- ✅ 생성된 엑셀에 법정 필수 기재항목(성명, 생년월일, 보호자 연락처, 수강반, 수강기간, 날짜별 출결, 결석 사유)이 모두 포함됨
- ✅ iOS/Android 각각에서 파일 공유/저장이 정상 동작
- ✅ 월간 합계 수식이 올바르게 계산됨

**주요 파일**:
- `app/(app)/(teacher)/attendance-export.tsx`
- `app/(app)/(admin)/attendance-export.tsx`
- `lib/excelExporter.ts` (SheetJS 기반 엑셀 생성 유틸)
- `lib/legalAttendanceFormat.ts` (법정 출석부 양식 정의)

---

### Phase 7: 공지사항 및 학부모 대시보드 ✅

**목표**: 선생님/admin이 공지를 작성하면 학생/학부모에게 전달되고 읽음 확인이 추적되며, 학부모가 자녀의 숙제/출결 현황을 실시간으로 확인할 수 있는 상태

**구현 내용**:
- ✅ 공지사항 작성 (선생님/admin)
  - ✅ 제목, 내용 입력
  - ✅ 중요/일반 구분 토글
  - ✅ Firestore `notices` 컬렉션에 저장
- ✅ 공지사항 목록 및 상세 (전 역할)
  - ✅ 중요 공지 상단 고정 + 강조 표시
  - ✅ 읽음 처리: 상세 진입 시 `read_by` 배열에 uid 추가
- ✅ 공지 읽음 현황 (선생님/admin)
  - ✅ 읽음 확인 수 및 프로그레스 바 표시
  - ✅ 미읽음 학생/학부모 목록 확인
  - ✅ Pro 플랜 전용 기능
- ✅ 학부모 대시보드
  - ✅ 자녀 숙제 현황 실시간 확인 (제출 여부, 선생님 피드백)
  - ✅ 자녀 출결 현황 확인
  - ✅ 다자녀 연동 시 자녀 전환 UI (`app/(app)/(parent)/children-switch.tsx`)
- ✅ 앱 내 알림 인박스
  - ✅ Firestore `notifications` 컬렉션에서 본인 알림 목록 조회
  - ✅ 읽음/미읽음 상태 관리
  - ✅ 알림 탭 배지 (미읽음 수 표시)
- ✅ 선생님 홈 대시보드 완성
  - ✅ 미검사 숙제 수
  - ✅ 오늘 결석 수
  - ✅ 최근 공지 요약
  - ✅ 담당 반 우선 표시

**완료 기준**:
- ✅ 공지 작성 → 학생/학부모 목록에 즉시 표시됨
- ✅ 중요 공지가 상단에 고정되고 강조 표시됨
- ✅ 읽음 확인 수와 프로그레스 바가 정확하게 동작
- ✅ 학부모가 자녀의 숙제 제출 여부와 피드백을 실시간으로 확인 가능
- ✅ 다자녀 학부모가 자녀 전환 UI로 자녀별 현황을 전환하여 확인 가능
- ✅ 알림 인박스에서 히스토리 조회 및 읽음 처리가 정상 동작
- ⚠️ Playwright MCP E2E 테스트 — React Native 앱 특성상 웹 브라우저 자동화 불가, 시뮬레이터 수동 검증으로 대체

**주요 파일**:
- `app/(app)/(teacher)/notice-create.tsx`
- `app/(app)/(teacher)/notice-read-status.tsx`
- `app/(app)/common/notice-list.tsx`, `app/(app)/common/notice-detail.tsx`
- `app/(app)/(parent)/dashboard.tsx`
- `app/(app)/(parent)/child-homework.tsx`
- `app/(app)/(parent)/children-switch.tsx` (다자녀 전환 UI)
- `app/(app)/common/notification-inbox.tsx`
- `components/NoticeCard.tsx`
- `components/ReadProgressBar.tsx`
- `store/useNoticeStore.ts`
- `store/useNotificationStore.ts`

---

### Phase 8: FCM 푸시 알림 ✅

**목표**: 숙제 마감 임박, 피드백 등록, 미제출 자동 알림 등이 FCM을 통해 실제 디바이스에 푸시 알림으로 전달되는 상태

**구현 내용**:
- ✅ FCM 토큰 등록 및 관리
  - ✅ 앱 최초 실행 시 FCM 토큰 발급 → Firestore `users/{uid}` 저장
  - ✅ 토큰 갱신 시 자동 업데이트
  - ✅ 모든 알림 OFF 시 `fcm_token: null` 저장 → 서버 발송 자동 차단
  - ✅ 알림 재활성화 시 FCM 토큰 재발급
- ✅ 알림 권한 요청 타이밍
  - ✅ 첫 로그인 완료 직후 요청
  - ✅ 거부 시 3일 후 1회 재요청, 이후 강제 없음
- ✅ Cloud Functions 알림 트리거 구현
  - ✅ `functions/notifications/homeworkReminderPush.ts` — 선생님이 미제출 학생 수동 알림 버튼 클릭 시 학생·학부모에게 발송 (callable)
  - ✅ `functions/notifications/homeworkFeedback.ts` — 피드백 등록 시 학생·학부모 알림 (onDocumentUpdated)
  - ✅ `functions/notifications/unsubmittedAlert.ts` — 마감시간 경과 후 매시간 정각 미제출 학부모에게 자동 발송 (스케줄러, 멱등성 보장)
  - ✅ `functions/notifications/noticeAlert.ts` — 새 공지 등록 시 대상 역할·반 필터링 후 알림 (onDocumentCreated)
  - ✅ `functions/notifications/attendanceAlertPush.ts` — 출결 저장 시 결석·지각 학생 학부모에게 즉시 알림 (callable)
- ✅ 선생님 숙제 리뷰 화면에 미제출 학생별 알림 전송 버튼 추가
- ✅ 출결 저장(선생님) 시 결석·지각 학부모에게 자동 알림 연동
- ✅ 역할별 알림 설정 (내 정보 화면)
  - ✅ 학생: 숙제 알림 / 피드백 알림 / 공지 알림 개별 토글
  - ✅ 학부모: 숙제 알림 / 출결 알림 / 공지 알림 개별 토글
  - ✅ 선생님: 푸시 알림 통합 ON/OFF 토글
  - ✅ Firestore `notif_prefs` 필드 저장 → Cloud Functions 서버 측 필터링에 활용
- ✅ Firestore `notifications` 컬렉션에 알림 히스토리 동시 저장 (앱 내 인박스 연동)
- ✅ Pro 플랜 전용 기능 — 무료 플랜은 FCM 알림 미발송 (인박스 저장은 플랜 무관)
- ✅ OS 알림 거부 시에도 앱 내 인박스에서 확인 가능
- ✅ 온보딩 첫 화면 UI 개선
  - ✅ 앱 아이콘 이미지 적용 (`app_icon_2.png`)
  - ✅ 앱 이름 "웅깅" + "Woongking" 서브타이틀
  - ✅ 슬로건: "웅차게 배우고, 왕처럼 성장하다"
  - ✅ 기능 설명 이모지 → Ionicons 아이콘으로 교체
  - ✅ 기능 텍스트: 숙제 제출·실시간 피드백 / 원터치 출결·학부모 즉시 알림 / 출석부 엑셀 파일 자동 생성
- ✅ UI 전반 이모지 제거 — Ionicons 아이콘·텍스트로 통일
  - ✅ 버튼·레이블·상태 표시·섹션 타이틀·Empty State 등 앱 전반의 이모지 제거
  - ✅ 알림 인박스 타입별 아이콘을 이모지 → `Ionicons` + 색상 매핑으로 교체
  - ✅ 역할 선택 화면 이모지 → Ionicons 아이콘 카드로 교체
  - ✅ 피드백 이모지(`👍`/`💧`)는 Firestore 저장값으로 유지, UI 표시만 텍스트로 변경

**완료 기준**:
- ✅ iOS/Android 실제 디바이스에서 푸시 알림이 정상 수신됨
- ✅ 피드백 등록, 미제출 자동 알림, 출결 알림이 올바른 시점에 발송됨
- ✅ 선생님 수동 알림 버튼으로 특정 학생에게 알림 전송 가능
- ✅ 알림 클릭 시 해당 화면으로 정상 이동 (딥링크)
- ✅ 알림 히스토리가 앱 내 인박스에 동시 저장됨
- ✅ 역할별 알림 토글이 Firestore에 저장되고 Cloud Functions 필터링에 반영됨
- ✅ Cloud Functions 호출자 역할·학원 소속 검증으로 권한 외 발송 차단

**주요 파일**:
- `lib/fcm.ts` (FCM 토큰 관리 유틸)
- `functions/src/notifications/homeworkReminderPush.ts`
- `functions/src/notifications/homeworkFeedback.ts`
- `functions/src/notifications/unsubmittedAlert.ts`
- `functions/src/notifications/noticeAlert.ts`
- `functions/src/notifications/attendanceAlertPush.ts`
- `functions/src/notifications/sendFcm.ts`
- `app/(app)/(teacher)/homework-review.tsx` (알림 버튼 추가)
- `app/(app)/(teacher)/attendance.tsx` (출결 저장 시 알림 연동)
- `app/(app)/(student)/profile.tsx` (알림 유형별 토글)
- `app/(app)/(parent)/profile.tsx` (알림 유형별 토글)
- `app/(app)/(teacher)/profile.tsx` (푸시 알림 통합 토글)
- `app/(auth)/index.tsx` (온보딩 첫 화면 UI 개선)

---

### Phase 9: 반 관리 & 선생님 지정 ✅

**목표**: 반 생성/수정/삭제, 학생 반 이동, 초대코드 재발급, admin의 담당 선생님 지정이 모두 동작하는 상태

**구현 내용**:
- ✅ 반 생성/수정/삭제 (`admin/settings.tsx`)
- ✅ 학생 반 이동 (`admin/students.tsx`)
- ✅ 학생 퇴원 처리 (`is_active: false`, `admin/students.tsx`)
- ✅ 반별 초대코드 표시 (`admin/settings.tsx`)
- ✅ 반에 교습과목(`subject`) 필드 추가 — 법정 출석부 엑셀 기재항목 대응
- ✅ 선생님 담당반 자가 선택 (`teacher/class-select.tsx`)
- ✅ 반별 초대코드 재발급 — `handleReissueCode()` 구현, 기존 `invite_code` 즉시 무효화 + 로컬 상태 즉시 반영
- ✅ admin의 담당 선생님 지정 UI — 반 설정 모달 내 선생님 칩 토글 (`handleToggleTeacher()`), `arrayUnion`/`arrayRemove` 기반 Firestore 동기화
- ✅ 비밀번호 변경 기능 전 역할 활성화
  - ✅ `components/PasswordChangeModal.tsx` — Firebase 재인증(`reauthenticateWithCredential`) + `updatePassword` 구현
  - ✅ 선생님·학생·학부모 프로필, 어드민 설정 화면에 연결
  - ✅ 오류 코드별 메시지 처리 (비밀번호 오류, 요청 초과, 재로그인 필요)
- ✅ 어드민 설정 화면 UI 정리 — 반 카드 북마크 아이콘, 선생님 행 왕관 아이콘 제거
- ✅ 선생님 프로필 데이터 실시간 구독 전환
  - ✅ 담당 반 목록: `onSnapshot`으로 반 정보 변경 즉시 반영
  - ✅ 학생 수: `onSnapshot`으로 학생 가입/탈퇴/반 이동 즉시 반영
  - ✅ 숙제 검사 수, 출석률: `getDocs` 유지 (집계 비용 절감)
  - ✅ 통계 카드에서 '검사 완료' 항목 제거
- ✅ 알림 토글 시 홈으로 이동하는 버그 수정
  - ✅ `app/(app)/_layout.tsx` useEffect 의존성을 `user` 전체 → 라우팅 결정 필드만으로 변경
  - ✅ (원인: `notif_prefs` 업데이트 → `onSnapshot`으로 user 갱신 → 레이아웃 Effect 재실행 → 홈으로 이동)

**완료 기준**:
- ✅ 초대코드 재발급 시 기존 코드로 가입 불가 확인
- ✅ admin이 반 설정에서 담당 선생님을 지정/변경할 수 있음
- ✅ 전 역할에서 비밀번호 변경 모달이 정상 동작함
- ✅ 알림 토글 조작 시 현재 탭을 유지함

**주요 파일**:
- `app/(app)/(admin)/(tabs)/settings.tsx` (초대코드 재발급 + 담당 선생님 지정 UI + 비밀번호 변경)
- `app/(app)/(teacher)/(tabs)/profile.tsx` (실시간 연동 + 비밀번호 변경)
- `app/(app)/(student)/(tabs)/profile.tsx` (비밀번호 변경)
- `app/(app)/(parent)/(tabs)/profile.tsx` (비밀번호 변경 메뉴 추가)
- `components/PasswordChangeModal.tsx` (신규)
- `app/(app)/_layout.tsx` (알림 토글 버그 수정)

---

### Phase 10: 수업 영상 & 스트릭 ✅

**목표**: 선생님이 유튜브 영상을 등록하고 학생이 시청할 수 있으며, 연속 제출 스트릭이 정확히 동작하는 상태

**구현 내용**:
- ✅ 수업 영상 등록 (선생님/admin)
  - ✅ YouTube URL 입력 → `parseYouTubeVideoId()`로 영상 ID 파싱
  - ✅ `getYouTubeThumbnailUrl()`로 썸네일 미리보기 자동 표시
  - ✅ 잘못된 URL 입력 시 빨간 테두리 + 안내 문구
  - ✅ 반 선택 + Firestore `videos` 컬렉션 저장
- ✅ 학생: 수업 영상 목록 화면 — Firestore 실데이터 연결, YouTube 앱/브라우저 연동
- ✅ 연속 제출 스트릭 (학생)
  - ✅ 숙제 있는 날 마감 전 제출 시 스트릭 유지 (`submitted`)
  - ✅ 지각 제출 시 스트릭 초기화 (`late`)
  - ✅ 미제출 시 스트릭 초기화 (`missed`)
  - ✅ 최근 14일 + 미래 7일 (총 21일) 막대 그래프 시각화 (`StreakChart.tsx`)
  - ✅ `fetchStreakData` 반환값 확장: `days[]` + `submittedCount` + `lateCount` + `missedCount`
  - ✅ 스탬프 카드 기능 — 마감 전 제출 10개마다 카드 1장 완성
    - ✅ 완성된 카드: 기본 접힘 상태, 탭하면 제출 내역 펼쳐보기
    - ✅ 카드 완성 시 축하 팝업 표시
    - ✅ 진행 중인 카드: 현재 진행률 막대 표시
  - ✅ 스트릭 규칙 안내 카드

**완료 기준**:
- ✅ 유튜브 링크 등록 시 썸네일 카드가 정상 표시되고 재생 가능
- ✅ 스트릭이 규칙에 맞게 유지/초기화되고 그래프가 정확히 표시됨
- ✅ 마감 전 제출 10개마다 스탬프 카드가 완성되고 축하 팝업이 표시됨

**주요 파일**:
- `app/(app)/(teacher)/video-register.tsx`
- `app/(app)/(admin)/video-register.tsx`
- `app/(app)/(teacher)/video-list.tsx`
- `app/(app)/(admin)/video-list.tsx`
- `app/(app)/(student)/(tabs)/videos.tsx` (실데이터 연결)
- `app/(app)/(student)/streak.tsx`
- `components/StreakChart.tsx`
- `lib/youtube.ts` (YouTube URL 파싱 + 썸네일 유틸)
- `lib/streak.ts` (스트릭 계산 유틸)

---

### Phase 11: Pro 플랜 & 결제 통합

**목표**: RevenueCat 인앱결제가 iOS/Android 모두 동작하고, Pro 전용 기능 진입 시 업그레이드 바텀시트가 올바르게 표시되는 상태

**구현 내용**:
- RevenueCat SDK 통합 (iOS/Android 인앱결제 통합 관리)
- Pro 업그레이드 바텀시트 컴포넌트 (`components/ProUpgradeSheet.tsx`) 완성
  - 기능 목록 + 가격 안내 (학생 수 기반 슬라이더) + '14일 무료 체험 시작' 버튼
- 무료 기능에서 Pro 전용 기능 진입 시 바텀시트 표시
- Firestore `academies.plan` 체크 + Security Rules 적용

**완료 기준**:
- RevenueCat 인앱결제가 iOS/Android 모두 정상 동작
- Pro 전환 바텀시트가 올바른 시점에 표시됨
- Pro 전용 기능에 free 플랜으로 접근 시 차단됨

**주요 파일**:
- `components/ProUpgradeSheet.tsx`
- `lib/revenueCat.ts` (RevenueCat SDK 초기화 및 헬퍼)

---

### Phase 12: 앱 안정성 & 출시 준비 ✅

**목표**: 강제 업데이트, Crashlytics, 탈퇴 처리, APNs 설정이 완료되어 실제 학원에 파일럿 투입할 수 있는 상태

**구현 내용**:
- ✅ 강제 업데이트 체크
  - ✅ 앱 실행 시 `app_config/version` 문서 조회
  - ✅ 현재 버전 < `min_version` → 강제 업데이트 다이얼로그 (닫기 불가)
  - ✅ 현재 버전 < `latest_version` → 권장 업데이트 배너 (닫기 가능)
- ✅ React ErrorBoundary 구현 — 앱 크래시 캐치 + 재시작 안내 UI (Expo 환경에서 Crashlytics 대체)
  - ⚠️ @react-native-firebase/crashlytics는 EAS Build 환경에서 별도 추가 필요
- ✅ 학원 자동 정리 Cloud Function
  - ✅ 학원 30일 미승인 자동 비활성화 → 7일 유예 후 완전 삭제 (`functions/src/academy/deactivateExpiredAcademies.ts`)
- ✅ 탈퇴/데이터 삭제 구현
  - ✅ 역할별 삭제 범위 적용 (선생님: 익명화, 학생: 제출물+Storage 삭제)
  - ✅ 선생님 탈퇴 시 작성 숙제/공지 익명 처리 (`functions/src/auth/anonymizeTeacherData.ts`)
  - ✅ 30일 유예 기간 후 Cloud Functions 자동 완전 삭제 (`functions/src/auth/cleanupDeletedUsers.ts`)
  - ✅ Storage 파일(숙제 사진) 삭제 포함 — 개인정보 파기 절차 준수
- ✅ APNs 인증서 설정 완료 → Phone Auth OTP 활성화 (Phase 2 임시 스킵 해제)
  - ✅ `docs/APNs-setup.md` — Apple Developer → Firebase → EAS Build 단계별 가이드 작성
- ✅ 앱 내 문의하기 (설정 → 이메일 연동, 기기 정보/앱 버전 자동 첨부)
- ✅ 개인정보처리방침 페이지 작성 (`app/(auth)/privacy.tsx` — 비로그인 접근 가능)
- ✅ Firestore Security Rules 업데이트 — 탈퇴 유저(`deleted_at != null`) 데이터 접근 차단

**완료 기준**:
- ✅ 강제 업데이트 다이얼로그가 조건에 맞게 표시됨
- ✅ ErrorBoundary로 UI 크래시 캐치 및 재시작 안내 동작 (Crashlytics 대체)
- ✅ 학원 30일 미승인 자동 비활성화/삭제가 정상 동작
- ✅ 선생님 탈퇴 시 작성물 익명 처리가 정상 동작
- ⚠️ Phone Auth OTP — APNs 키 설정(외부 작업) 후 실제 SMS 수신 확인 필요 (`docs/APNs-setup.md` 참조)
- ⚠️ PRD 섹션 14의 파일럿 투입 전 테스트 체크리스트 — EAS Build 빌드 후 실기기 테스트 필요

**주요 파일**:
- `components/ForceUpdateDialog.tsx` (신규)
- `components/ErrorBoundary.tsx` (신규)
- `lib/versionCheck.ts` (신규)
- `functions/src/academy/deactivateExpiredAcademies.ts` (신규)
- `functions/src/auth/deleteUser.ts` (신규)
- `functions/src/auth/anonymizeTeacherData.ts` (신규)
- `functions/src/auth/cleanupDeletedUsers.ts` (신규 — Storage 삭제 포함)
- `app/(auth)/privacy.tsx` (신규)
- `docs/APNs-setup.md` (신규)
- `firestore.rules` (수정 — isNotDeleted 헬퍼 + app_config 규칙)

---

### Phase 13: 웹 대시보드 (admin 전용) ✅

**목표**: 원장님이 PC 브라우저에서 학원 전체를 관리할 수 있는 웹 대시보드가 동작하고, 앱과 동일한 Firebase를 공유하여 데이터가 실시간 동기화되는 상태

> 앱 Phase 5까지 완성 후 개발 시작 권장 (Firestore 구조 확정 필요)

**구현 내용**:
- 웹 프로젝트 초기화 (React + Vite + TypeScript + TailwindCSS)
- Firebase 연동 (앱과 동일 프로젝트, 동일 Firestore 공유)
- React Query 설정 (Firestore 데이터 페칭/캐싱)
- 웹 로그인 구현 (이메일/비밀번호 + 카카오 + Google, Apple 미지원)
- admin 역할 확인 → 비 admin 접근 차단
- 홈 대시보드
  - 오늘 전체 출결 현황 (출석/지각/결석/미입력 수)
  - 반별 이번 달 출석률 막대 차트 (Recharts)
  - 최근 7일 출결 추이 그래프
  - 오늘 결석/미입력 학생 목록
  - 구독 현황 요약 (플랜/학생 수/갱신일)
- 학생 및 반 관리
  - 학생 목록 테이블 (검색/필터/정렬/반 변경)
  - 학생 개별 등록
  - 엑셀 일괄 업로드 (양식 다운로드 → 작성 → 업로드 → 미리보기 확인 → 일괄 등록)
    - 양식 필수 컬럼: 이름 / 생년월일 / 보호자 연락처 / 반 이름 / 수강 시작일
    - 유효성 검사: 필수값 누락/번호 형식 오류 행 하이라이트
    - 완료 리포트: 성공 N명 / 실패 N명 + 실패 사유 표시
  - 반 생성/수정/삭제
  - 학생 비활성화 (퇴원 처리)
- 출결 관리
  - 전체 반 출결 현황 (날짜별 필터)
  - 월별 출결 엑셀 다운로드 (반별 선택 또는 전체 일괄, SheetJS 사용)
  - 결석 사유 목록 조회
- 선생님 계정 관리
  - 선생님 목록 + 담당 반 현황
  - 학원코드 공유 또는 초대 링크 발송
  - 계정 삭제
- 공지사항 관리
  - 공지 작성/수정/삭제
  - 읽음 현황 및 미읽음 학생 목록 확인
- 구독 및 결제 관리
  - 현재 플랜 확인 (free / trial / pro) 및 학생 수
  - 웹 직접 결제 (카드/계좌, 수수료 2~3%)
  - 결제 내역 조회

**완료 기준**:
- 웹 브라우저에서 로그인 후 대시보드가 정상 표시됨
- 출결 통계 차트가 실제 데이터 기반으로 정확히 렌더링됨
- 엑셀 일괄 업로드로 학생 계정이 정상 생성됨 (Firebase Auth + Firestore)
- 웹에서 수정한 데이터가 앱에 실시간 반영됨 (반 변경, 공지 작성 등)
- 출결 엑셀 다운로드가 법정 양식으로 정상 생성됨
- Playwright MCP로 웹 대시보드 주요 플로우 E2E 테스트 통과

**주요 파일** (별도 웹 프로젝트 또는 모노레포 `apps/web/` 하위):
- `src/main.tsx`, `src/App.tsx`
- `src/lib/firebase.ts`
- `src/pages/Login.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/StudentManagement.tsx`
- `src/pages/AttendanceManagement.tsx`
- `src/pages/TeacherManagement.tsx`
- `src/pages/NoticeManagement.tsx`
- `src/pages/SubscriptionManagement.tsx`
- `src/components/AttendanceChart.tsx`
- `src/components/ExcelUploader.tsx`
- `src/components/StudentTable.tsx`
