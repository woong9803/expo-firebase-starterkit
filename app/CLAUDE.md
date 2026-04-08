React Native + Expo 앱 소스 전용 지침입니다.
공통 규칙은 루트 `.claude/rules/` 를 참조하세요.

---

## 폴더 역할

```
app/(auth)/          # 로그인 전 — 가입·로그인·OTP 화면
app/(auth)/_layout.tsx

app/(app)/           # 로그인 후 — 역할별 메인 기능
app/(app)/(admin)/   # 원장님 전용 화면
app/(app)/(teacher)/ # 선생님 전용 화면
app/(app)/(student)/ # 학생 전용 화면
app/(app)/(parent)/  # 학부모 전용 화면
app/(app)/_layout.tsx
```

---

## expo-router 규칙

- 파일명 = 라우트 경로 — 임의 파일 추가 금지, 반드시 라우팅 의도 확인 후 생성
- 역할 확인은 `_layout.tsx` 에서만 수행 — 개별 화면에서 role 분기 금지
- 공유 화면(출결·숙제 등)은 `app/(app)/shared/` 에 위치, 역할별 폴더에 중복 생성 금지
- 딥링크·푸시 알림 이동은 `router.push()` 사용 — `router.replace()` 는 뒤로가기 불필요한 경우만

---

## 컴포넌트 작성 규칙

- 화면(Screen) 컴포넌트: `app/` 안에 위치
- 재사용 컴포넌트: `components/` 로 분리 — 2곳 이상 쓰이면 반드시 이동
- props 타입은 컴포넌트 파일 상단에 `interface Props` 로 선언 — 인라인 타입 금지
- 스타일은 `StyleSheet.create()` 사용 — 인라인 스타일 객체 직접 작성 금지

---

## 환경변수 (Expo 전용)

- 앱 번들에 포함되는 변수는 반드시 `EXPO_PUBLIC_` 접두사
- `EXPO_PUBLIC_` 변수는 빌드 시 번들에 노출됨 — API 시크릿·Admin Key 절대 사용 금지
- 시크릿이 필요한 요청은 Cloud Functions 를 거칠 것

```
EXPO_PUBLIC_FIREBASE_API_KEY=...   # ✅ 공개 가능
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...

KAKAO_ADMIN_KEY=...                # ✅ functions/.env 에만
```

---

## 네비게이션 & 인증 흐름

```
가입 플로우
소셜/이메일 인증 → OTP 인증 → 역할 선택 → 학원코드/반코드 입력 → (app)/

로그인 후 role 분기
users/{uid}.role === 'admin'   → (app)/(admin)/
users/{uid}.role === 'teacher' → (app)/(teacher)/
users/{uid}.role === 'student' → (app)/(student)/
users/{uid}.role === 'parent'  → (app)/(parent)/
```

- role 분기는 `app/(app)/_layout.tsx` 한 곳에서만 처리
- `users/{uid}.academy_id` 없으면 온보딩으로 리다이렉트

---

## Firestore 클라이언트 사용 규칙

- 초기화된 `db` 인스턴스는 `lib/firebase.ts` 에서만 import
- 마감 판단은 반드시 `serverTimestamp()` — `new Date()` 로 비교 금지
- 실시간 리스너(`onSnapshot`)는 `useEffect` cleanup 에서 반드시 구독 해제

```ts
useEffect(() => {
  const unsub = onSnapshot(ref, handler)
  return () => unsub()  // ✅ 필수
}, [])
```

---

## 카메라 & 이미지 처리 (숙제 스캔)

- 스캔 기능: `expo-camera` + `expo-image-manipulator` + `react-native-document-scanner-plugin`
- 업로드 전 클라이언트 압축 필수 — 목표 200KB 이하
- 마감 초과 제출은 `isLate: true` 로 자동 기록 — 클라이언트에서 막지 말 것
- 최대 5장 제한은 UI와 Firestore 저장 양쪽에서 모두 검증
