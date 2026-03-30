# Expo + Firebase Starter Kit

React Native 앱을 빠르게 시작할 수 있는 범용 스타터킷입니다.

## 기술 스택
- React Native + Expo + TypeScript
- Firebase (Firestore, Auth, Storage)
- Zustand (전역 상태관리)
- expo-router (파일 기반 라우팅)

## 폴더 구조
```
app/(auth)/     # 로그인 전 화면
app/(app)/      # 로그인 후 화면
lib/            # Firebase 초기화
store/          # Zustand 전역 상태
types/          # TypeScript 타입
constants/      # UI 텍스트 (하드코딩 금지)
components/     # 공통 컴포넌트
```

## 시작하는 방법

### 1. 이 템플릿으로 새 레포 만들기
GitHub에서 "Use this template" 버튼 클릭

### 2. 클론 후 의존성 설치
```bash
git clone https://github.com/내아이디/내프로젝트.git
cd 내프로젝트
npm install
```

### 3. 환경변수 설정
.env.example 파일을 .env.local로 복사 후 Firebase 키 입력
```bash
cp .env.example .env.local
```

### 4. Firebase 프로젝트 연결
console.firebase.google.com에서 새 프로젝트 생성 후
.env.local에 발급받은 키 값 입력

### 5. 개발 서버 실행
```bash
npx expo start
```

## Claude Code 커맨드
```
/add-component [이름]   # 새 컴포넌트 생성
/commit                 # 이모지 커밋 메시지 자동 작성
/review [파일경로]      # 코드 리뷰 요청
```

## Claude Code 서브에이전트
- **firebase-expert**: Firestore 보안 규칙, 데이터 구조 전문가
- **auth-guard**: 로그인/권한 처리 전문가
- **screen-builder**: 역할별 화면 구조 설계 전문가
- **korean-ux**: 한국 사용자 맞춤 UX 전문가
- **web-dashboard-expert**: 웹 대시보드 전문가
- **pro-plan-guard**: Pro 플랜 기능 체크 전문가

## 주의사항
- .env.local은 절대 GitHub에 올리지 말 것 (.gitignore에 포함됨)
- UI 텍스트는 반드시 constants/strings.ts에서 관리
- Firebase 키는 코드에 직접 쓰지 말 것
