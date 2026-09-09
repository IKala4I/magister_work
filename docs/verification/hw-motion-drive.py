#!/usr/bin/env python3
"""Hardware-pass driver (ADR-0022, 2026-09-08): record the screen while driving one block
interaction on Today over adb, then measure the transition, check every card is painted and
dump the block order. The Android twin of an owner's thumb on Done / Skip / I did it / Move.

  python3 docs/verification/hw-motion-drive.py <outdir> <tag> [--record 8] [--crop ...] <step>...

Steps (run in order while `screenrecord` runs; each tap is stamped relative to the recording):
  tap:<text>          tap the first node whose text or content-desc matches the regex
  tap:<text>@N        the N-th match (0-based); `<regex>#<class-regex>` narrows to a widget class
  tapxy:<x>,<y>       tap by coordinates with no locate dump (a second input inside a window)
  tapid:<resource-id> tap the first node with that resource-id (the native time picker)
  text:<string>       `input text` (the focused field)
  key:<KEYCODE>       `input keyevent`
  sleep:<seconds>
  swipe:x0,y0,x1,y1,ms
  dump:<name>         a uiautomator dump + screenshot (no wait)
After the steps: the recording is pulled to <outdir>/<tag>.mp4, `hw-motion-frames.py` reports the
change runs (crop = the list), `hw-blank-cards.py` scans the cards (0 BLANK expected), and the
block order (content-desc of every card in the tree, top to bottom) is printed and saved.
Never claims a result: it records what the device shows. Raw recordings stay out of the repo."""
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def sh(*a: str) -> str:
    r = subprocess.run(["adb", *a], capture_output=True, text=True)
    if a[:2] == ("shell", "input") and (r.stderr.strip() or "Error" in r.stdout):
        print(f"   input error: {(r.stderr or r.stdout).strip()[:160]}")  # an injection refusal is otherwise silent
    return r.stdout


def require_foreground() -> None:
    """Never send input unless Hourwell owns the focus (2026-09-08: a blind tap landed in a chat
    app the owner had brought to the front — the day-2 rule, now enforced, not remembered)."""
    focus = [l for l in sh("shell", "dumpsys", "window").splitlines() if "mCurrentFocus" in l]
    if not focus or "com.hourwell.app" not in focus[0]:
        print(f"REFUSED: Hourwell is not in the foreground ({focus[0].strip() if focus else 'no focus'})")
        sys.exit(3)


def dump(out: str, name: str, shot: bool = True) -> str:
    sh("shell", "rm", "-f", "/sdcard/ui.xml")
    for _ in range(4):  # the dump fails while anything animates — retry briefly
        r = subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True, text=True)
        if "dumped" in r.stdout + r.stderr:
            break
        time.sleep(0.4)
    sh("pull", "/sdcard/ui.xml", f"{out}/ui-{name}.xml")
    if shot:
        png = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True).stdout
        open(f"{out}/shot-{name}.png", "wb").write(png)
    return open(f"{out}/ui-{name}.xml", encoding="utf-8", errors="ignore").read()


NODE = re.compile(r"<node [^>]*?>")


def find(xml: str, pattern: str, nth: int = 0, attr: str = "text|content-desc") -> tuple[int, int] | None:
    # `<regex>#<class-regex>` narrows to a widget class (the panel's Button vs the gutter's TextView)
    pattern, _, cls = pattern.partition("#")
    hits = []
    for m in NODE.finditer(xml):
        node = m.group(0)
        if cls and not re.search(cls, re.search(r'class="([^"]*)"', node).group(1)):
            continue
        ok = False
        for a in attr.split("|"):
            v = re.search(rf'{a}="([^"]*)"', node)
            if v and re.search(pattern, v.group(1)):
                ok = True
        if not ok:
            continue
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        if b:
            x0, y0, x1, y1 = map(int, b.groups())
            if y1 <= y0 or x1 <= x0:  # clipped at the viewport edge (inverted bounds): not tappable
                continue
            hits.append(((x0 + x1) // 2, (y0 + y1) // 2))
    return hits[nth] if len(hits) > nth else None


def block_order(xml: str) -> list[str]:
    # document order = rendered order (a card clipped at a viewport edge carries inverted bounds,
    # so sorting by y would misplace it — seen on the off-screen move, 2026-09-08)
    cards = []
    for m in NODE.finditer(xml):
        node = m.group(0)
        d = re.search(r'content-desc="([^"]*?, \d+:\d\d\s?[AP]M to [^"]*)"', node)
        if d:
            cards.append(d.group(1))
    return cards


def main() -> int:
    args = sys.argv[1:]
    out, tag = args[0], args[1]
    args = args[2:]
    record = 8.0
    crop = "0,490,1080,2050"
    while args and args[0].startswith("--"):
        if args[0] == "--record":
            record = float(args[1])
        elif args[0] == "--crop":
            crop = args[1]
        args = args[2:]
    os.makedirs(out, exist_ok=True)
    require_foreground()
    before = dump(out, f"{tag}-before")
    print(f"[{tag}] order before: {len(block_order(before))} cards")
    rec = subprocess.Popen(
        ["adb", "shell", "screenrecord", "--time-limit", str(int(record)), "--bit-rate", "8000000", "/sdcard/motion.mp4"]
    )
    t0 = time.monotonic()
    time.sleep(1.5)  # the encoder's start-up; the first frames are the resting list
    stamps: list[tuple[float, str]] = []
    for step in args:
        kind, _, arg = step.partition(":")
        if kind == "sleep":
            time.sleep(float(arg))
            continue
        if kind == "dump":
            dump(out, f"{tag}-{arg}")
            continue
        if kind in ("tap", "tapid"):
            require_foreground()
            nth = 0
            if kind == "tap" and "@" in arg:
                arg, n = arg.rsplit("@", 1)
                nth = int(n)
            xml = dump(out, f"{tag}-find", shot=False)  # the locate dump: no screenshot (≈ 2 s each)
            pos = find(xml, arg, nth, "resource-id" if kind == "tapid" else "text|content-desc")
            if pos is None:
                print(f"[{tag}] NOT FOUND: {step}")
                stamps.append((time.monotonic() - t0, f"NOT FOUND {step}"))
                continue
            stamps.append((time.monotonic() - t0, step))
            sh("shell", "input", "tap", str(pos[0]), str(pos[1]))
            continue
        if kind == "tapxy":  # by coordinates, no locate dump — for a second input inside a window
            require_foreground()
            stamps.append((time.monotonic() - t0, step))
            sh("shell", "input", "tap", *arg.split(","))
            continue
        if kind == "text":
            stamps.append((time.monotonic() - t0, step))
            sh("shell", "input", "text", arg)
            continue
        if kind == "key":
            stamps.append((time.monotonic() - t0, step))
            sh("shell", "input", "keyevent", arg)
            continue
        if kind == "swipe":
            stamps.append((time.monotonic() - t0, step))
            sh("shell", "input", "swipe", *arg.split(","))
            continue
        print(f"[{tag}] unknown step {step}")
    rec.wait()
    sh("pull", "/sdcard/motion.mp4", f"{out}/{tag}.mp4")
    sh("shell", "rm", "-f", "/sdcard/motion.mp4")
    print(f"[{tag}] steps (s from record start):")
    for t, s in stamps:
        print(f"   {t:6.2f}  {s}")
    print(f"[{tag}] change runs in the list crop:")
    subprocess.run([sys.executable, os.path.join(HERE, "hw-motion-frames.py"), f"{out}/{tag}.mp4", "--crop", crop, "--csv", f"{out}/{tag}-runs.csv"])
    time.sleep(0.5)
    print(f"[{tag}] paint check (hw-blank-cards.py):")
    subprocess.run([sys.executable, os.path.join(HERE, "hw-blank-cards.py"), out, f"{tag}-after"])
    after = open(f"{out}/ui-{tag}-after.xml", encoding="utf-8", errors="ignore").read()
    order = block_order(after)
    open(f"{out}/order-{tag}.txt", "w").write("\n".join(order) + "\n")
    print(f"[{tag}] order after ({len(order)} cards on screen):")
    for d in order:
        print("   " + d[:90])
    return 0


if __name__ == "__main__":
    sys.exit(main())
