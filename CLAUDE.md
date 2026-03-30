# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 지침서입니다.

## 기술 스택
- React Native + Expo (expo-router, TypeScript strict 모드)
- Firebase (Firestore, Auth, Storage)
- Zustand (전역 상태관리)

## 개발 명령어
```bash
npx expo start           # 개발 서버
npx expo start --ios     # iOS 시뮬레이터
npx expo start --android # 안드로이드 에뮬레이터
```

## 폴더 구조
```
app/(auth)/     # 로그인 전 화면 (로그인, 회원가입)
app/(app)/      # 로그인 후 화면 (메인 기능)
lib/            # Firebase 초기화, 헬퍼 함수
store/          # Zustand 전역 상태
types/          # TypeScript 타입 정의
constants/      # UI 텍스트 (strings.ts — 하드코딩 금지)
components/     # 재사용 가능한 공통 컴포넌트
```

## 코딩 규칙
- 모든 UI 텍스트는 constants/strings.ts에서 가져올 것 (하드코딩 금지)
- Firebase 초기화는 lib/firebase.ts 하나에서만 관리
- 전역 상태는 Zustand store에서만 관리
- 환경변수는 반드시 .env.local에서 관리 — 코드에 키 하드코딩 금지
- EXPO_PUBLIC_ 접두사 없는 환경변수는 앱에서 읽히지 않음

## 새 프로젝트 시작 시 체크리스트
- [ ] .env.example → .env.local 복사 후 Firebase 키 입력
- [ ] types/index.ts에 프로젝트 전용 타입 추가
- [ ] constants/strings.ts에 UI 텍스트 추가
- [ ] app/(auth)/, app/(app)/ 안에 화면 파일 생성