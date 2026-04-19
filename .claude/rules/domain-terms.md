---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "components/**/*.ts"
  - "components/**/*.tsx"
  - "lib/**/*.ts"
  - "store/**/*.ts"
  - "types/**/*.ts"
---
# 도메인 용어 정의

코드·주석·변수명 작성 시 아래 용어를 일관되게 사용할 것.

## 사용자 역할
| 한국어 | 영문 변수명 | 설명 |
|--------|------------|------|
| 원장님 | `admin` | 학원 최고 관리자. 학원 생성 시 자동 부여 |
| 선생님 | `teacher` | 반 운영 담당. 학원코드로 가입 |
| 학생 | `student` | 반 코드로 가입. 가상 이메일 계정 지원 |
| 학부모 | `parent` | 자녀 연동코드로 가입. 다자녀 연동 가능 |

## 학원 관련
| 한국어 | 영문 변수명 | 설명 |
|--------|------------|------|
| 학원 | `academy` | 서비스 최상위 단위. `academies/{academyId}` |
| 반 | `class` | 학원 내 수업 단위. `classes/{classId}` |
| 학원코드 | `academyCode` | 선생님 가입 시 입력. `academies` 문서에 저장 |
| 반 코드 / 초대코드 | `inviteCode` | 학생 가입 시 입력. 6자리 영숫자 |
| 연동코드 | `linkCode` | 학부모가 자녀 계정 연결 시 사용. 6자리 |
| 담당 선생님 | `headTeacher` | 반의 주담당. `classes.headTeacherId` |

## 숙제 관련
| 한국어 | 영문 변수명 | 설명 |
|--------|------------|------|
| 숙제 | `homework` | `homeworks/{homeworkId}` |
| 제출물 | `submission` | `homeworks/{id}/submissions/{studentUid}` |
| 지각 제출 | `lateSubmission` | `isLate: true` — 마감 후 제출 |
| 스트릭 | `streak` | 마감 전 연속 제출 일수. 지각·미제출 시 초기화 |
| 피드백 | `feedback` | 선생님 원터치 반응: 👍(pass) / 💧(retry) |

## 출결 관련
| 한국어 | 영문 변수명 | 설명 |
|--------|------------|------|
| 출결 | `attendance` | `attendances/{classId_date}` |
| 출석 | `present` | `status: 'present'` |
| 지각 | `late` | `status: 'late'` |
| 결석 | `absent` | `status: 'absent'` |
| 휴원 | `onLeave` | `status: 'onLeave'` — 엑셀 출력 시 `-` |
| 결석 사유 | `reason` | 학부모가 앱에서 입력. `attendances.records.reason` |
| 명렬표 | `rosterTable` | 선생님 화면의 실시간 출결 입력 UI |

## 학원 상태
| 한국어 | 영문 값 | 설명 |
|--------|---------|------|
| 승인 대기 | `pending` | admin 가입 직후. 기능 제한 |
| 승인 완료 | `active` | 정상 운영 상태 |
| 반려 | `rejected` | 승인 거절 |

## 구독 플랜
| 한국어 | 영문 값 | 학생 수 | 월 구독료 | 설명 |
|--------|---------|---------|---------|------|
| 무료 | `free` | — | — | 기본 기능만 (미결제) |
| 체험 | `trial` | — | — | 14일 무료 체험 |
| 스타터 | `starter` | 30명 이하 | 29,000원 | 핵심 기능 전체 |
| 스탠다드 | `standard` | 30~100명 | 59,000원 | 스타터 + 영상·자동알림·읽음확인 |
| 프로 | `pro` | 100명 이상 | 99,000원 | 스탠다드 + 웹 대시보드·무제한 |

> 유료 플랜 판별: `plan !== 'free'` 로 체크 — starter/standard/pro/trial 모두 유료로 간주
