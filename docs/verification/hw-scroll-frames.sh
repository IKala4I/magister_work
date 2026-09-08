#!/usr/bin/env bash
# NFR-P2 scroll series on Today (ADR-0022 pass, 2026-09-08 — the day-2 series, now a script so the
# before/after builds get the SAME input): reset gfxinfo, N long drags down then N up starting
# INSIDE the list (y > 490 on the Pixel 7a; the header swallows a touch above it), then the
# framestats dump. Assumes Today is on screen with the list to measure and nothing animating.
#   docs/verification/hw-scroll-frames.sh <out.txt> [swipes_per_direction=15] [duration_ms=300]
# Prints the summary block (total / janky / percentiles) and writes the full dump to <out.txt>.
set -euo pipefail
out="$1"; n="${2:-15}"; dur="${3:-300}"
pkg=com.hourwell.app
# never send input unless Hourwell owns the focus (a blind tap landed in a chat app, 2026-09-08)
adb shell dumpsys window | grep mCurrentFocus | grep -q "$pkg" || { echo "REFUSED: $pkg is not in the foreground" >&2; exit 3; }
adb shell dumpsys gfxinfo "$pkg" reset > /dev/null
start=$(date +%s.%N)
for _ in $(seq 1 "$n"); do adb shell input swipe 540 1900 540 700 "$dur"; adb shell sleep 0.25; done
for _ in $(seq 1 "$n"); do adb shell input swipe 540 900 540 1900 "$dur"; adb shell sleep 0.25; done
end=$(date +%s.%N)
adb shell sleep 0.8
adb shell dumpsys gfxinfo "$pkg" framestats > "$out"
{
  echo "swipes=$((n * 2)) duration_ms=$dur wall_s=$(printf '%.1f' "$(echo "$end - $start" | bc)")"
  grep -E "Total frames rendered|Janky frames|percentile|Number (Missed|High input|Slow)" "$out" | head -12
} | tee -a "$out"
