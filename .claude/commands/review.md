---
description: '현재 코드를 분석하고 버그, 개선점, 더 좋은 방법을 알려줍니다'
argument-hint: 파일경로 또는 검토받고 싶은 내용
allowed-tools: ['Read', 'Bash(git diff:*)']
---

# Claude 명령어: Review

## 사용법
/review components/Button.tsx
/review 전체 코드

## 프로세스
1. $ARGUMENTS로 받은 파일 또는 코드 분석
2. 아래 항목 순서로 검토

## 검토 항목

**1. 버그 가능성**
- 오류가 날 수 있는 부분
- 빠진 예외 처리

**2. 코드 품질**
- 더 간단하게 쓸 수 있는 부분
- 중복된 코드

**3. React Native 규칙**
- React Native에서 하면 안 되는 패턴
- 성능에 나쁜 영향을 주는 코드

**4. 초보자 팁**
- 이 코드에서 배울 수 있는 것
- 앞으로 이렇게 쓰면 더 좋아지는 부분

## 출력 형식
- 잘된 점 먼저
- 고칠 점은 이유와 함께
- 어려운 용어는 쉽게 설명
- 수정 예시 코드 포함
