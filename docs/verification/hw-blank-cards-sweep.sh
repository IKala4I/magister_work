#!/usr/bin/env bash
# Six scroll-to-bottom cycles over Today with the blank-card detector after each (day-5 recipe,
# item 9; the build-6 acceptance is 0 BLANK across all cycles). Assumes Today is on screen with a
# ≥ 10-block plan and nothing animating (uiautomator dump fails while the shade or a spinner is up).
#   docs/verification/hw-blank-cards-sweep.sh <outdir> [cycles=6] [swipes=3]
# swipes = long drags per direction: 3 reaches the bottom of a 10–12 card list at default density;
# a 13+ card list or a 1.3× font scale needs 5–6 (extra drags at either end are harmless).
set -euo pipefail
out="$1"; cycles="${2:-6}"; swipes="${3:-3}"; mkdir -p "$out"
here="$(cd "$(dirname "$0")" && pwd)"
total_blank=0
for i in $(seq 1 "$cycles"); do
  # to the bottom in $swipes long drags, then let the list settle
  # drags start INSIDE the list (the header/banner above y≈490 swallows a touch that starts there)
  for _ in $(seq 1 "$swipes"); do adb shell input swipe 540 1900 540 700 500; adb shell sleep 0.6; done
  adb shell sleep 1.2
  line="$(python3 "$here/hw-blank-cards.py" "$out" "b$i" | tee -a "$out/sweep.log" | grep -c BLANK || true)"
  total_blank=$((total_blank + line))
  # back to the top
  for _ in $(seq 1 "$swipes"); do adb shell input swipe 540 900 540 1900 500; adb shell sleep 0.6; done
  adb shell sleep 1.0
done
scans="$(grep -cE ' sd +[0-9.]+ (ok|BLANK)$' "$out/sweep.log" || true)"
echo "cycles=$cycles swipes=$swipes card_scans=$scans blank_cards_total=$total_blank" | tee -a "$out/sweep.log"
