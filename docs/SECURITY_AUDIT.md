# 보안 감사 리포트 — P1 / P2

*작성일: 2026-04-23*
*대상: 웅깅(Woongking) 앱 · 웹 · Cloud Functions*
*감사 범위: Firestore Rules, Storage Rules, Cloud Functions, 클라이언트 권한 체크*

이전 세션(P0/P1 #5·#6·#7·#8 완료) 이후 남아있는 보안 리스크를 재분류한 문서.
새 세션에서 보안 관련 작업을 이어갈 때 이 문서를 먼저 참조할 것.

---

## 강점 (이미 잘 되어 있음 — 이 영역은 추가 작업 불필요)

- `firestore.rules` — 학원 격리, 탈퇴 유저 차단, 유료 플랜 체크, 서브컬렉션별 세밀한 권한
- `validateOnboardingCode` + rate limit (uid 10분/5회 + IP 10분/20회) — 온보딩 코드 무차별 대입 방어
- `createStudentAccount` — 7단계 검증(인증→입력→역할→학원 일치→반 소속→학원 상태→pending 3명 제한)
- `verifyTossPayment` — 금액 화이트리스트 + 토스 서버 재검증 + Firestore 트랜잭션

---

## 🔴 P1 — 즉시 수정 권장 (5건)

### P1-1. Storage: 숙제 이미지 크로스 학원 읽기 가능
- **파일**: `storage.rules:16-25`
- **현 상태**: `homeworks/{homeworkId}/{studentUid}/{filename}` 의 read 조건이 `request.auth != null` 뿐
- **위험**: 로그인한 누구든 경로만 알면 타 학원 학생의 숙제 사진 열람 가능. 경로 형식이 예측 가능(`{homeworkId}/{uid}`)해 유출 위험 큼
- **수정 방향**: Rules에서 Firestore `homeworks/{id}` 의 `academy_id` 를 조회해 요청자와 일치하는지 확인 (또는 Cloud Function signed URL 방식)

### P1-2. 파일럿 `plan: 'pro'` 하드코딩
- **파일**: `app/(auth)/academy-register.tsx:82, 119`
- **현 상태**: 학원 신규 생성 시 `plan: 'pro'` 로 고정
- **위험**: 결제 없이 학원 만들면 즉시 Pro 전 기능 사용 가능 → 지난 세션에서 구현한 `verifyTossPayment` 의미 무력화
- **수정 방향**: `plan: 'trial'` + `trial_ends_at: +14일` 로 변경. 만료 후 자동 `'free'` 강등 (CF로)

### P1-3. `app/(app)/_layout.tsx:58` `auth` 미정의
- **파일**: `app/(app)/_layout.tsx:58`
- **현 상태**: 탈퇴 처리(`deleted_at != null`) 감지 후 `signOut(auth)` 호출하는데 `auth` import 누락 → TypeScript 에러 + 런타임 ReferenceError
- **위험**: 탈퇴 처리된 계정이 자동 로그아웃 안 됨. Firestore Rules는 막히지만 세션은 유지되어 UI 이상 동작 가능
- **수정 방향**: `import { auth } from '../../lib/firebase'` 추가

### P1-4. `users` 문서 쓰기 필드 화이트리스트 부재
- **파일**: `firestore.rules:126-139` (본인 문서 update 규칙)
- **현 상태**: `is_active`, `role` 외의 필드는 본인이 자유롭게 쓸 수 있음
- **위험**: 악성 클라이언트가 `phone_verified: true` 직접 세팅(휴대폰 인증 우회), `deleted_at: null` 로 탈퇴 되돌리기, `email`·`academy_id` 변조 가능
- **수정 방향**: `affectedKeys().hasOnly([...])` 로 본인이 쓸 수 있는 필드 화이트리스트(`name`, `profile_image_url`, `notif_prefs`, `phone_number` 등) 명시

### P1-5. `academies` create 무제한
- **파일**: `firestore.rules:102`
- **현 상태**: `allow create: if isAuthenticated();`
- **위험**: 로그인 사용자가 수천 개 학원 문서 스팸 생성 → Firestore 쓰기 비용 폭증, 컬렉션 오염
- **수정 방향**: 같은 uid가 이미 학원을 만들었는지 체크 (owner_uid 필드 + Rules에서 기존 `academies` 존재 여부 확인), 또는 CF 경유 + rate limit

---

## 🟡 P2 — 중요도 중간 (7건)

### P2-6. 결제 orderId 중복 처리 없음
- **파일**: `functions/src/academy/verifyTossPayment.ts:110-133`
- **현 상태**: 트랜잭션 안에서 orderId 중복 체크 없이 `payments.set()` + `academies.update()`
- **위험**: 토스 자체는 멱등이지만 Firestore에 중복 `payments` 문서 + 이중 `plan_expires_at` 연장 가능
- **수정 방향**: 트랜잭션 시작 시 `payments.where('order_id', '==', orderId)` 조회 → 이미 있으면 throw

### P2-7. onCall 함수 rate limit 부재
- **대상**: `createStudentAccount`, `kakaoLogin`, `verifyTossPayment`
- **현 상태**: `validateOnboardingCode` 외에는 호출 빈도 제한 없음
- **위험**: 인증된 선생님이 `createStudentAccount` 반복 호출 → 가상 이메일 대량 생성, Auth 쿼터 소진
- **수정 방향**: 공통 rate limit 헬퍼(`rateLimits` 컬렉션 기반) 추출 후 각 onCall에 적용

### P2-8. Storage MIME 검증이 클라이언트 의존
- **파일**: `storage.rules:23, 37`
- **현 상태**: `contentType.matches('image/.*')` — 업로드 시 헤더 조작으로 우회 가능
- **위험**: 악성 파일(JS, PHP)을 image/png 로 위장 업로드 → XSS/악성 링크 배포 벡터
- **수정 방향**: 업로드 후 CF(onObjectFinalized)에서 magic byte 검증 → 실패 시 삭제

### P2-9. profile 이미지 크로스 학원 공개
- **파일**: `storage.rules:33`
- **현 상태**: `allow read: if request.auth != null`
- **위험**: 학생 얼굴사진이 타 학원 사용자에게도 노출
- **수정 방향**: Firestore `users/{uid}` 조회해 academy_id 일치 시에만 read 허용

### P2-10. PII 로그 축적
- **파일**: `functions/src/auth/createStudentAccount.ts:78, 89, 201`
- **현 상태**: `logger.info/warn` 가 uid·academy_id 기록
- **위험**: GCP 로그가 30일 이상 보관되는 기본 설정 시 개인정보보호법(보존 기간·삭제권) 이슈
- **수정 방향**: uid 해시 처리 또는 민감 필드 로그 제외, 로그 보존 기간 단축 설정

### P2-11. TypeScript 에러 3건 누적
- **위치**:
  - `app.config.ts:55` — `edgeToEdgeEnabled` 타입 미지정
  - `app/(app)/(admin)/(tabs)/settings.tsx:1027` — 중복 스타일 키
  - `app/(app)/_layout.tsx:58` — auth 미정의 (P1-3과 동일)
- **현 상태**: 빌드는 되지만 `tsc --noEmit` 에러 3건
- **위험**: CI/CD 도입 시 블로커, 타입 안전성 저하
- **수정 방향**: P1-3 수정 시 같이 처리. 중복 스타일은 styles 객체 정리, edgeToEdgeEnabled는 Expo 버전 확인 후 제거/업그레이드

### P2-12. `academies.update` 필드 화이트리스트 부재
- **파일**: `firestore.rules:96-100`
- **현 상태**: admin 이 active 학원의 어떤 필드든 쓸 수 있음 (`plan`, `plan_expires_at`, `status` 포함)
- **위험**: admin 이 앱 외부에서 Firestore 직접 조작으로 `plan: 'pro'`, `plan_expires_at: +10년` 설정 가능 → 결제 우회
- **수정 방향**: Rules에서 `plan`, `plan_expires_at`, `status` 는 CF 전용으로 분리 (`affectedKeys().hasOnly([허용 필드만])`)

---

## 추천 진행 순서

영향 × 구현 비용 기준:

| 차수 | 항목 | 예상 시간 |
|------|------|----------|
| **1차 (오늘 가능)** | P1-2 (plan:'pro' 제거) + P1-3 (auth import) + P1-4 (users 필드 화이트리스트) | ~30분 |
| **2차** | P1-1 (storage 학원 격리) + P1-5 (academies create 제한) + P2-12 (plan 필드 잠금) | ~1시간 |
| **3차** | P2-6 (orderId 중복) + P2-7 (rate limit 확장) | ~1시간 |
| **4차** | P2-8, P2-9, P2-10, P2-11 | 여유 시 |

---

## 진행 체크리스트

- [x] P1-1 — Storage 숙제 이미지 학원 격리 (firestore.get 경유 교차 검증, 2026-04-23)
- [x] P1-2 — academy-register plan 하드코딩 제거 (2026-04-23) + firestore.rules trial 만료 체크 추가
- [x] P1-3 — _layout.tsx auth import (2026-04-23)
- [x] P1-4 — users 필드 블랙리스트 (deleted_at/teacher_feedback/created_by 차단, 2026-04-23)
- [x] P1-5 — academies create 제한 (owner_uid + isOnboarding 게이트, 2026-04-23)
- [x] P2-6 — orderId 중복 방지 (트랜잭션 내 tx.get 으로 동시성 차단, 2026-04-23)
- [x] P2-7 — onCall rate limit 확장 (공용 헬퍼 lib/rateLimit.ts + 4개 onCall 적용, 2026-04-23)
- [x] P2-8 — Storage MIME 서버 검증 (onObjectFinalized + 매직바이트 검사, 2026-04-23)
- [x] P2-9 — profile 학원 격리 (P1-1과 같이 2026-04-23 적용)
- [x] P2-10 — PII 로그 정리 (hashForLog 헬퍼 + uid/code/academyId/key 해시 기록, 2026-04-23)
- [x] P2-11 — TypeScript 에러 해소 (edgeToEdgeEnabled + deleteBtn 중복 스타일, 2026-04-23)
- [x] P2-12 — academies.update 필드 잠금 (화이트리스트: name/academy_type/owner_name/owner_phone/address, 2026-04-23)

항목 완료 시 체크박스 업데이트 + 관련 커밋 해시 남길 것.
