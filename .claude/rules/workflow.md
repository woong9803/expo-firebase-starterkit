# 빌드, 테스트 & 워크플로우

## 빌드
```bash
npx expo start            # 앱 개발 서버
npx expo start --ios      # iOS 시뮬레이터
npx expo start --android  # 안드로이드 에뮬레이터
npx tsc --noEmit          # 타입 체크 (빌드 없이)
```

## 테스트
```bash
# 단일 파일만 테스트 — 관련 파일만 실행할 것 (전체 실행 금지, 성능)
npx jest --testPathPattern=<filename>

# 예시
npx jest --testPathPattern=homework
npx jest --testPathPattern=attendance
```

## 린트
```bash
# 수정한 파일만 (작업 중 수시 확인)
npx eslint app/경로/파일명.tsx

# 구현 완료 후 전체 확인
npx eslint app/ components/ lib/ store/ types/
```

## 워크플로우 — 코드 수정 시 순서
1. 코드 수정
2. 타입 체크: `npx tsc --noEmit` — 오류 0개 확인
3. 관련 파일 테스트: `npx jest --testPathPattern=<수정한기능>`
4. 린트: `npx eslint <수정한파일경로>`
5. 완료

## 추가 검증 규칙
- Firebase Security Rules 변경 시 → Firestore Rules Playground에서 역할별 시나리오 검증 필수
- 새 Firestore 필드 추가 시 → `types/index.ts` 타입 정의 동시 업데이트
- `serverTimestamp()` 관련 로직 수정 시 → 마감 판단 단위 테스트 필수
