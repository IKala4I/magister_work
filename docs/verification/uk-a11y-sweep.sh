#!/usr/bin/env bash
# Ukrainian NFR-A2 sweep on the iOS simulator (ADR-0023). Onboards in English at the default
# text size (Maestro cannot dismiss the simulator keyboard, so the seed-task step is unreachable
# at accessibility sizes), then raises the text size to the maximum and walks the app in
# Ukrainian, screenshotting each surface.
#
#   docs/verification/uk-a11y-sweep.sh <simulator-udid> <output-dir>
#
# Simulator evidence only — the device-checklist "Ukrainian interface" rows stay open either way.
set -euo pipefail
UDID="${1:?simulator udid}"
OUT="${2:?output dir}"
E2E="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/mobile/e2e" && pwd)"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"

mkdir -p "$OUT"
echo "== onboarding at the default text size =="
xcrun simctl ui "$UDID" content_size medium
(cd "$OUT" && "$MAESTRO" --device "$UDID" test "$E2E/i18n-uk-onboard.yaml" --format junit \
  --output "$OUT/onboarding.xml") || {
  echo "onboarding flow failed — see $OUT/onboarding.xml"
  exit 1
}

echo "== switch to Ukrainian at the default text size =="
(cd "$OUT" && "$MAESTRO" --device "$UDID" test "$E2E/i18n-uk-switch.yaml" --format junit \
  --output "$OUT/uk-switch.xml") || {
  echo "language switch flow failed — see $OUT/uk-switch.xml"
  exit 1
}

echo "== Ukrainian sweep at accessibility-extra-extra-extra-large =="
xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large
(cd "$OUT" && "$MAESTRO" --device "$UDID" test "$E2E/i18n-uk-a11y-sweep.yaml" --format junit \
  --output "$OUT/uk-sweep.xml")

echo "== a real plan: block cards, Ukrainian rationales, the action row =="
(cd "$OUT" && "$MAESTRO" --device "$UDID" test "$E2E/i18n-uk-plan.yaml" --format junit \
  --output "$OUT/uk-plan.xml") || echo "plan flow failed — see $OUT/uk-plan.xml (needs the backend)"

xcrun simctl ui "$UDID" content_size medium

# Maestro writes takeScreenshot output under ~/.maestro/tests/<run>/<flow>/takeScreenshot/,
# not the working directory — collect this session's into $OUT.
find "$HOME/.maestro/tests" -name 'uk-*.png' -newer "$OUT/onboarding.xml" -exec cp {} "$OUT/" \;
echo "screenshots in $OUT: $(ls "$OUT"/uk-*.png 2>/dev/null | wc -l | tr -d ' ')"

