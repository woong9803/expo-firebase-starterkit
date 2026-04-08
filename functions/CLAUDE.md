Firebase Cloud Functions 전용 지침입니다.
공통 규칙은 루트 `.claude/rules/` 를 참조하세요.

---

## 폴더 역할

```
functions/
├── auth/        # 카카오 Custom Token, 회원 탈퇴 정리
├── homework/    # 미제출 자동 알림 (스케줄러)
├── academy/     # 학원 승인 상태 변경, 30일 자동 비활성화
├── notifications/ # FCM 발송 공통 헬퍼
├── index.ts     # 함수 export 진입점
├── .env         # 시크릿 환경변수 — Git 제외 필수
└── .env.example # 키 목록만 공유용
```

---

## 환경변수 (Functions 전용)

- 모든 시크릿은 `functions/.env` 에서만 관리
- 클라이언트(앱) 코드로 절대 유출 금지

```
KAKAO_ADMIN_KEY=...         # 카카오 Custom Token 발급용
```

- 배포 시: `firebase functions:secrets:set KEY_NAME` 으로 Secret Manager 사용 권장

---

## 트리거 유형 구분

| 유형 | 사용 상황 | 예시 |
|------|-----------|------|
| `onCall` | 앱에서 직접 호출하는 함수 | 카카오 Custom Token 발급 |
| `onRequest` | HTTP endpoint 필요 시 | (현재 계획 없음) |
| `onDocumentCreated` | Firestore 문서 생성 감지 | 학원 신규 가입 알림 |
| `onDocumentUpdated` | Firestore 문서 변경 감지 | 승인 상태 변경 → FCM |
| `onSchedule` | 주기적 자동 실행 | 미제출 알림, 30일 비활성화, 백업 |

---

## 주요 함수 목록

### 인증
- `kakaoCustomToken` (onCall) — 카카오 액세스 토큰 → Firebase Custom Token 발급

### 알림 (FCM)
- `sendHomeworkDueAlert` (onSchedule, 매일 18:00) — 마감 당일 미제출 학생 학부모에게 FCM 발송
- `onFeedbackCreated` (onDocumentUpdated) — 피드백 등록 시 학생·학부모 FCM 발송

### 학원 관리
- `onAcademyApproved` (onDocumentUpdated) — `status: active` 변경 시 학원코드 발급 + FCM
- `deactivateExpiredAcademies` (onSchedule, 매일 03:00) — 30일 미승인 학원 자동 비활성화

### 데이터 정리
- `cleanupDeletedUser` (onDocumentUpdated) — `deleted_at` 기록 후 30일 뒤 완전 삭제
- `backupFirestore` (onSchedule, 매일 03:00) — Firestore Export → Storage `/backups/YYYY-MM-DD/`

---

## 작성 규칙

- Admin SDK 는 `functions/lib/admin.ts` 에서만 초기화 — 각 파일에서 직접 초기화 금지
- FCM 발송 로직은 `functions/notifications/` 헬퍼로 분리 — 중복 작성 금지
- `onSchedule` 함수는 반드시 멱등성(idempotent) 보장 — 중복 실행돼도 결과 동일해야 함
- 에러 발생 시 `throw new HttpsError(...)` 사용 — 일반 `throw Error` 금지 (onCall 한정)
- 모든 Firestore 다중 쓰기는 `batch` 또는 `transaction` 사용 — 개별 `set()` 반복 금지

---

## 배포

```bash
# 전체 배포
firebase deploy --only functions

# 단일 함수만 배포 (권장 — 영향 범위 최소화)
firebase deploy --only functions:kakaoCustomToken
firebase deploy --only functions:sendHomeworkDueAlert
```
