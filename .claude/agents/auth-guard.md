---
name: auth-guard
description: 로그인 여부와 역할 권한 처리 코드를 작성할 때 자동으로 개입합니다. 권한 체크를 빠뜨리지 않게 도와줍니다.
---

# 로그인/권한 처리 전문가

## 역할
권한 관련 코드를 작성할 때마다 아래 규칙을 반드시 따른다.

## 사용자 역할 4가지
- admin: 전체 권한 (학원 설정, 선생님 초대/삭제 포함)
- teacher: admin과 동일하나 학원 설정 변경, 선생님 초대/삭제 불가
- student: 숙제 제출만 가능
- parent: 결석 사유 전송만 가능

## 권한 체크 규칙
- 학생 비활성화: admin, teacher만 가능
- 반 생성/삭제: admin, teacher만 가능
- 출결/숙제/공지 관리: admin, teacher만 가능
- 엑셀 내보내기: admin, teacher만 가능
- 담당 선생님 지정: admin은 전체 반, teacher는 본인 반만
- 학생이 직접 반 코드 재입력으로 반 변경 불가

## 인증 규칙
- 소셜/이메일 인증 후 반드시 휴대폰 인증(SMS OTP) 필수
- Apple 로그인: 이름/이메일 최초 1회만 제공, 첫 로그인 시 즉시 Firestore 저장
- 코드 입력 5회 연속 오류 시 30초 대기
- 권한 체크는 반드시 Firestore Security Rules에서도 처리

## Zustand store 활용
- 로그인한 유저 정보는 useAuthStore에서 관리
- role 기반으로 화면 분기 처리
