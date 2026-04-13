/**
 * lib/storage.ts — Firebase Storage 업로드 헬퍼
 *
 * 숙제 사진을 Firebase Storage에 업로드하고 다운로드 URL을 반환한다.
 * 업로드 실패 시 최대 3회 재시도.
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// 최대 재시도 횟수
const MAX_RETRIES = 3;

/**
 * 숙제 사진 다중 업로드
 *
 * 경로: homeworks/{homeworkId}/{studentUid}/{index}.jpg
 *
 * @param homeworkId - 숙제 문서 ID
 * @param studentUid - 학생 UID
 * @param uris - 로컬 이미지 URI 배열 (최대 5장)
 * @returns 업로드된 이미지의 다운로드 URL 배열
 */
export const uploadHomeworkImages = async (
  homeworkId: string,
  studentUid: string,
  uris: string[]
): Promise<string[]> => {
  const urls: string[] = [];

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const path = `homeworks/${homeworkId}/${studentUid}/${i}.jpg`;
    const url = await uploadWithRetry(uri, path);
    urls.push(url);
  }

  return urls;
};

/**
 * 단일 이미지 업로드 — 3회 재시도 포함
 */
const uploadWithRetry = async (uri: string, path: string): Promise<string> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // URI를 Blob으로 변환
      const response = await fetch(uri);
      const blob = await response.blob();

      // Storage 업로드
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });

      // 다운로드 URL 반환
      return await getDownloadURL(storageRef);
    } catch (e) {
      lastError = e;
      console.warn(`[Storage] 업로드 실패 (${attempt}/${MAX_RETRIES}회):`, e);

      // 마지막 시도가 아니면 잠시 대기 후 재시도
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError ?? new Error('이미지 업로드에 실패했어요.');
};
