#!/bin/bash
# app_icon_2.png 의 외곽 여백 제거 후 보라 풀 블리드 1024×1024 아이콘 생성
# 사용법: bash scripts/generate-app-icon.sh
# 사전조건: brew install imagemagick

set -e

SRC="assets/app_icon_2.png"
DST="assets/app_icon_3.png"

if ! command -v magick >/dev/null 2>&1; then
  echo "❌ ImageMagick 이 없습니다. 먼저 설치하세요:"
  echo "   brew install imagemagick"
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "❌ 원본 이미지가 없습니다: $SRC"
  exit 1
fi

# 원본 아이콘 안쪽(중앙 근처)에서 보라색 자동 추출 — 외곽과 안쪽 색이 정확히 일치
PURPLE=$(magick "$SRC" -format "%[pixel:p{300,300}]" info: \
  | sed -E 's/srgba?\(([0-9]+),([0-9]+),([0-9]+).*/\1 \2 \3/' \
  | awk '{ printf "#%02X%02X%02X", $1, $2, $3 }')
echo "🎨 자동 추출된 보라색: $PURPLE"

# 1. -trim: 외곽 흰/투명 여백 자동 제거
# 2. -resize 768x768: 안전 영역 안쪽에 디자인 배치 (1024 중 좌우 128 여백)
# 3. -extent 1024x1024 + -background: 보라 배경으로 풀 블리드 1024×1024 캔버스 채움
magick "$SRC" \
  -trim +repage \
  -resize 768x768 \
  -background "$PURPLE" \
  -gravity center \
  -extent 1024x1024 \
  -alpha remove \
  "$DST"

echo "✅ 생성 완료: $DST"
echo ""
echo "다음 단계:"
echo "1. app.config.ts 의 app_icon_2.png → app_icon_3.png 로 교체"
echo "2. npx expo prebuild --platform ios --clean"
echo "3. npx expo run:ios"
