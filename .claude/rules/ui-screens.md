---
description: UI 화면 개발 시 적용할 디자인 가이드
---

# EduOnePass UI 디자인 가이드

## 디자인 토큰

### 컬러
```
/* Primary — 딥 블루 */
--b900: #042C53
--b800: #0C447C
--b700: #185FA5
--b600: #1E6DB5
--b500: #2176C7  ← 주요 버튼, 활성 탭, 아바타, 강조
--b400: #378ADD  ← 프로그레스바 fill
--b300: #6AAEE6
--b100: #B5D4F4  ← 보더 강조
--b50:  #E6F1FB  ← 칩 배경, 카드 강조, 아이콘 배경

/* Neutral Gray */
--g900: #0F172A  ← 주요 텍스트
--g800: #1E293B
--g700: #334155
--g600: #475569
--g500: #64748B  ← 서브 텍스트
--g400: #94A3B8  ← 비활성 아이콘, 힌트
--g200: #E2E8F0  ← 보더, 구분선
--g100: #F1F5F9  ← 탭바 배경
--g50:  #F8FAFC  ← 페이지 배경

/* Semantic — 변경 없음 */
--red:   #EF4444 / bg: #FEF2F2 / txt: #991B1B  ← 결석, D-0, 미제출
--green: #10B981 / bg: #ECFDF5 / txt: #065F46  ← 출석, 완료
--amber: #F59E0B / bg: #FFFBEB / txt: #78350F  ← 지각, 검사대기
```

### 컴포넌트 스펙
```
카드:      border: 1px solid #E2E8F0 / border-radius: 16px / padding: 13px 14px
입력필드:  border: 1.5px solid #E2E8F0 / border-radius: 10px
버튼:      border-radius: 10px / font-weight: 700
칩/뱃지:  border-radius: 20px (pill)
상태바:    height: 44px
탑바:      height: 52px / border-bottom: 1px solid #E2E8F0
바텀탭:    height: 62px / border-top: 1px solid #E2E8F0
```

### 버튼
```
Primary:   background: #2176C7 / color: #fff
Secondary: background: #E6F1FB / color: #185FA5 / border: 1.5px solid #B5D4F4
Kakao:     background: #FEE500 / color: #191919
Google:    background: #fff    / color: #333    / border: 1.5px solid #E2E8F0
Apple:     background: #0F172A / color: #fff
```

### 칩 / 뱃지
```
D-0 (긴급):    background: #FEF2F2 / color: #991B1B
D-n (일반):    background: #E6F1FB / color: #0C447C
지각:          background: #FEF2F2 / color: #991B1B
완료:          background: #ECFDF5 / color: #065F46
검사대기:      background: #FFFBEB / color: #78350F
중요(공지):    background: #FEF2F2 / color: #991B1B
반 태그 활성:  background: #2176C7 / color: #fff
반 태그 비활성: background: #F1F5F9 / color: #475569
```

---

## 역할별 탭 구성

| 역할 | 탭 (순서대로) |
|------|-------------|
| 선생님 | 홈 · 숙제 · 출결 · 공지 · 내정보 |
| 학생   | 홈 · 숙제 · 영상 · 출결 · 내정보 |
| 학부모 | 홈 · 숙제 · 공지 · 내정보 |

> ⚠️ 스캔 버튼은 탭에 없음. 숙제 상세 화면 내 "제출하기" 버튼에서 카메라 진입.

---

## 역할별 홈 화면 구성

### 선생님 홈
- 헤더: 흰 배경 / 인사말+이름+아바타(알림닷) / 담당 반 태그
  - 아바타: background #2176C7
  - 활성 반 태그: background #2176C7 / color #fff
  - 비활성 반 태그: background #E6F1FB / color #185FA5 / border #B5D4F4
- 통계 타일 **2칸만**: 미검사 숙제(블루 배경 #E6F1FB) + 오늘 결석(빨간 배경)
  - ⚠️ 출석률은 홈에 표시하지 않음
- 최근 공지 카드: 읽음 프로그레스바(fill #378ADD) + 중요 공지 빨간 칩
- 숙제 현황 카드: 제출 프로그레스바(fill #10B981) + 지각 제출 꼬리표

### 학생 홈
- 헤더: 딥 블루(#0C447C) 배경 / 스트릭 뱃지 우측 상단 작게 (우선순위 "보완")
- 숙제 탭: 미제출(빨간뱃지) · 검사대기(노란뱃지) · 완료
- D-0 카드: 좌측 빨간 3px 보더 강조
- 공지 카드: ⚠️ **탭 추가 없이** 홈 하단 카드로 표시
  - 중요 공지: 빨간 배경 + 좌측 3px 빨간 바
  - 전체보기 링크: color #2176C7
- 스트릭 막대그래프: 홈 맨 하단 (우선순위 낮음 → 작게) / 바 색상 #378ADD

### 학부모 홈
- 헤더: 흰 배경 / 아바타 background #185FA5
- ⚠️ 스트릭·출석률 없음 (기획서 학부모 기능에 없는 항목)
- 자녀 카드: border #B5D4F4 / 미제출=빨간 박스 / 완료=초록 체크
- 결석 사유 칩: 선택 시 border #2176C7 + background #E6F1FB
- "선생님께 전송" 버튼: Primary 블루

---

## 주요 화면 상세 스펙

### 출결 명렬표 (선생님)
- 반 선택 칩: 활성=#2176C7+흰글, 비활성=회색
- 요약 헤더: 출석(초록)·지각(노랑)·결석(빨강)·미입력(회색) colored dots
- 학생 행: 이름(54px) + 출석/지각/결석 3버튼
  - 출석 선택: background #10B981 / color #fff
  - 지각 선택: background #F59E0B / color #fff
  - 결석 선택: background #EF4444 / color #fff
  - 미선택: 연한 semantic 배경
  - 학부모 결석 사유: 행 우측 10px 텍스트 (실시간)
- 하단: 엑셀 내보내기 버튼 (블루 아웃라인: border #B5D4F4 / color #185FA5)

### 숙제 검사·피드백 (선생님)
- 헤더: 제목 + D-Day + 제출 현황 프로그레스바 (fill #378ADD)
- 탭: 제출완료 N · 미제출 N
- 학생 행: 아바타(블루 계열) + 이름 + (지각 칩) + 썸네일 + 👍/💧 버튼
  - 선택된 피드백: border #378ADD + background #E6F1FB
- 미제출 구분 배너: 빨간 배경 ("미제출 N명 · 오후 6시 자동 알림 예정")
- 미제출 학생: opacity 0.45

### 스캔 제출 (학생)
- 배경: 다크(#0F172A)
- 엣지 감지 박스: 200×240px / 4모서리 블루 코너(#6AAEE6) 2.5px
- 상단: 흑백/컬러 토글 (pill) + N/5장 카운터
- 하단: 미리보기 스트립(최대 5장) + 셔터(중앙) + 제출하기(우측, background #2176C7)

### 수업 영상 (학생)
- 카드형 / 썸네일 96px / 다크 배경 / 재생 아이콘(흰 원형)
- 우측 하단: 영상 길이 (어두운 반투명 배지)

### 출결 캘린더 (학생)
- 월간 달력: 출석(초록) · 결석(빨강) · 지각(노랑) · 오늘(border #2176C7)
- 이달 요약 3칸 + 결석 기록 카드

---

## 온보딩 플로우

```
시작 → 로그인/회원가입 → 휴대폰 OTP → 역할 선택 → 코드 입력 → 완료
                                                        ↓ (원장님만)
                                              학원 정보 입력 → 승인 대기
```

### 스텝 인디케이터
- 완료: background #2176C7 + 흰 체크
- 현재: background #2176C7 + 숫자 + glow ring (0 0 0 3px #B5D4F4)
- 미완료: background #F1F5F9 + 회색 숫자

### OTP 박스 (6칸, 38×46px)
- 입력됨: border #378ADD + background #E6F1FB + color #0C447C
- 현재 입력: border #2176C7 + box-shadow: 0 0 0 3px #B5D4F4
- 미입력: border #E2E8F0 + background #F8FAFC

### 역할 선택 카드
- 선택 시: border #2176C7 + background #E6F1FB
- 체크 원: background #2176C7

### 승인 대기 화면 (원장님)
- 허용: 학생 3명, 반 1개, 출결·숙제·공지 (3명 범위)
- 차단: 선생님 초대, Pro 플랜 전환

---

## ⚠️ 반드시 지킬 것

1. **스캔 버튼은 탭에 없음** — 숙제 상세 화면 내 버튼에서 카메라 진입
2. **선생님 홈 통계는 2칸** — 미검사 숙제 + 오늘 결석만 (출석률 없음)
3. **학생 홈 공지** — 탭 추가 없이 홈 화면 하단 카드로 표시
4. **학부모에 스트릭/출석률 없음** — 기획서 학부모 기능에 없는 항목
5. **학생 스트릭은 작게** — 우선순위 "보완"이므로 홈 헤더에 작은 뱃지로만
6. **담당 반 표시** — 선생님 홈 헤더에 반드시 담당 반 태그 표시
7. **지각 꼬리표** — 숙제 검사 화면에서 지각 제출 학생 옆에 칩 표시
8. **미제출 자동 목록** — 숙제 검사 화면에서 미제출 학생은 opacity 0.45 + 구분 배너
