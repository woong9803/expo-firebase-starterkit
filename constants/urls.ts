// 법적 문서 URL — 코드 내 하드코딩 금지, 여기서만 관리
//
// 노션 "웹에 게시" URL 사용:
//   - www.notion.so/*           → 비공개 워크스페이스 링크 (외부인 접근 불가)
//   - {workspace}.notion.site/* → 공개 게시 URL (스토어 심사관·이용자 접근 가능)
//
// 변경 시: 노션에서 페이지 → 공유 → 게시 → "웹에 게시" 토글 ON 후 URL 복사
export const LEGAL_URLS = {
  privacyPolicy: 'https://grave-marigold-251.notion.site/3469b0728da68003bfe6d477d7781829',
  termsOfService: 'https://grave-marigold-251.notion.site/3469b0728da680118a1ffdb93b0fa739',
};
