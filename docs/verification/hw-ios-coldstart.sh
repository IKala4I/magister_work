#!/usr/bin/env bash
# iPhone-pass helper (NFR-P2 cold start, 2026-09-07): N `xctrace` App Launch recordings of the
# installed app, then the launch phases from each trace's `life-cycle-period` table and p50/p90
# of the time to "Initial Frame Rendering" complete = "Foreground - Active" start (the same
# first-frame event `am start -W` reports on Android). Traces go to <outdir> (never the repo).
#   docs/verification/hw-ios-coldstart.sh <udid> <outdir> [n=20] [bundle=com.hourwell.app]
# Argument order matters: everything after `--` is handed to the launched app, so --time-limit
# and --output must come BEFORE --launch (a lesson from the first attempt).
set -euo pipefail
udid="$1"; out="$2"; n="${3:-20}"; bundle="${4:-com.hourwell.app}"
mkdir -p "$out"
for i in $(seq -w 1 "$n"); do
  t="$out/launch-$i.trace"; rm -rf "$t"
  xcrun xctrace record --template 'App Launch' --device "$udid" --time-limit 6s --output "$t" --launch -- "$bundle" > "$out/launch-$i.log" 2>&1 || echo "launch $i: xctrace exit $?"
  xcrun xctrace export --input "$t" --xpath '/trace-toc/run[@number="1"]/data/table[@schema="life-cycle-period"]' > "$out/launch-$i-lifecycle.xml" 2>/dev/null || true
  ms="$(python3 - "$out/launch-$i-lifecycle.xml" <<'PY'
import re,sys
x=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
idmap={}
for m in re.finditer(r'<(\w[\w-]*) id="(\d+)"([^>]*)>([^<]*)</',x):
    tag,i,attrs,txt=m.groups(); f=re.search(r'fmt="([^"]*)"',attrs); idmap[i]=(f.group(1) if f else txt)
for r in re.findall(r'<row>(.*?)</row>',x,re.S):
    vals=[]
    for m in re.finditer(r'<(\w[\w-]*)(?: id="(\d+)")?(?: ref="(\d+)")?([^>]*)>([^<]*)</',r):
        tag,i,ref,attrs,txt=m.groups(); f=re.search(r'fmt="([^"]*)"',attrs)
        vals.append((f.group(1) if f else (idmap.get(ref) if ref else txt)) or '')
    if any('Foreground - Active' in v for v in vals):
        t=re.match(r'(\d\d):(\d\d)\.(\d\d\d)\.(\d\d\d)',vals[0])
        if t: print(int(t.group(1))*60000+int(t.group(2))*1000+int(t.group(3))+int(t.group(4))/1000.0); break
PY
)"
  echo "launch $i: foreground-active at ${ms:-?} ms"
done
echo "== summary"
python3 - "$out" <<'PY'
import sys,glob,re
vals=[]
for f in sorted(glob.glob(sys.argv[1]+'/launch-*-lifecycle.xml')):
    x=open(f,encoding='utf-8',errors='ignore').read()
    idmap={}
    for m in re.finditer(r'<(\w[\w-]*) id="(\d+)"([^>]*)>([^<]*)</',x):
        tag,i,attrs,txt=m.groups(); ff=re.search(r'fmt="([^"]*)"',attrs); idmap[i]=(ff.group(1) if ff else txt)
    for r in re.findall(r'<row>(.*?)</row>',x,re.S):
        v=[]
        for m in re.finditer(r'<(\w[\w-]*)(?: id="(\d+)")?(?: ref="(\d+)")?([^>]*)>([^<]*)</',r):
            tag,i,ref,attrs,txt=m.groups(); ff=re.search(r'fmt="([^"]*)"',attrs)
            v.append((ff.group(1) if ff else (idmap.get(ref) if ref else txt)) or '')
        if any('Foreground - Active' in s for s in v):
            t=re.match(r'(\d\d):(\d\d)\.(\d\d\d)\.(\d\d\d)',v[0])
            if t: vals.append(int(t.group(1))*60000+int(t.group(2))*1000+int(t.group(3))+int(t.group(4))/1000.0)
            break
vals.sort()
def pct(p):
    if not vals: return None
    k=max(0,min(len(vals)-1,int(round(p/100*len(vals)+0.5))-1)); return vals[k]
print(f"n={len(vals)} first-frame→foreground-active ms: min {vals[0] if vals else '-'} p50 {pct(50)} p90 {pct(90)} max {vals[-1] if vals else '-'}")
print("all:", [round(v) for v in vals])
PY
