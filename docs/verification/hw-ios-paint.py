#!/usr/bin/env python3
"""iPhone-pass helper (ADR-0022, 2026-09-09): the iOS twin of `hw-blank-cards.py` — is every Today
card that exists in the XCUITest tree actually painted? Through WebDriverAgent (the session made by
`hw-ios-wda.py session`, `HW_WDA_URL` default http://127.0.0.1:8100): every element whose label
looks like a block card ("…, 1:30 PM to 2:00 PM, Confidence …") with its rect in points, one WDA
screenshot (pixels; the scale is read from the window size), the pixel std-dev inside each card
(BLANK when < 3), and the labels in tree order (the block order). Never claims a result.

  python3 docs/verification/hw-ios-paint.py <outdir> <tag>
"""
import base64
import io
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

BASE = os.environ.get("HW_WDA_URL", "http://127.0.0.1:8100")
SESSION_FILE = os.path.join(os.environ.get("TMPDIR", "/tmp"), "hw-ios-wda.session")


def http(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def main():
    out, tag = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sid = open(SESSION_FILE).read().strip()
    png = base64.b64decode(http("GET", "/screenshot")["value"])
    open(f"{out}/shot-{tag}.png", "wb").write(png)
    img = np.asarray(Image.open(io.BytesIO(png)).convert("L"), dtype=np.int16)
    win = http("GET", f"/session/{sid}/window/size")["value"]
    scale = img.shape[1] / float(win["width"])
    pred = "label CONTAINS ' to ' AND label CONTAINS 'Confidence'"
    els = http("POST", f"/session/{sid}/elements", {"using": "predicate string", "value": pred})["value"]
    order = []
    blank = 0
    scanned = 0
    for e in els:
        el = e.get("ELEMENT") or e.get("element-6066-11e4-a52e-4f735466cecf")
        rect = http("GET", f"/session/{sid}/element/{el}/rect")["value"]
        label = http("GET", f"/session/{sid}/element/{el}/attribute/label")["value"] or ""
        x0, y0 = int(rect["x"] * scale), int(rect["y"] * scale)
        x1, y1 = int((rect["x"] + rect["width"]) * scale), int((rect["y"] + rect["height"]) * scale)
        y0c, y1c = max(y0, 0), min(y1, img.shape[0])
        if y1c - y0c < 60 * scale:  # mostly off screen
            order.append(label)
            continue
        sd = float(img[y0c + 15 : y1c - 15, x0 + 15 : x1 - 15].std())
        st = "BLANK" if sd < 3 else "ok"
        scanned += 1
        blank += st == "BLANK"
        print(f"{tag} {label.split(',')[0][:22].ljust(22)} y {y0}-{y1} sd {sd:5.1f} {st}")
        order.append(label)
    open(f"{out}/order-{tag}.txt", "w").write("\n".join(order) + "\n")
    print(f"{tag} cards_in_tree={len(els)} scanned={scanned} blank={blank}")
    for l in order:
        print("   " + l[:90])


if __name__ == "__main__":
    main()
