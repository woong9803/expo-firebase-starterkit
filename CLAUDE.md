Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 지침서입니다.
세부 규칙은 `.claude/rules/` 파일을 참조하세요.

---

## 기술 스택

### 앱 (React Native)
- **프레임워크**: React Native + Expo + TypeScript (strict 모드)
- **라우팅**: expo-router (파일 기반, 역할별 화면 분리)
- **상태관리**: Zustand
- **백엔드**: Firebase — Firestore · Auth · Storage · FCM · Cloud Functions

### 웹 대시보드 (admin 전용)
- **프레임워크**: React + Vite + TypeScript
- **스타일**: TailwindCSS
- **데이터**: React Query + Firebase (앱과 동일 DB 공유)
- **차트**: Recharts
- **배포**: Firebase Hosting 또는 Vercel

---

## 폴더 구조

```
app/             # Expo 앱 소스 → app/CLAUDE.md 참조
├── (auth)/      # 로그인 전 화면
└── (app)/       # 로그인 후 화면 (역할별 분기)

functions/       # Cloud Functions → functions/CLAUDE.md 참조
├── auth/
├── homework/
├── academy/
└── notifications/

components/      # 재사용 공통 컴포넌트
lib/             # Firebase 초기화, 헬퍼 함수
store/           # Zustand 전역 상태
types/           # TypeScript 타입 정의
constants/       # strings.ts — UI 텍스트 (하드코딩 금지)
.claude/rules/   # 세부 규칙 문서
```

> 각 폴더 진입 시 해당 `CLAUDE.md` 를 우선 참조할 것
> - `app/CLAUDE.md` — expo-router·컴포넌트·카메라·인증 흐름
> - `functions/CLAUDE.md` — 트리거 유형·함수 목록·배포 명령어

---

## 세부 규칙 참조

| 파일 | 내용 | 로드 조건 |
|------|------|----------|
| `.claude/rules/workflow.md` | 빌드·테스트·린트 명령어, 작업 순서 | 항상 (전역) |
| `.claude/rules/coding.md` | 코딩 컨벤션, Firebase·환경변수·상태관리 규칙 | `app/` `components/` `lib/` `store/` `types/` `constants/` 작업 시 |
| `.claude/rules/security.md` | Security Rules 원칙, 역할별 권한표, 학원 승인 정책 | `firestore.rules` `storage.rules` `app/(auth)/` `lib/firebase.ts` `functions/` 작업 시 |
| `.claude/rules/domain-terms.md` | 역할·출결·숙제·구독 등 도메인 용어 정의 | `app/` `components/` `lib/` `store/` `types/` 작업 시 |
