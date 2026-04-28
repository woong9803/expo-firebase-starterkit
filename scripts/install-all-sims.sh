#!/bin/bash
# 부팅된 모든 iOS 시뮬레이터에 웅깅 앱 일괄 설치 + 실행
# 사용법: bash scripts/install-all-sims.sh

set -e

BUNDLE_ID="com.woongking.app"

# DerivedData에서 가장 최근 빌드된 app.app 자동 검색
# Index.noindex 는 Xcode 인덱싱용 부산물(Info.plist 없음) — 반드시 제외
APP_PATH=$(find "$HOME/Library/Developer/Xcode/DerivedData" \
  -path "*/Build/Products/Debug-iphonesimulator/app.app" \
  -not -path "*/Index.noindex/*" \
  -type d 2>/dev/null \
  | head -1)

if [ -z "$APP_PATH" ]; then
  echo "❌ app.app 을 찾을 수 없습니다. 먼저 'npx expo run:ios' 로 빌드하세요."
  exit 1
fi

echo "✅ 앱 경로: $APP_PATH"
echo ""

# 부팅된 시뮬레이터 UDID 추출
UDIDS=$(xcrun simctl list devices booted | grep -oE "\([A-F0-9-]{36}\)" | tr -d "()")

if [ -z "$UDIDS" ]; then
  echo "❌ 부팅된 시뮬레이터가 없습니다. 시뮬레이터를 먼저 켜주세요."
  exit 1
fi

# 각 시뮬레이터에 install + launch
for UDID in $UDIDS; do
  echo "📲 $UDID"
  xcrun simctl install "$UDID" "$APP_PATH"
  xcrun simctl launch "$UDID" "$BUNDLE_ID"
  echo ""
done

echo "🎉 모든 시뮬레이터에 설치 + 실행 완료!"
