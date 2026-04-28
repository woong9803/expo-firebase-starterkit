import * as admin from 'firebase-admin';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as logger from 'firebase-functions/logger';
import { hashForLog } from '../lib/hash';

/**
 * P2-8 (2026-04-23): Storage 업로드 MIME 서버 검증
 *
 * 배경:
 *  - storage.rules 의 `contentType.matches('image/.*')` 검증은 클라이언트가
 *    보낸 헤더를 믿는 구조 — 악성 사용자가 image/png 헤더로 위장해
 *    JS/PHP/실행파일 업로드 가능 (XSS·악성 링크 배포 벡터)
 *
 * 동작:
 *  - 업로드 완료(onObjectFinalized) 직후 매직 바이트(앞 12바이트) 검사
 *  - JPEG/PNG/GIF/WEBP/HEIC(ISOBMFF) 외 형식이면 즉시 삭제
 *  - 검사 범위: `homeworks/**`, `profiles/**` (앱에서 이미지 업로드하는 경로만)
 *
 * 한계·보완:
 *  - onFinalize 는 "업로드 후" 트리거라 수 초간 파일이 스토어에 존재
 *    → 이 시간 동안 read rules 가 2차 방어선 (P1-1 학원 격리)
 *  - Content-Disposition 조작 대비 Storage 버킷의 CORS·정책도 점검 권장
 */

// 매직 바이트 첫 12바이트만 가져와 판별
const MAGIC_BYTES_SIZE = 16;

export const verifyUploadMimeType = onObjectFinalized(
  { region: 'asia-northeast3' },
  async (event) => {
    const object = event.data;
    const filePath = object.name;

    if (!filePath) return;

    // ── 경로 필터 ─ 앱에서 이미지 업로드하는 경로만 처리 (비용 절감)
    const isHomework = filePath.startsWith('homeworks/');
    const isProfile = filePath.startsWith('profiles/');
    if (!isHomework && !isProfile) return;

    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);

    try {
      // 앞부분만 다운로드 — 큰 파일도 IO 최소화
      const [buffer] = await file.download({ start: 0, end: MAGIC_BYTES_SIZE - 1 });

      if (!isValidImageMagic(buffer)) {
        // 매직 바이트 불일치 → 위장 파일로 간주하여 즉시 삭제
        await file.delete();
        logger.warn('[verifyUploadMimeType] 위장 이미지 삭제', {
          pathHash: hashForLog(filePath),
          contentType: object.contentType,
          size: object.size,
          firstBytes: buffer.slice(0, 8).toString('hex'),
        });
        return;
      }

      logger.debug('[verifyUploadMimeType] 검증 통과', {
        pathHash: hashForLog(filePath),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[verifyUploadMimeType] 검증 실패', {
        pathHash: hashForLog(filePath),
        error: msg,
      });
      // 검증 자체가 실패한 경우엔 파일 삭제하지 않음 (일시적 네트워크 오류 가능성)
      // 반복 실패 시 수동 확인하도록 로그만 남김
    }
  },
);

/**
 * 이미지 매직 바이트 판별 (화이트리스트 방식)
 *
 * 지원 형식:
 *  - JPEG: FF D8 FF
 *  - PNG:  89 50 4E 47
 *  - GIF:  47 49 46 38
 *  - WEBP: RIFF [size] WEBP (0-3: RIFF, 8-11: WEBP)
 *  - HEIC/HEIF: ISOBMFF container — 4-7 바이트 'ftyp'
 */
function isValidImageMagic(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;

  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true;
  }

  // GIF (GIF87a / GIF89a 모두 'GIF8'로 시작)
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return true;
  }

  // WEBP: 'RIFF' ... 'WEBP'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }

  // HEIC/HEIF: 4-7 바이트가 'ftyp' (ISOBMFF container)
  //   - iOS 기본 카메라 포맷. 앱은 JPEG 변환하지만 직접 업로드 우회 대비
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    return true;
  }

  return false;
}
