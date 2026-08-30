#!/usr/bin/env bash
# The owner-run hardware verification pass (PLAN §3 "before P12"; CLAUDE.md "Simulator evidence").
# Drives everything that CAN be scripted on a connected physical device and prints the manual
# items of docs/verification/device-checklist.md that remain. Never claims a device result it
# did not measure: every step prints what ran and where its evidence landed.
#
#   scripts/device-pass.sh ios      # one physical iPhone (Xcode + a Release build installed)
#   scripts/device-pass.sh android  # one physical Android (adb + a release APK installed)
#
# Prerequisites: maestro on PATH (https://maestro.mobile.dev), the app installed on the device
# with the `hourwell` scheme (a development/release build, NOT Expo Go), the device unlocked
# with max text size + Reduce Motion set by hand (the script cannot change OS accessibility
# settings on real hardware — it says so and waits for you).
set -euo pipefail
platform="${1:-}"
case "$platform" in ios|android) ;; *) echo "usage: $0 ios|android" >&2; exit 2 ;; esac
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/docs/verification/device-pass/$platform-$(date +%Y%m%d-%H%M)"
mkdir -p "$out"
say() { printf '\n== %s\n' "$*"; }
pause() { printf '%s\n[press enter when done] ' "$*"; read -r _; }

say "Device pass — $platform — evidence → $out"
command -v maestro >/dev/null || { echo "maestro not found (curl -Ls https://get.maestro.mobile.dev | bash)" >&2; exit 2; }

say "1/5 NFR-A2 preconditions (manual: OS accessibility settings cannot be scripted on hardware)"
pause "Set: largest text size (Android: also largest display size), Reduce Motion ON, Reduce Transparency ON (iOS). Sign in to a fresh anonymous trial (onboard once)."

say "2/5 Maestro sweeps (NFR-A2 layout at max scale; screenshots per screen)"
for flow in p2-a11y-sweep p3-tasks-flow p4-onboarding-flow p10-a11y-sweep; do
  f="$root/apps/mobile/e2e/$flow.yaml"
  if [ -f "$f" ]; then
    echo "-- $flow"
    maestro test --format junit --output "$out/$flow.xml" "$f" 2>&1 | tail -3 || echo "   $flow: FAILED (see $out/$flow.xml)"
  fi
done
echo "Screenshots: ~/.maestro/tests/<run>/ — copy the p10-* PNGs into $out/ for the audit table."

say "3/5 NFR-P2 cold start (≥ 20 launches, Release build)"
if [ "$platform" = ios ]; then
  echo "iOS: docs/verification/measure-cold-start.py targets the SIMULATOR (simctl). On a device use"
  echo "Xcode → Product → Profile → App Launch, 20 cold launches, report p90 in p10-manual-verification.md §2.3 (device column)."
else
  if command -v adb >/dev/null; then
    : > "$out/cold-start.txt"
    for i in $(seq 1 20); do
      adb shell am force-stop com.hourwell.app
      sleep 2
      adb shell am start -W -n com.hourwell.app/.MainActivity | grep -E 'TotalTime|WaitTime' >> "$out/cold-start.txt" || true
    done
    echo "TotalTime samples (ms) → $out/cold-start.txt; p90 = 18th smallest of 20:"
    grep TotalTime "$out/cold-start.txt" | awk '{print $2}' | sort -n | sed -n '18p'
  else
    echo "adb not found — skip; run the loop above by hand."
  fi
fi

say "4/5 NFR-P2 60 fps timeline scroll"
if [ "$platform" = android ] && command -v adb >/dev/null; then
  adb shell dumpsys gfxinfo com.hourwell.app reset >/dev/null || true
  pause "Open Today with ≥ 10 blocks and scroll the timeline up/down for 20 s."
  adb shell dumpsys gfxinfo com.hourwell.app > "$out/gfxinfo.txt" || true
  grep -E 'Janky frames|90th percentile|95th percentile|99th percentile' "$out/gfxinfo.txt" || true
else
  echo "iOS: Xcode → Instruments → Core Animation FPS while scrolling a 10+ block Today; note min/avg FPS in §2.3."
fi

say "5/5 Notifications, sync, calendar, deletion — manual protocol (docs/verification/device-checklist.md)"
cat <<'TXT'
  FR-50  Plan a day with ≥ 6 blocks → Settings: reminders ON (grant) → lock the device → each of
         the first 4 reminders arrives 10 min before its block; the 5th slot is the 20:00 ritual;
         re-plan twice during the day → never a 6th notification (Android: also under Doze /
         battery saver; note OEM). Mute a category → its reminders vanish at the next foreground.
  FR-26  At the ritual time: "Plan tomorrow" with Accept / Adjust → Accept plans tomorrow with the
         app KILLED beforehand (cold start path); tomorrow morning Today shows that plan.
  FR-42  Settings → Export → the share sheet offers Files/AirDrop; open the JSON: no calendar
         titles. Settings → Delete (two confirms) → confirmation screen with a reference; relaunch
         → onboarding; the reference exists in deletion_audit (owner: db query, aggregate only).
  NFR-A1 VoiceOver / TalkBack: Today blocks read as ONE element each; Settings switches announce
         their label + state; the mute chips read "checkbox, Mute reminders for Admin, checked".
  NFR-R1 Airplane mode → edits → reconnect → "Up to date" (P8 items).
TXT
echo
echo "Evidence directory: $out — paste the numbers into docs/verification/p10-manual-verification.md §2.3 (device column) and flip device-checklist.md items with the date + device."
