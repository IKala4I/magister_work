#!/usr/bin/env python3
"""Hardware-pass helper (ADR-0022, 2026-09-08): how long did a transition run on the screen?

One tool for both phones. Takes a screen recording (Android `adb shell screenrecord` .mp4, or a
QuickTime USB recording of the iPhone .mov), resamples it to a fixed frame rate with ffmpeg, and
prints every run of consecutive frames in which the pixels inside a crop changed — a tap on
Done / Skip / I did it / Move (confirm) is followed by exactly one such run, and its length in
frames at 60 fps is the transition's length (File 02 §3.4: springs ≤ 250 ms → ≤ 15 frames;
reduced motion → one changed frame). Replaces the ad-hoc brightness method of the dialog
evidence (android-20260906-dialog). Never claims a result: it measures what was recorded.

  python3 docs/verification/hw-motion-frames.py <video> [--crop x0,y0,x1,y1] [--fps 60]
      [--threshold 0.6] [--min-run 1] [--after s] [--csv out.csv]

  --crop       region in video pixels; default 0,490,1080,2050 = the Today list on the Pixel 7a
               (below the header/banner, above the tab bar). Pass the iPhone's own region.
  --fps        the resampling rate (60 = the display rate of both phones); a source that encodes
               only changed frames (screenrecord) is expanded, so a duplicated frame changes 0.
  --threshold  mean absolute change (0–255 grey) inside the crop that counts as "changed";
               0.6 rides above encoder noise on a static list and below any real settle.
  --after      only report runs starting after this many seconds (pair with the tap stamp).

Prints one line per run: start (s), frames, ms, mean and peak change; then a summary line.
Requires ffmpeg on PATH, numpy and Pillow (already used by hw-blank-cards.py)."""
import argparse
import csv
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


def extract(video: Path, fps: int, out: Path) -> list[Path]:
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(video), "-vf", f"fps={fps}", "-pix_fmt", "gray",
         str(out / "f%05d.png")],
        check=True,
    )
    return sorted(out.glob("f*.png"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--crop", default="0,490,1080,2050")
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--threshold", type=float, default=0.6)
    ap.add_argument("--min-run", type=int, default=1)
    ap.add_argument("--after", type=float, default=0.0)
    ap.add_argument("--csv")
    a = ap.parse_args()
    x0, y0, x1, y1 = (int(v) for v in a.crop.split(","))
    with tempfile.TemporaryDirectory() as tmp:
        frames = extract(Path(a.video), a.fps, Path(tmp))
        if len(frames) < 2:
            print("fewer than two frames", file=sys.stderr)
            return 2
        prev = None
        changes: list[float] = []
        for f in frames:
            img = np.asarray(Image.open(f), dtype=np.int16)[y0:y1, x0:x1]
            changes.append(0.0 if prev is None else float(np.abs(img - prev).mean()))
            prev = img
    # runs of consecutive changed frames
    runs: list[tuple[int, int, float, float]] = []  # start index, length, mean, peak
    i = 0
    n = len(changes)
    while i < n:
        if changes[i] > a.threshold:
            j = i
            while j < n and changes[j] > a.threshold:
                j += 1
            seg = changes[i:j]
            runs.append((i, j - i, float(np.mean(seg)), float(np.max(seg))))
            i = j
        else:
            i += 1
    rows = []
    for start, length, mean, peak in runs:
        t = start / a.fps
        if t < a.after or length < a.min_run:
            continue
        rows.append((round(t, 3), length, round(length * 1000 / a.fps), round(mean, 2), round(peak, 2)))
    print(f"{a.video}: {n} frames at {a.fps} fps ({n / a.fps:.2f} s), crop {a.crop}, threshold {a.threshold}")
    print("start_s  frames  ms   mean  peak")
    for t, length, ms, mean, peak in rows:
        print(f"{t:7.3f}  {length:6d}  {ms:4d}  {mean:5.2f}  {peak:5.2f}")
    longest = max((r[1] for r in rows), default=0)
    print(f"runs={len(rows)} longest_frames={longest} longest_ms={round(longest * 1000 / a.fps)}")
    if a.csv:
        with open(a.csv, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["start_s", "frames", "ms", "mean_change", "peak_change"])
            w.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
