#!/usr/bin/env python3
"""iPhone-pass helper (2026-09-07): drive WebDriverAgent (Appium's XCUITest server, built and
signed with the personal team, started with `pymobiledevice3 developer dvt xcuitest
com.hourwell.wda.xctrunner`, reached through `pymobiledevice3 usbmux forward 8100 8100`) — real
synthesized touches, which the accessibility daemon's "Activate" cannot deliver to a React
Native Pressable. The iOS twin of `input tap` / `input text` / `input swipe` / `uiautomator dump`.
Never claims a result: it records what the device shows.

    docs/verification/hw-ios-wda.py session                    new session on the frontmost app (stored in $TMPDIR)
    …  tap <name> [--nth N] [--using name|accessibility id|xpath|predicate string|class chain]
    …  tap-xy <x> <y>                                          points, not pixels
    …  find <name>                                             matching elements: type, visible, rect
    …  set [--using S] [--nth N] <selector> <value>            e.g. a PickerWheel row's text
    …  type <text>                                             into the focused field
    …  swipe <x1> <y1> <x2> <y2> [seconds]
    …  scroll-to <name>                                        scroll the element into view
    …  source [out.xml]                                        the XCUITest element tree
    …  screenshot <out.png>
    …  press home|lock|volumeUp|volumeDown
    …  lock | unlock | locked
    …  alert text|buttons|accept|dismiss                       system alerts (permission prompts)
    …  app launch|terminate|activate|state [bundleId]          default com.hourwell.app
    …  keyboard-dismiss
    …  window
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("HW_WDA_URL", "http://127.0.0.1:8100")
SESSION_FILE = os.path.join(os.environ.get("TMPDIR", "/tmp"), "hw-ios-wda.session")
APP = "com.hourwell.app"


def _http(method: str, path: str, body: dict | None = None, timeout: float = 60.0):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as err:
        payload = err.read().decode(errors="replace")
        try:
            value = json.loads(payload).get("value", {})
            raise SystemExit(f"WDA {err.code}: {value.get('error')}: {str(value.get('message'))[:300]}")
        except ValueError:
            raise SystemExit(f"WDA {err.code}: {payload[:300]}")


def _session(create: bool = False) -> str:
    if not create and os.path.exists(SESSION_FILE):
        return open(SESSION_FILE).read().strip()
    out = _http("POST", "/session", {"capabilities": {"alwaysMatch": {"defaultActiveApplication": "auto"}}})
    # XCUITest waits for the app to become "idle" before every gesture, and Hourwell's Today never
    # counts as idle for it — a 0.25 s drag blocked for ≈ 22 s (2026-09-09, the motion pass); with
    # the idle waits off the same drag returns in ≈ 1.9 s. Session-scoped, so set it here once.
    sid = out["sessionId"] if "sessionId" in out else out["value"]["sessionId"]
    _http(
        "POST",
        f"/session/{sid}/appium/settings",
        {"settings": {"waitForIdleTimeout": 0, "animationCoolOffTimeout": 0, "shouldWaitForQuiescence": False}},
    )
    with open(SESSION_FILE, "w") as fh:
        fh.write(sid)
    return sid


def _find(sid: str, value: str, using: str = "name", nth: int = 0) -> str:
    out = _http("POST", f"/session/{sid}/elements", {"using": using, "value": value})
    els = out.get("value") or []
    if len(els) <= nth:
        raise SystemExit(f"no element #{nth} for {using}={value!r} ({len(els)} found)")
    return els[nth]["ELEMENT"]


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, args = argv[0], argv[1:]
    if cmd == "session":
        print(_session(create=True))
        return 0
    sid = _session()
    if cmd == "tap":
        using, nth = "name", 0
        rest: list[str] = []
        i = 0
        while i < len(args):
            if args[i] == "--nth":
                nth = int(args[i + 1]); i += 2
            elif args[i] == "--using":
                using = args[i + 1]; i += 2
            else:
                rest.append(args[i]); i += 1
        el = _find(sid, rest[0], using, nth)
        _http("POST", f"/session/{sid}/element/{el}/click")
        print(f"tapped {rest[0]!r}")
    elif cmd == "tap-xy":
        _http("POST", f"/session/{sid}/wda/tap", {"x": float(args[0]), "y": float(args[1])})
        print(f"tapped ({args[0]}, {args[1]})")
    elif cmd == "find":
        out = _http("POST", f"/session/{sid}/elements", {"using": "name", "value": args[0]})
        for e in out.get("value") or []:
            el = e["ELEMENT"]
            rect = _http("GET", f"/session/{sid}/element/{el}/rect")["value"]
            shown = _http("GET", f"/session/{sid}/element/{el}/displayed")["value"]
            kind = _http("GET", f"/session/{sid}/element/{el}/attribute/type")["value"]
            print(f"{kind} visible={shown} rect={rect}")
    elif cmd == "set":
        # set --using 'class name' --nth N <selector> <value>   (picker wheels take the row's text)
        using, nth = "name", 0
        rest: list[str] = []
        i = 0
        while i < len(args):
            if args[i] == "--nth":
                nth = int(args[i + 1]); i += 2
            elif args[i] == "--using":
                using = args[i + 1]; i += 2
            else:
                rest.append(args[i]); i += 1
        el = _find(sid, rest[0], using, nth)
        _http("POST", f"/session/{sid}/element/{el}/value", {"value": rest[1]})
        print(f"set {rest[0]!r}[{nth}] = {rest[1]!r}")
    elif cmd == "type":
        _http("POST", f"/session/{sid}/wda/keys", {"value": list(args[0])})
        print("typed")
    elif cmd == "swipe":
        x1, y1, x2, y2 = (float(v) for v in args[:4])
        dur = float(args[4]) if len(args) > 4 else 0.3
        _http("POST", f"/session/{sid}/wda/dragfromtoforduration",
              {"fromX": x1, "fromY": y1, "toX": x2, "toY": y2, "duration": dur})
        print("swiped")
    elif cmd == "scroll-to":
        el = _find(sid, args[0])
        _http("POST", f"/session/{sid}/wda/element/{el}/scroll", {"toVisible": True})
        print(f"scrolled to {args[0]!r}")
    elif cmd == "source":
        xml = _http("GET", f"/session/{sid}/source")["value"]
        if args:
            with open(args[0], "w", encoding="utf-8") as fh:
                fh.write(xml)
            print(f"{len(xml)} chars → {args[0]}")
        else:
            print(xml)
    elif cmd == "screenshot":
        png = base64.b64decode(_http("GET", "/screenshot")["value"])
        with open(args[0], "wb") as fh:
            fh.write(png)
        print(f"{len(png)} bytes → {args[0]}")
    elif cmd == "press":
        _http("POST", f"/session/{sid}/wda/pressButton", {"name": args[0]})
        print(f"pressed {args[0]}")
    elif cmd in ("lock", "unlock"):
        _http("POST", f"/session/{sid}/wda/{cmd}")
        print(cmd)
    elif cmd == "locked":
        print(_http("GET", f"/session/{sid}/wda/locked")["value"])
    elif cmd == "alert":
        sub = args[0]
        if sub == "text":
            print(_http("GET", f"/session/{sid}/alert/text")["value"])
        elif sub == "buttons":
            print(_http("GET", f"/session/{sid}/wda/alert/buttons")["value"])
        else:
            _http("POST", f"/session/{sid}/alert/{sub}")
            print(f"alert {sub}")
    elif cmd == "app":
        sub = args[0]
        bundle = args[1] if len(args) > 1 else APP
        out = _http("POST", f"/session/{sid}/wda/apps/{sub}", {"bundleId": bundle})
        print(out.get("value") if sub == "state" else f"{sub} {bundle}")
    elif cmd == "keyboard-dismiss":
        _http("POST", f"/session/{sid}/wda/keyboard/dismiss")
        print("dismissed")
    elif cmd == "window":
        print(_http("GET", f"/session/{sid}/window/size")["value"])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
