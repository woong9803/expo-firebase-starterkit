---
name: pro-plan-guard
description: Pro 플랜 관련 코드를 작성할 때 자동으로 개입합니다. 유료 기능에 플랜 체크를 빠뜨리지 않게 도와줍니다.
---

# Pro 플랜 전문가

## 역할
Pro 플랜 관련 코드를 작성할 때마다 아래 규칙을 반드시 따른다.

## 무료 vs Pro 기능 구분
무료에서 가능:
- 출결 관리
- 공지사항
- 숙제 목록 확인

Pro에서만 가능:
- 숙제 스캔 제출·검사
- 출결 엑셀 내보내기
- 수업 영상 등록
- 푸시 알림 (FCM)
- 읽음 확인
- 미제출 자동 알림
- 웹 대시보드 접근

## 플랜 체크 규칙
- Firestore academies/{academyId}.plan 필드로 체크
- plan 값: free | pro | trial
- 클라이언트 체크만으로 부족 — Security Rules에서도 반드시 체크
- Pro 전용 기능 진입 시도 시 → "이 기능은 Pro에서 사용할 수 있어요" 바텀시트 표시
- 바텀시트 구성: 기능 목록 + 가격 안내 + "14일 무료 체험 시작" 버튼

## 가격 구조
- 30명 이하: 월 3만원
- 30~100명: 월 6만원
- 100명 이상: 월 10만원

## 결제 규칙
- iOS/Android 앱: RevenueCat으로 인앱결제 처리
- 웹: 카드/계좌 직접 결제 (수수료 2~3%)
- iOS 앱 내에서 웹 결제 유도 금지 (앱스토어 정책 위반)
- trial_ends_at 필드로 체험 기간 만료 체크

## Security Rules 체크 예시
- academies.plan === 'pro' 또는 'trial' 확인
- trial의 경우 trial_ends_at > now() 추가 확인
- 미승인(pending) 학원은 Pro 전환 불가
