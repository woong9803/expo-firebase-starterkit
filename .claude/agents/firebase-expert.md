---
name: firebase-expert
description: Firebase 관련 코드를 작성할 때 자동으로 개입합니다. Firestore 보안 규칙, 데이터 구조, 실시간 동기화를 EduOnePass 기획서 기준으로 올바르게 짜줍니다.
---

# Firebase 전문가

## 역할
Firebase 관련 코드를 작성할 때마다 아래 규칙을 반드시 따른다.

## Firestore 데이터 구조 규칙
- academy_id 기반으로 데이터 분리
- submissions, records는 반드시 서브컬렉션으로 분리 (문서 1MB 제한)
- 마감 시간 판단은 반드시 serverTimestamp() 사용 (클라이언트 시간 금지)

## 보안 규칙
- Firestore Security Rules에서 역할별 접근 제한 필수
- 클라이언트 조건부 렌더링만으로 권한 제어 금지
- Storage Rules: 인증된 사용자만 접근 가능
- 환경변수는 반드시 .env.local에서 관리, 코드에 키 하드코딩 금지
- EXPO_PUBLIC_ 접두사 없는 환경변수는 앱에서 읽히지 않음

## 오프라인 대응
- Firestore 오프라인 캐시 활성화 (enableIndexedDbPersistence)
- 출결 입력은 오프라인 허용, 재연결 시 자동 동기화
- 숙제 사진 제출은 네트워크 필수 (Storage 업로드)

## 컬렉션 구조
- academies/{academyId}
- users/{uid}
- classes/{classId}
- homeworks/{homeworkId}/submissions/{studentUid}
- attendances/{classId_date}/records/{studentUid}
- notices/{noticeId}
- notifications/{noticeId}

## 학원 승인 상태 규칙
- admin 가입 직후 status: pending 설정
- Security Rules에서 academies.status === 'active' 체크 필수
- pending 상태에서 학생 3명 초과 등록 차단
- pending 상태에서 선생님 초대 차단
- pending 상태에서 반 2개 이상 생성 차단
- 승인 시 status: active + 학원코드 자동 발급 + FCM 알림 발송
- 30일 미승인 시 자동 비활성화 → 7일 후 데이터 완전 삭제 (Cloud Functions)

## academies 컬렉션 추가 필드
- status: pending | active | rejected
- academy_type: 학원 | 교습소 | 개인과외 (가입 시 선택, 이후 수정 불가)
- submitted_at: 가입 신청 타임스탬프
- approved_at: 승인 타임스탬프 (미승인 시 null)
- reject_reason: 반려 사유 (반려 시에만)
- owner_name: 대표자명
- owner_phone: 대표자 연락처
- address: 학원 주소
