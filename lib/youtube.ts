/**
 * YouTube 유틸 함수
 * - URL에서 videoId 파싱
 * - 썸네일 URL 생성
 */

/**
 * YouTube URL에서 videoId를 추출한다.
 * 지원 형식:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *
 * @returns videoId 문자열, 파싱 실패 시 null
 */
export function parseYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // youtu.be 단축 URL — 경로 자체가 videoId
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1); // 앞 '/' 제거
      return id || null;
    }

    // youtube.com/watch?v=VIDEO_ID
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }

    // youtube.com/embed/VIDEO_ID 또는 youtube.com/shorts/VIDEO_ID
    const pathMatch = parsed.pathname.match(/\/(embed|shorts|v)\/([^/?&]+)/);
    if (pathMatch) {
      return pathMatch[2];
    }

    return null;
  } catch {
    // URL 파싱 실패 (잘못된 형식)
    return null;
  }
}

/**
 * YouTube videoId로 썸네일 URL을 반환한다.
 * 품질 옵션:
 *   - 'maxres' : 1280×720 (최고화질, 없는 경우도 있음)
 *   - 'hq'     : 480×360  (기본 고화질)
 *   - 'mq'     : 320×180  (중간화질)
 *   - 'default': 120×90   (기본)
 */
export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: 'maxres' | 'hq' | 'mq' | 'default' = 'hq',
): string {
  const qualityMap = {
    maxres: 'maxresdefault',
    hq: 'hqdefault',
    mq: 'mqdefault',
    default: 'default',
  };

  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

/**
 * YouTube videoId로 재생 URL을 반환한다.
 * 앱 내 WebView 또는 Linking.openURL에 사용
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
