#!/usr/bin/env python3
"""Hardware-pass helper (day 5): detect Today cards that exist in the accessibility tree but are not painted.
Takes one uiautomator dump + screenshot, prints one line per block card with the pixel std-dev inside the
card (BLANK when < 3), and saves the native view hierarchy (dumpsys activity top). Usage:
  python3 docs/verification/hw-blank-cards.py <outdir> <tag>      # scroll with adb between calls
Day-5 notes item 9; re-run on build 6 to verify the GlassPanel fix."""
import re, subprocess, sys
from PIL import Image
import numpy as np
S, tag = sys.argv[1], sys.argv[2]
def sh(*a): return subprocess.run(["adb", *a], capture_output=True, text=True)
subprocess.run(["adb", "shell", "rm", "-f", "/sdcard/ui.xml"]); r = sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
png = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True).stdout; open(f"{S}/shot-{tag}.png", "wb").write(png)
if "dumped" not in r.stdout + r.stderr: print(tag, "dump failed"); sys.exit(0)
sh("pull", "/sdcard/ui.xml", f"{S}/ui-{tag}.xml"); x = open(f"{S}/ui-{tag}.xml", encoding="utf-8", errors="ignore").read()
img = np.asarray(Image.open(f"{S}/shot-{tag}.png").convert("L"), dtype=np.int16)
blank_y = []
for desc, x0, y0, x1, y1 in re.findall(r'content-desc="([^"]*?, \d+:\d\d\s?[AP]M to [^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
    x0, y0, x1, y1 = map(int, (x0, y0, x1, y1))
    if y1 - y0 < 120 or y0 < 430 or y1 > 2050: continue
    sd = float(img[y0 + 20 : y1 - 20, x0 + 20 : x1 - 20].std()); st = "BLANK" if sd < 3 else "ok"
    if st == "BLANK": blank_y.append((y0, y1))
    print(f"{tag} {desc.split(',')[0][:22].ljust(22)} y {y0}-{y1} sd {sd:5.1f} {st}")
# native hierarchy: CellContainer subtrees (bounds are parent-relative; flags col = visibility etc.)
h = sh("shell", "dumpsys", "activity", "top").stdout; open(f"{S}/hier-{tag}.txt", "w").write(h)
lines = h.split("\n"); cells = [i for i, l in enumerate(lines) if "CellContainer" in l]
for i in cells:
    ind = len(lines[i]) - len(lines[i].lstrip()); j = i + 1; kids = []
    while j < len(lines) and (len(lines[j]) - len(lines[j].lstrip())) > ind: kids.append(lines[j].strip()); j += 1
    m = re.search(r'\{(\w+) (\S+) (\S+) (\d+),(\d+)-(\d+),(\d+)', lines[i]); 
    if not m: continue
    flags = [re.search(r'\{\w+ (\S+) ', k) for k in kids]; odd = [k[:90] for k, f in zip(kids, flags) if f and not f[1].startswith("V")]
    texts = sum("ReactTextView" in k for k in kids)
    print(f"   cell {m[1]} {m[2]} {m[3]} bounds {m[4]},{m[5]}-{m[6]},{m[7]} h={int(m[7])-int(m[5])} kids={len(kids)} texts={texts} non-visible={len(odd)}" + ("  " + " | ".join(odd[:3]) if odd else ""))
