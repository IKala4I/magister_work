#!/usr/bin/env python3
"""iPhone-pass driver (ADR-0022, 2026-09-09): one block interaction on Today through WebDriverAgent
(the session from `hw-ios-wda.py session`), with the paint/order scan (`hw-ios-paint.py`) before
and after. The block card is an accessibility leaf on iOS, so its action row is not in the
XCUITest tree: the buttons are tapped by coordinates inside the card's rect — the row sits 38 pt
above the card's bottom edge, Start / Done / Skip / Move… at x ≈ 127 / 189 / 251 / 319 pt on an
iPhone 12 (measured on a screenshot, 2026-09-09; "I did it" replaces the row's single button at
x ≈ 127). Never claims a result: it records what the tree and the pixels show.

  python3 docs/verification/hw-ios-motion-drive.py <outdir> <tag> <card-regex> done|skip|didit
  python3 docs/verification/hw-ios-motion-drive.py <outdir> <tag> <card-regex> move <hour> <minute> [AM|PM]
      (the wheel picker: `set` on the hour / minute / period wheels, then "Move here")
  python3 docs/verification/hw-ios-motion-drive.py <outdir> <tag> <card-regex> move-same
      (open the picker and confirm without changing the wheels — the same-slot case)
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("HW_WDA_URL", "http://127.0.0.1:8100")
SESSION_FILE = os.path.join(os.environ.get("TMPDIR", "/tmp"), "hw-ios-wda.session")
ROW_ABOVE_BOTTOM = 38
X = {"start": 127, "done": 189, "skip": 251, "move": 319, "didit": 127}


def http(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def wda(*args):
    r = subprocess.run([sys.executable, os.path.join(HERE, "hw-ios-wda.py"), *args], capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def cards(sid):
    pred = "label CONTAINS ' to ' AND label CONTAINS 'Confidence'"
    out = []
    for e in http("POST", f"/session/{sid}/elements", {"using": "predicate string", "value": pred})["value"]:
        el = e.get("ELEMENT") or e.get("element-6066-11e4-a52e-4f735466cecf")
        rect = http("GET", f"/session/{sid}/element/{el}/rect")["value"]
        label = http("GET", f"/session/{sid}/element/{el}/attribute/label")["value"] or ""
        out.append((label, rect))
    return out


def tap_xy(sid, x, y):
    http("POST", f"/session/{sid}/wda/tap", {"x": x, "y": y})


def paint(out, tag):
    r = subprocess.run([sys.executable, os.path.join(HERE, "hw-ios-paint.py"), out, tag], capture_output=True, text=True)
    return r.stdout


def main():
    out, tag, card_re, action = sys.argv[1:5]
    extra = sys.argv[5:]
    os.makedirs(out, exist_ok=True)
    sid = open(SESSION_FILE).read().strip()
    before = paint(out, f"{tag}-before")
    print(f"[{tag}] before: " + [l for l in before.splitlines() if "cards_in_tree" in l][0])
    # bring the card's action row into the usable band (below the header, above the tab bar);
    # FlashList keeps cells mounted beyond the viewport, so the tree lists cards that are off screen
    label = rect = None
    for attempt in range(8):
        hit = [(l, r) for l, r in cards(sid) if re.search(card_re, l)]
        if not hit:
            print(f"[{tag}] NO CARD matches {card_re!r}")
            return 2
        label, rect = hit[0]
        y = rect["y"] + rect["height"] - ROW_ABOVE_BOTTOM
        if 120 <= y <= 740 and rect["y"] >= 40:
            break
        # a short drag inside the list, 0.25 s (longer reads as a press); ≈ 250 pt per drag
        if y > 740:
            wda("swipe", "195", "600", "195", "350", "0.25")
        else:
            wda("swipe", "195", "350", "195", "600", "0.25")
        # a 0.25 s drag flings; wait until the card's rect reads the same twice (the list has
        # stopped) — a tap on a still-moving list lands on the wrong row (the Skip miss, 01:02)
        last = None
        for _ in range(10):
            time.sleep(0.7)
            hit = [(l, r) for l, r in cards(sid) if re.search(card_re, l)]
            cur = hit[0][1]["y"] if hit else None
            if cur is not None and cur == last:
                break
            last = cur
    else:
        print(f"[{tag}] card never fully on screen (y {rect['y']}, row {y})")
        return 2
    kind = "move" if action.startswith("move") else action
    x = X[kind]
    print(f"[{tag}] {action} on {label[:40]!r} at ({x}, {y:.0f}) {time.strftime('%H:%M:%S')}")
    tap_xy(sid, x, y)
    if action.startswith("move"):
        time.sleep(1.0)
        if action == "move":
            hour, minute = extra[0], extra[1]
            period = extra[2] if len(extra) > 2 else None
            # the wheels, top to bottom: hour, minute[, AM/PM]
            wheels = http("POST", f"/session/{sid}/elements", {"using": "class name", "value": "XCUIElementTypePickerWheel"})["value"]
            ids = [w.get("ELEMENT") or w.get("element-6066-11e4-a52e-4f735466cecf") for w in wheels]
            print(f"[{tag}] wheels: {len(ids)}")
            for el, val in zip(ids, [hour, minute, period]):
                if val is None:
                    continue
                http("POST", f"/session/{sid}/element/{el}/value", {"value": [val]})
                time.sleep(0.4)
        time.sleep(0.6)
        print(f"[{tag}] Move here {time.strftime('%H:%M:%S')}: " + wda("tap", "Move here"))
    time.sleep(2.5)
    after = paint(out, f"{tag}-after")
    print(f"[{tag}] after:")
    for l in after.splitlines():
        print("   " + l[:100])
    return 0


if __name__ == "__main__":
    sys.exit(main())
