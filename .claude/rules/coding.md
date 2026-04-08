---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "components/**/*.ts"
  - "components/**/*.tsx"
  - "lib/**/*.ts"
  - "store/**/*.ts"
  - "types/**/*.ts"
  - "constants/**/*.ts"
---
# 코딩 규칙

## UI 텍스트
- 모든 UI 문자열은 `constants/strings.ts`에서 import — 코드 내 한글/영문 문자열 하드코딩 금지

## Firebase
- 초기화는 `lib/firebase.ts` 단 하나에서만 수행
- 마감 시간 판단은 반드시 `serverTimestamp()` 사용 — 클라이언트 `new Date()` 금지
- 카카오 Admin Key는 Cloud Functions 환경변수에만 저장 — 클라이언트 코드 절대 포함 금지

## 환경변수
- 모든 키는 `.env.local`에서만 관리 — 코드에 하드코딩 금지
- Expo 앱에서 읽히려면 반드시 `EXPO_PUBLIC_` 접두사 필요

## 상태관리
- 전역 상태는 Zustand store(`store/`)에서만 관리 — 컴포넌트 내 prop drilling 금지

## 타입
- 새 Firestore 필드 추가 시 `types/index.ts` 타입 정의 동시 업데이트 필수
