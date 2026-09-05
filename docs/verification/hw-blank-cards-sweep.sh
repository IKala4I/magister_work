#!/usr/bin/env bash
# Six scroll-to-bottom cycles over Today with the blank-card detector after each (day-5 recipe,
# item 9; the build-6 acceptance is 0 BLANK across all cycles). Assumes Today is on screen with a
# ≥ 10-block plan and nothing animating (uiautomator dump fails while the shade or a spinner is up).
#   docs/verification/hw-blank-cards-sweep.sh <outdir> [cycles=6]
set -euo pipefail
out="$1"; cycles="${2:-6}"; mkdir -p "$out"
here="$(cd "$(dirname "$0")" && pwd)"
total_blank=0
for i in $(seq 1 "$cycles"); do
  # to the bottom in three long swipes (a 10–12 card list), then let the list settle
  # drags start INSIDE the list (the header/banner above y≈490 swallows a touch that starts there)
  for _ in 1 2 3; do adb shell input swipe 540 1900 540 700 500; adb shell sleep 0.6; done
  adb shell sleep 1.2
  line="$(python3 "$here/hw-blank-cards.py" "$out" "b$i" | tee -a "$out/sweep.log" | grep -c BLANK || true)"
  total_blank=$((total_blank + line))
  # back to the top
  for _ in 1 2 3; do adb shell input swipe 540 900 540 1900 500; adb shell sleep 0.6; done
  adb shell sleep 1.0
done
echo "cycles=$cycles blank_cards_total=$total_blank" | tee -a "$out/sweep.log"
