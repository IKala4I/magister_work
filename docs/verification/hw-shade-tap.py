#!/usr/bin/env python3
"""Hardware-pass helper: find the Hourwell notification row in the open shade and tap one of its
action buttons over adb (day-4 notes items 10/22: `uiautomator dump` fails while the shade is
open, so the row is located by template-matching the app icon on a screenshot).

  python3 docs/verification/hw-shade-tap.py locate [--out DIR]   # expand shade, screenshot, find the row
  python3 docs/verification/hw-shade-tap.py tap accept|adjust|body  # re-locate, colour-guard, tap

Geometry (Pixel 7a, 1080×2400, default density): icon = 100×100 crop at the row's top-left
(template `lib/hourwell-icon-template.png`, cut from the build-4 expanded row); the action
labels sit +294 px below the icon's top edge, "Plan tomorrow" at +281 px and "Adjust tasks" at
+604 px right of it (build-4 expanded row). The tap fires only if the guard finds light-blue
label pixels at the target; otherwise it prints why and exits 2. Verify the saved row crop by eye
before tapping a real notification. A row that arrives COLLAPSED (day 5: body truncated, chevron
down, no buttons) is expanded with `tap chevron --no-expand` first, then re-located.
"""
import os, subprocess, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "lib", "hourwell-icon-template.png")
TARGETS = {"accept": (281, 294), "adjust": (604, 294), "body": (450, 150), "chevron": (876, 23)}


def sh(*args, **kw):
    return subprocess.run(["adb", *args], check=True, capture_output=True, text=True, **kw)


def screenshot(path):
    png = subprocess.run(["adb", "exec-out", "screencap", "-p"], check=True, capture_output=True).stdout
    with open(path, "wb") as f:
        f.write(png)
    return Image.open(path).convert("RGB")


def find_icon(img, x_range=(60, 120), stride=2):
    t = np.asarray(Image.open(TEMPLATE).convert("RGB"), dtype=np.int16)
    a = np.asarray(img, dtype=np.int16)
    th, tw = t.shape[:2]
    best = (1e9, None)
    for y in range(0, a.shape[0] - th, stride):
        for x in range(x_range[0], x_range[1], stride):
            d = np.abs(a[y : y + th, x : x + tw] - t).mean()
            if d < best[0]:
                best = (d, (x, y))
    return best  # (mean abs diff, (x, y) of the icon's top-left)


def expand_shade():
    sh("shell", "cmd", "statusbar", "expand-notifications")
    time.sleep(1.2)
    sh("shell", "input", "swipe", "540", "2100", "540", "1100", "400")  # one slow swipe, day-4 item 10
    time.sleep(1.0)


def locate(out_dir, expand=True):
    if expand:
        expand_shade()
    shot = os.path.join(out_dir, "shade-full.png")  # whole shade: private, never commit
    img = screenshot(shot)
    diff, pos = find_icon(img)
    if pos is None or diff > 20:
        print(f"icon not found (best diff {diff:.1f})"); sys.exit(2)
    x, y = pos
    row = img.crop((0, max(0, y - 60), img.width, min(img.height, y + 420)))
    row_path = os.path.join(out_dir, "shade-row.png")
    row.save(row_path)
    print(f"icon at ({x},{y}) diff {diff:.1f}; row crop -> {row_path}")
    return img, (x, y)


def guard(img, cx, cy, box=(60, 22)):
    a = np.asarray(img.crop((cx - box[0], cy - box[1], cx + box[0], cy + box[1])), dtype=np.int16)
    blue = (a[:, :, 2] > 180) & (a[:, :, 2] - a[:, :, 0] > 40)
    return int(blue.sum())


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("locate", "tap"):
        print(__doc__); sys.exit(1)
    out = os.environ.get("HW_SHADE_OUT", "/tmp")
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    img, (x, y) = locate(out, expand="--no-expand" not in sys.argv)
    if sys.argv[1] == "locate":
        return
    which = sys.argv[2]
    dx, dy = TARGETS[which]
    cx, cy = x + dx, y + dy
    n = guard(img, cx, cy)
    print(f"target {which} at ({cx},{cy}); light-blue label pixels in guard box: {n}")
    if which not in ("body", "chevron") and n < 40:
        print("guard failed — no action label at the target; not tapping"); sys.exit(2)
    if "--dry" in sys.argv:
        print("dry run — not tapping"); return
    sh("shell", "input", "tap", str(cx), str(cy))
    print(f"tapped {which} at ({cx},{cy}) {time.strftime('%H:%M:%S')}")


if __name__ == "__main__":
    main()
