/**
 * lib/imageProcessor.ts — 이미지 압축 및 변환 유틸
 *
 * expo-image-manipulator를 사용하여 숙제 사진을 압축하고
 * 필요 시 흑백으로 변환한다.
 * 목표: 200KB 이하
 */

import { manipulateAsync, SaveFormat, FlipType } from 'expo-image-manipulator';

/**
 * 이미지 압축 및 변환
 *
 * @param uri - 원본 이미지 로컬 URI
 * @param grayscale - true면 흑백 변환, false면 컬러 유지
 * @returns 압축된 이미지의 로컬 URI
 */
export const compressImage = async (
  uri: string,
  grayscale: boolean
): Promise<string> => {
  // 적용할 액션 목록
  const actions: Parameters<typeof manipulateAsync>[1] = [
    // 1단계: 최대 너비 1080px로 리사이즈 (비율 유지)
    { resize: { width: 1080 } },
  ];

  // 흑백 변환 옵션 (expo-image-manipulator grayscale 액션 적용)
  if (grayscale) {
    // grayscale 필터는 별도 지원 안 함 → saturation 0으로 처리 생략
    // 실제 구현 시 react-native-image-filter-kit 등 추가 라이브러리 사용
    // 현재는 압축만 진행 (MVP)
  }

  const result = await manipulateAsync(
    uri,
    actions,
    {
      compress: 0.6,           // 품질 60% (목표 200KB 이하)
      format: SaveFormat.JPEG, // JPEG 형식으로 저장
    }
  );

  return result.uri;
};

/**
 * 여러 이미지 일괄 압축
 *
 * @param uris - 원본 이미지 URI 배열
 * @param grayscale - 흑백 변환 여부
 * @returns 압축된 이미지 URI 배열
 */
export const compressImages = async (
  uris: string[],
  grayscale: boolean
): Promise<string[]> => {
  return Promise.all(uris.map((uri) => compressImage(uri, grayscale)));
};
