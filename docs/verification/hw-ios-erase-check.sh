#!/bin/zsh
# iPhone-pass helper (2026-09-08): the FR-42 erasure on the device with the double-tap arming test,
# in one owner-run command (the session's auto mode refuses destructive actions on the hosted
# account — run this with `!` from the session, phone unlocked, WDA session open, the app on
# Settings with "Delete account and data" visible). Steps: dialog 1 → Continue → dialog 2 → two
# taps 120 ms apart on "Delete everything" (must NOT erase: the arming window) → screenshot →
# one tap after the window → welcome screen → the audit reference is read by the session.
#   docs/verification/hw-ios-erase-check.sh <out-dir>
set -u
OUT="${1:?out dir}"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W=(python3 "$ROOT/docs/verification/hw-ios-wda.py")
ts() { date '+%H:%M:%S.%N' | cut -c1-12; }
echo "$(ts) tap Delete account and data"; "${W[@]}" tap "Delete account and data" | tail -1
sleep 1.5
echo "$(ts) dialog 1: $("${W[@]}" find "Continue" | tail -1)"
"${W[@]}" tap "Continue" | tail -1
sleep 1.5
R=$("${W[@]}" find "Delete everything" | tail -1); echo "$(ts) dialog 2: $R"
XY=$(echo "$R" | python3 -c "import sys,re; d=dict(re.findall(r\"'(\w+)': (\d+)\", sys.stdin.read())); print(int(d['x'])+int(d['width'])//2, int(d['y'])+int(d['height'])//2)")
echo "$(ts) double tap at $XY (120 ms apart)"
python3 "$ROOT/docs/verification/hw-ios-doubletap.py" ${=XY} 120 | tail -1
sleep 1.2
echo "$(ts) after the double tap: $("${W[@]}" find "Delete everything" | tail -1) (present = the arming held)"
pymobiledevice3 developer dvt screenshot "$OUT/shot-erase-after-doubletap.png" 2>/dev/null
sleep 0.5
echo "$(ts) single tap (armed)"; "${W[@]}" tap "Delete everything" | tail -1
sleep 6
"${W[@]}" source "$OUT/wda-after-erase.xml" | tail -1
pymobiledevice3 developer dvt screenshot "$OUT/shot-after-erase.png" 2>/dev/null
echo "$(ts) welcome present: $(grep -c 'Get started' "$OUT/wda-after-erase.xml")"
