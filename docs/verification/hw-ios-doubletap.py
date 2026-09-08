"""iPhone-pass helper (2026-09-08): two W3C touch taps at (x, y) points, <gap> ms apart, through the
open WDA session (hw-ios-wda.py session) — the double-tap arming test of the destructive dialog.
Usage: python3 hw-ios-doubletap.py <x> <y> [gap_ms=120]"""
import json, os, sys, time, urllib.request
sid = open(os.path.join(os.environ.get("TMPDIR", "/tmp"), "hw-ios-wda.session")).read().strip()
x, y, gap = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 120
acts = [{"type": "pointerMove", "duration": 0, "x": x, "y": y},
        {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 40}, {"type": "pointerUp", "button": 0},
        {"type": "pause", "duration": gap},
        {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 40}, {"type": "pointerUp", "button": 0}]
body = {"actions": [{"type": "pointer", "id": "f1", "parameters": {"pointerType": "touch"}, "actions": acts}]}
req = urllib.request.Request(f"http://127.0.0.1:8100/session/{sid}/actions", data=json.dumps(body).encode(), method="POST",
                             headers={"Content-Type": "application/json"})
t0 = time.time(); r = urllib.request.urlopen(req, timeout=60).read()[:120]; print("actions done in %.0f ms" % ((time.time()-t0)*1000), r)
