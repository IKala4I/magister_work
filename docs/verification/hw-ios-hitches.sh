#!/usr/bin/env bash
# iPhone-pass helper (NFR-P2, ADR-0022 pass 2026-09-09): the frame evidence of an "Animation
# Hitches" trace as numbers — rows in the `hitches` table (0 = no frame missed its deadline),
# committed frames and their lifetimes from `hitches-frame-lifetimes`, GPU time from `hitches-gpu`.
#   docs/verification/hw-ios-hitches.sh <file.trace> [outdir]
# Writes the three tables as XML into <outdir> (default: next to the trace); prints a summary line.
set -euo pipefail
trace="$1"; out="${2:-$(dirname "$trace")}"; base="$(basename "$trace" .trace)"
for t in hitches hitches-frame-lifetimes hitches-gpu; do
  # no [@number="1"]: with it the export of an EMPTY hitches table segfaults (exit 139, 2026-09-09)
  xcrun xctrace export --input "$trace" --xpath "/trace-toc/run/data/table[@schema=\"$t\"]" > "$out/$base-$t.xml" 2>/dev/null || echo "($t export exit $?)"
done
python3 - "$out/$base" <<'PY'
import re, sys
b = sys.argv[1]
def rows(path):
    try: return open(path, encoding="utf-8", errors="ignore").read()
    except FileNotFoundError: return ""
h = rows(f"{b}-hitches.xml"); hitches = len(re.findall(r"<row>", h))
fl = rows(f"{b}-hitches-frame-lifetimes.xml"); frames = len(re.findall(r"<row>", fl))
# frame lifetime durations (ns) — the "duration" columns carry fmt="… ms"
durs = [float(v) for v in re.findall(r'<duration[^>]*fmt="([0-9.]+) ms"', fl)]
gpu = rows(f"{b}-hitches-gpu.xml"); gdurs = [float(v) for v in re.findall(r'<duration[^>]*fmt="([0-9.]+) ms"', gpu)]
def pct(xs, p):
    if not xs: return float("nan")
    xs = sorted(xs); return xs[min(len(xs)-1, int(round(p/100*(len(xs)-1))))]
print(f"hitches={hitches} frames={frames} lifetime_ms p50={pct(durs,50):.1f} p90={pct(durs,90):.1f} max={max(durs) if durs else float('nan'):.1f} gpu_ms p50={pct(gdurs,50):.2f} max={max(gdurs) if gdurs else float('nan'):.2f}")
PY
