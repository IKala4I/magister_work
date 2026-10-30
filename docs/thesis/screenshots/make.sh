#!/usr/bin/env bash
# Screenshots for рис. 3.4 and the poster, from the iOS simulator (README.md beside this file).
#
#   docs/thesis/screenshots/make.sh <simulator-udid> <MagisterDocs> [--no-build]
#
# Release build in the screenshot-fixture mode: no backend keys (EXPO_NO_DOTENV), so the app is
# local-only and nothing reaches Supabase, Sentry or PostHog; the invented demo day is seeded on
# a clean install. Simulator only — this is a picture of the interface, not device evidence.
set -euo pipefail
UDID="${1:?simulator udid}"
DOCS="${2:?MagisterDocs folder}"
BUILD="${3:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP="$ROOT/apps/mobile"
FLOWS="$APP/e2e/screenshots"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
RAW="$DOCS/build/screenshots"
mkdir -p "$RAW" "$DOCS/figures/3.4" "$DOCS/poster/screens"

echo "== simulator: Ukrainian, light, default text size =="
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
if [[ "$(xcrun simctl spawn "$UDID" defaults read -g AppleLocale 2>/dev/null)" != "uk_UA" ]]; then
  xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array uk-UA en
  xcrun simctl spawn "$UDID" defaults write -g AppleLocale uk_UA
  xcrun simctl shutdown "$UDID"
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b >/dev/null
fi
xcrun simctl ui "$UDID" appearance light
xcrun simctl ui "$UDID" content_size medium

if [[ "$BUILD" != "--no-build" ]]; then
  echo "== Release build, screenshot fixture, no backend keys =="
  (cd "$APP" && EXPO_NO_DOTENV=1 EXPO_PUBLIC_SCREENSHOT_FIXTURE=1 SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 \
    npx expo run:ios --configuration Release --device "$UDID" --no-bundler) > "$RAW/build.log" 2>&1 || {
    echo "build failed — see $RAW/build.log"
    exit 1
  }
fi

echo "== clean status bar =="
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState discharging --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 --dataNetwork wifi \
  --operatorName ""

for flow in 1-today 2-focus 3-insights 4-quick-add; do
  echo "== $flow =="
  "$MAESTRO" --device "$UDID" test "$FLOWS/$flow.yaml" > "$RAW/$flow.maestro.log" 2>&1 || {
    echo "flow $flow failed — see $RAW/$flow.maestro.log"
    exit 1
  }
  xcrun simctl io "$UDID" screenshot --type=png "$RAW/$flow.png" 2>/dev/null
done
xcrun simctl status_bar "$UDID" clear

echo "== into place =="
for flow in 1-today 2-focus 3-insights 4-quick-add; do cp "$RAW/$flow.png" "$DOCS/figures/3.4/$flow.png"; done
cp "$RAW/1-today.png" "$DOCS/poster/screens/today.png"
cp "$RAW/2-focus.png" "$DOCS/poster/screens/focus.png"
cp "$RAW/3-insights.png" "$DOCS/poster/screens/insights.png"
sips -g pixelWidth -g pixelHeight "$RAW"/*.png | paste - - - | awk '{print $1, $3 "×" $5}'
