# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 지침서입니다.

## 기술 스택 — 앱
- React Native + Expo (expo-router, TypeScript strict 모드)
- Firebase (Firestore, Auth, Storage, FCM, Cloud Functions)
- Zustand (전역 상태관리)

## 기술 스택 — 웹 대시보드 (admin 전용)
- React + Vite + TypeScript
- TailwindCSS + React Query + Recharts
- Firebase (앱과 동일한 DB 공유)
- Firebase Hosting 또는 Vercel 배포

## 개발 명령어
npx expo start           # 앱 개발 서버
npx expo start --ios     # iOS 시뮬레이터
npx expo start --android # 안드로이드 에뮬레이터

## 폴더 구조
app/(auth)/     # 로그인 전 화면 (로그인, 회원가입)
app/(app)/      # 로그인 후 화면 (메인 기능)
lib/            # Firebase 초기화, 헬퍼 함수
store/          # Zustand 전역 상태
types/          # TypeScript 타입 정의
constants/      # UI 텍스트 (strings.ts — 하드코딩 금지)
components/     # 재사용 가능한 공통 컴포넌트

## 코딩 규칙
- 모든 UI 텍스트는 constants/strings.ts에서 가져올 것 (하드코딩 금지)
- Firebase 초기화는 lib/firebase.ts 하나에서만 관리
- 전역 상태는 Zustand store에서만 관리
- 환경변수는 반드시 .env.local에서 관리 — 코드에 키 하드코딩 금지
- EXPO_PUBLIC_ 접두사 없는 환경변수는 앱에서 읽히지 않음
- 마감 시간 판단은 반드시 serverTimestamp() 사용 (클라이언트 시간 금지)
- 카카오 Admin Key는 Cloud Functions 환경변수에만 저장 — 클라이언트 코드 절대 금지

## 학원 승인 정책
- admin 가입 직후 status: pending — 기능 제한 상태
- status: active 확인 후에만 전체 기능 사용 가능
- 미승인 시 학생 3명, 반 1개까지만 허용
- Security Rules에서 academies.status 반드시 체크

## 권한 구조
- admin: 전체 권한
- teacher: adfdafdafadfd