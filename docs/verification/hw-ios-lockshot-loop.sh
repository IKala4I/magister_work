#!/bin/zsh
# iPhone-pass helper (2026-09-08): DVT screenshots every ~2 s, keeping only lit frames (> 60 KB;
# a dark screen captures as a 39 KB black PNG). Run in the background around an owner tap-to-wake
# to catch the lock screen. Usage: hw-ios-lockshot-loop.sh <out-dir> [frames=40]
S="${1:?out dir}"; N="${2:-40}"
for i in $(seq -w 1 $N); do
  f=$S/shot-$i-$(date '+%H%M%S').png
  pymobiledevice3 developer dvt screenshot $f >/dev/null 2>&1
  sz=$(stat -f %z $f 2>/dev/null || echo 0)
  if [ "$sz" -lt 60000 ]; then rm -f $f; fi
  sleep 1
done
echo done > $S/DONE
