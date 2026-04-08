---
paths:
  - "firestore.rules"
  - "storage.rules"
  - "app/(auth)/**"
  - "lib/firebase.ts"
  - "store/auth*.ts"
  - "functions/**/*.ts"
---
# 보안 & 권한 규칙

## Security Rules 원칙
- 클라이언트 조건부 렌더링만으로 권한 제어 불충분 — Firestore/Storage Rules에서 반드시 재검증
- Pro 기능: Rules에서 `academies.plan` 체크 — 클라이언트 우회 차단
- 학원 승인 상태: Rules에서 `academies.status` 체크

## 역할별 권한
| 기능 | admin | teacher | student | parent |
|------|-------|---------|---------|--------|
| 학원 설정 변경 | ✓ | ✗ | ✗ | ✗ |
| 선생님 초대/삭제 | ✓ | ✗ | ✗ | ✗ |
| 학생 비활성화 | ✓ | ✓ | ✗ | ✗ |
| 반 생성/삭제 | ✓ | ✓ | ✗ | ✗ |
| 담당 선생님 지정 | ✓ | ✓(본인 반만) | ✗ | ✗ |
| 학생 반 이동 | ✓ | ✓ | ✗ | ✗ |
| 출결·숙제·공지 관리 | ✓ | ✓ | ✗ | ✗ |
| 출결 엑셀 내보내기 | ✓ | ✓ | ✗ | ✗ |
| 숙제 제출 | ✗ | ✗ | ✓ | ✗ |
| 결석 사유 전송 | ✗ | ✗ | ✗ | ✓ |

## 학원 승인 정책
- admin 가입 직후 `status: pending` — 기능 제한 상태
- `status: active` 전까지: 학생 최대 3명, 반 1개, 선생님 초대 불가, Pro 전환 불가
- 30일 이내 미승인 시 자동 비활성화 → 7일 유예 후 완전 삭제
- 파일럿 단계: Firestore `status` 수동 변경으로 승인 처리
