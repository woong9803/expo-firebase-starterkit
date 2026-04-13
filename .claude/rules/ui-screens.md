# EduOnePass UI 디자인 규칙

새로운 화면 구현 전 반드시 이 파일을 확인할 것.
시각적 레퍼런스: 프로젝트 루트의 `EduOnePass_All_Screens_5.html`

---

## 컬러 시스템

```ts
// 배경
페이지 배경:  #ffffff
카드 배경:    #F8FAFC
카드 보더:    #E2E8F0

// 텍스트
주요 텍스트:  #0F172A
서브 텍스트:  #64748B
힌트 텍스트:  #94A3B8

// 포인트 컬러
Primary(보라): #5B50E8  ← 버튼, 활성탭, 링크, 선택상태
학부모(주황):  #F59E0B
학생(초록):    #10B981

// 헤더 그라데이션 (선생님 / admin 홈 카드)
#7C3AED → #5B50E8

// Semantic
성공/완료:  #10B981 / bg #ECFDF5 / txt #065F46
경고/지각:  #F59E0B / bg #FFFBEB / txt #78350F
오류/결석:  #EF4444 / bg #FEF2F2 / txt #991B1B
```

---

## 공통 컴포넌트

### 버튼

| 종류 | 배경 | 텍스트 | 기타 |
|------|------|--------|------|
| Primary | #5B50E8 | #fff | borderRadius 14 / height 52 / fontSize 15 / fontWeight 700 |
| Secondary | #F1F5F9 | #1E293B | border 1px #E2E8F0 / borderRadius 14 / height 52 |
| Danger | #FEF2F2 | #991B1B | border 1px #FECACA / borderRadius 14 |
| 카카오 | #FEE500 | #191919 | borderRadius 14 / height 52 |
| Google | #fff | #333 | border 1.5px #E2E8F0 / borderRadius 14 / height 52 |
| Apple | #0F172A | #fff | borderRadius 14 / height 52 |

### 카드

```
bg #fff / border 1px #E2E8F0 / borderRadius 14 / padding 12 13
```

### 입력 필드

```
bg #F1F0FB / border 1.5px #E2E8F0 / borderRadius 12 / padding 14 16
placeholder color #94A3B8 / fontSize 15 / color #0F172A
포커스: border-color #5B50E8
```

### 칩 / 뱃지

| 종류 | 배경 | 텍스트 | borderRadius |
|------|------|--------|-------------|
| D-0 | #FEE2E2 | #991B1B | 8 |
| D-n | #F1F5F9 | #334155 | 8 |
| 완료 | #ECFDF5 | #065F46 | 8 |
| 중요공지 | #EF4444 | #fff | 6 |
| 반태그 활성 | #0F172A | #fff | 8 |
| 반태그 비활성 | #F1F5F9 | #334155 | 8 / border 1px #E2E8F0 |

### 스텝 인디케이터 (온보딩)

```
활성:   width 28 / height 8 / borderRadius 4 / bg #5B50E8
비활성: width 8  / height 8 / borderRadius 4 / bg #E2E8F0
가로 배열 / gap 6 / 중앙 정렬
```

### 바텀탭

```
height 60 / bg #fff / borderTop 1px #E2E8F0
활성:   color #5B50E8 + 하단 dot (width 4, height 4, borderRadius 2, bg #5B50E8)
비활성: color #CBD5E1
뱃지(숫자) 사용 금지
```

### 역할별 탭 구성

| 역할 | 탭 순서 |
|------|---------|
| 선생님 | 홈 · 숙제 · 출결 · 공지 · 내정보 |
| 학생 | 홈 · 숙제 · 영상 · 출결 · 내정보 |
| 학부모 | 홈 · 숙제 · 공지 · 내정보 |
| admin | 홈 · 숙제 · 출결 · 학생 · 공지 · 설정 |

### 헤더 구조 (모든 역할 공통)

```
bg #fff / borderBottom 1px #E2E8F0 / padding 12 14
인사말:  fontSize 10~13 / color #64748B
이름:    fontSize 19~22 / fontWeight 800 / color #0F172A
아바타:  38×38 / borderRadius 19
```

### 역할별 홈 그라데이션 카드

```
선생님 / admin: bg linear-gradient(#7C3AED, #5B50E8) — 헤더 아래 별도 카드 영역
학생:           그라데이션 없음. 흰 헤더 + 초록(#10B981) 스트릭 카드 별도
학부모:         그라데이션 없음. 흰 헤더 + 주황(#F59E0B) 출결 카드 별도
```

---

## 온보딩 화면별 규칙

### 공통
- 배경 #fff
- padding 좌우 24 / KeyboardAvoidingView + ScrollView

### 시작화면
- 앱 아이콘: 80×80 / borderRadius 20 / bg #0F172A / 중앙 배치
- 특징 카드 3개: bg #F8FAFC / border 1px #E2E8F0 / borderRadius 12 / padding 14
  - 아이콘박스: 42×42 / borderRadius 10
  - 카드1 (숙제 스캔): 아이콘박스 bg #E6F1FB
  - 카드2 (원터치 출결): 아이콘박스 bg #ECFDF5
  - 카드3 (법정 출석부): 아이콘박스 bg #FFFBEB
- Primary 버튼 "시작하기" + Secondary 버튼 "이미 계정이 있어요"
- 하단: "이미 계정이 있으신가요? 로그인" + 약관 텍스트

### 로그인
- 소셜 버튼 3개 세로 배열 (카카오 / Google / Apple)
- 하단: "계정이 없으신가요? 회원가입" 링크

### 회원가입
- 스텝 인디케이터 1/4
- 소셜 빠른 가입: 회색 박스(bg #F1F5F9) 안 아이콘 3개 가로 배열

### 휴대폰 인증 (2단계로 분리)
- 1단계 (번호 입력):
  - 📱 아이콘: 58×58 / bg #E6F1FB / borderRadius 29 / 중앙 정렬
  - 번호 입력 필드 + "인증번호 받기" Primary 버튼
- 2단계 (OTP 입력):
  - OTP 6칸: width 46 / height 54 / borderRadius 10 / 자동 다음칸 이동
    - 입력됨: border 1.5px #5B50E8 / bg #EEEDF9 / color #3730A3
    - 포커스: border 1.5px #5B50E8
    - 미입력: border 1.5px #E2E8F0 / bg #F8FAFC
  - 타이머 카드: bg #F8FAFC / border 1px #E2E8F0 / 카운트다운 color #5B50E8
  - 프로그레스바: fill #5B50E8 / 시간 따라 감소
  - "번호 오류? 다시 입력하기" → 1단계로 돌아감

### 역할 선택
- 스텝 인디케이터 3/4
- 역할 카드: border 1.5px #E2E8F0 / borderRadius 16 / padding 16
  - 선택: border #5B50E8 / bg #EEEDF9 / 우측 체크원 bg #5B50E8
  - 아이콘박스: 48×48 / borderRadius 12
- 다음 버튼: 미선택 시 bg #E2E8F0(비활성) / 선택 후 bg #5B50E8(활성)

### 코드 입력
- 스텝 인디케이터 4/4
- 큰 코드 입력창:
  bg #EEEDF9 / border 1.5px #5B50E8 / borderRadius 14
  fontSize 28 / fontWeight 800 / color #3730A3 / letterSpacing 6 / 중앙 정렬
  placeholder: "_ _ _ _ _ _" (letterSpacing 적용 시 잘림 주의 — placeholder는 짧게)
- 유효 코드 확인 텍스트: "✓ 올바른 코드예요" color #5B50E8 중앙
- 학원/반 정보 카드: bg #F8FAFC / border 1px #E2E8F0 / borderRadius 14
- "이 학원(반)에 참여하기" Primary 버튼 + "다시 입력하기" Secondary 버튼

### 승인 대기 (admin 전용)
- 아이콘: 80×80 / bg #FEF3C7 / border 1px #FDE68A / borderRadius 40
- 신청 정보 카드: bg #FFFBEB / border 1px #FDE68A / borderRadius 14
  - 데이터: Firestore academy 문서에서 실시간 조회 (하드코딩 금지)
- 사용 가능 카드: bg #F8FAFC / border 1px #E2E8F0 / borderRadius 14
- "카카오톡으로 문의" Secondary + "미리 탐색해보기" Primary

---

## 역할별 홈 화면 규칙

### 선생님 홈
- 보라 그라데이션 카드 (헤더 아래):
  - 인사말 + 이름 + 알림 아이콘
  - 통계 3칸: 미검사 숙제 / 오늘 결석 / 이번달 출석률
- 담당 반 가로 스크롤 카드
- 숙제 검사 현황 카드 (D-Day 칩 + 프로그레스바 + 제출/미제출 칩)
- 최근 공지 카드 (좌측 세로바 + 읽음 프로그레스바)

### 학생 홈
- 흰 헤더 + 우측 스트릭 뱃지 (작게, bg #F1F5F9)
- 초록 스트릭 카드: bg linear-gradient(#10B981, #059669) + 막대 그래프
- 숙제 카드:
  - D-0: border-left 3px solid #EF4444 + Primary "📷 지금 제출하기" 버튼
  - D-n: border-left 3px solid #5B50E8 + Secondary 버튼
  - 완료: border #A7F3D0 / bg #F0FDF4 + 피드백 텍스트
- 공지 카드: 탭 없이 홈 하단에 표시
  - 중요: bg #FEF2F2 / border #FECACA / 🔴 이모지
  - 일반: 일반 카드

### 학부모 홈
- 흰 헤더 + 자녀 탭 칩 (활성: bg #F59E0B)
- 주황 출결 카드: bg linear-gradient(#F59E0B, #D97706)
- 오늘 숙제: 미제출(빨강 카드) / 완료(초록 카드)
- 결석 사유 칩: 선택 시 bg #F59E0B / color #fff
- "선생님께 전송하기" Primary 버튼: bg #F59E0B

### admin 홈
- 보라 그라데이션 카드:
  - 인사말 + 학원명 + 알림 아이콘
  - 통계 2칸: 전체 학생 / 오늘 출석률
  - 하단 3칸: 반 수 / 선생님 수 / 플랜
- 오늘 확인 필요: 결석(빨강 박스) / 미입력(노랑 박스)
- 반별 출석률 프로그레스바 카드
- 승인 대기 배너 (pending 상태일 때만): bg #FFFBEB / border #FDE68A

---

## 절대 하지 말 것

1. `#2176C7` 블루 버튼 사용 금지 — 포인트색은 `#5B50E8` (보라)
2. 하드코딩 샘플 데이터 사용 금지 — 반드시 Firestore 실데이터 연결
3. 바텀탭 숫자 뱃지 사용 금지
4. 헤더 배경에 컬러/그라데이션 사용 금지 — 항상 `#fff`
5. 역할별로 다른 컴포넌트 스타일 사용 금지 — 위 규칙으로 통일
6. 로딩/에러 처리 생략 금지
7. letterSpacing이 큰 TextInput에 긴 placeholder 사용 금지 (잘림 이슈)

---

## 새 화면 구현 순서

1. `EduOnePass_All_Screens_5.html` 에서 해당 화면 섹션 시각 확인
2. 위 컬러 / 컴포넌트 규칙 적용
3. Firestore 실데이터 연결 (로딩 / 에러 처리 포함)
4. 가짜 데이터, 하드코딩 텍스트 없이 구현
