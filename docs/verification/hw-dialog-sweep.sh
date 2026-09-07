#!/usr/bin/env bash
# Hardware-pass helper (ADR-0021, 2026-09-06): capture one in-app dialog state on a connected
# Android device — uiautomator dump + screenshot + the window stack — and switch the OS
# accessibility state the sweep needs (font scale, display size, dark mode, animator scale).
# Never claims a result: it only records what the device shows.
#
#   docs/verification/hw-dialog-sweep.sh capture <outdir> <tag>     # dump + screenshot + windows
#   docs/verification/hw-dialog-sweep.sh state <font> <density|-> <night yes|no> <anim 0|1>
#   docs/verification/hw-dialog-sweep.sh restore                     # font 1.0, density reset, night no, anim 1
#   docs/verification/hw-dialog-sweep.sh record <outdir> <tag> <seconds>   # screenrecord (spring evidence)
#   docs/verification/hw-dialog-sweep.sh tap <x> <y>                 # input tap
#   docs/verification/hw-dialog-sweep.sh find <outdir> <tag> <text>  # bounds of a node whose text/desc matches
set -euo pipefail
cmd="${1:-}"; shift || true
case "$cmd" in
  capture)
    out="$1"; tag="$2"; mkdir -p "$out"
    adb shell rm -f /sdcard/ui.xml >/dev/null
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null
    adb pull /sdcard/ui.xml "$out/ui-$tag.xml" >/dev/null
    adb exec-out screencap -p > "$out/shot-$tag.png"
    adb shell dumpsys window windows | grep -E "Window #|mHasSurface=true|isVisible|package=com.hourwell" | head -40 > "$out/windows-$tag.txt" || true
    # what a reader gets: roles (class), text, content-desc, focusable, bounds — Hourwell nodes only
    python3 - "$out/ui-$tag.xml" <<'PY'
import re, sys
x = open(sys.argv[1], encoding='utf-8', errors='ignore').read()
for m in re.finditer(r'<node [^>]*/?>', x):
    n = m.group(0)
    if 'package="com.hourwell.app"' not in n: continue
    def a(k):
        mm = re.search(k + r'="([^"]*)"', n); return mm.group(1) if mm else ''
    text, desc, cls = a('text'), a('content-desc'), a('class')
    if not text and not desc: continue
    print(f"{cls.split('.')[-1]:<14} focusable={a('focusable'):<5} imp={a('important') or '-':<4} bounds={a('bounds'):<28} text={text[:60]!r} desc={desc[:60]!r}")
PY
    ;;
  state)
    font="$1"; density="$2"; night="$3"; anim="$4"
    adb shell settings put system font_scale "$font"
    if [ "$density" = "-" ]; then adb shell wm density reset; else adb shell wm density "$density"; fi
    adb shell cmd uimode night "$night" >/dev/null
    adb shell settings put global animator_duration_scale "$anim"
    adb shell settings put global transition_animation_scale "$anim"
    adb shell settings put global window_animation_scale "$anim"
    echo "state: font=$(adb shell settings get system font_scale) density=$(adb shell wm density | tr -d '\r' | tr '\n' ' ') night=$(adb shell cmd uimode night | tr -d '\r') anim=$(adb shell settings get global animator_duration_scale)"
    ;;
  restore)
    "$0" state 1.0 - no 1
    ;;
  record)
    out="$1"; tag="$2"; secs="$3"; mkdir -p "$out"
    adb shell screenrecord --time-limit "$secs" --bit-rate 4000000 "/sdcard/rec-$tag.mp4" &
    echo "recording $secs s → $out/rec-$tag.mp4 (tap during the window)"; wait
    adb pull "/sdcard/rec-$tag.mp4" "$out/rec-$tag.mp4" >/dev/null && adb shell rm "/sdcard/rec-$tag.mp4"
    ;;
  tap)
    adb shell input tap "$1" "$2"
    ;;
  find)
    out="$1"; tag="$2"; needle="$3"
    python3 - "$out/ui-$tag.xml" "$needle" <<'PY'
import re, sys
x = open(sys.argv[1], encoding='utf-8', errors='ignore').read(); needle = sys.argv[2]
for m in re.finditer(r'<node [^>]*/?>', x):
    n = m.group(0)
    if needle in n:
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            x0,y0,x1,y1 = map(int, b.groups()); print(f"{(x0+x1)//2} {(y0+y1)//2}  # {needle} bounds {b.group(0)}")
PY
    ;;
  *) echo "usage: $0 capture|state|restore|record|tap|find …" >&2; exit 2 ;;
esac
