#!/usr/bin/env python3
"""iPhone-pass helper (2026-09-07) — the closest iOS has to `uiautomator dump` + `input tap` +
`settings put`: the device's accessibility audit daemon (what Xcode's Accessibility Inspector
talks to), reached through Xcode's CoreDevice tunnel over USB (no sudo, iOS 17+). Never claims a
result: it records what the device exposes and does what an assistive user could do.

    uvx --from pymobiledevice3 python docs/verification/hw-ios-ax.py <command> ...

    items <out.json>          walk the foreground app's elements in VoiceOver order; write
                              caption + spoken description per element (the structural half of
                              an NFR-A1 check — the spoken half is still a person listening)
    press <regex>             simulated activation of the first element whose spoken description
                              matches (works only for our own app: the target needs get-task-allow,
                              which a development-signed build has and system apps do not)
    settings show             REDUCE_MOTION, REDUCE_TRANSPARENCY, INCREASE_CONTRAST, BUTTON_SHAPES,
    settings set KEY VALUE    DYNAMIC_TYPE (0..1 of the Larger Text slider; 1.0 = AX5) …
    settings reset            back to the device defaults
    hold KEY=VALUE ... --seconds N
                              apply settings and KEEP the daemon connection open for N seconds —
                              the daemon's settings live only while a client is connected (they
                              reverted the moment the CLI exited, 2026-09-07) — then restore the
                              values read before; run it in the background while WDA captures
    audit [type ...]          the on-device audit (default: every supported type)
    monitor off|on            the daemon's app-monitoring mode (items leaves it on; off after use)

Set HW_IOS_UDID to pick a device; otherwise the first USB iPhone is used.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

from pymobiledevice3.remote import native_tunnel
from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit
from pymobiledevice3.usbmux import list_devices


async def _udid() -> str:
    udid = os.environ.get("HW_IOS_UDID")
    if udid:
        return udid
    devices = [d for d in await list_devices() if d.connection_type == "USB"]
    if not devices:
        sys.exit("no USB iPhone")
    return devices[0].serial


def _value(raw: str):
    if raw.lower() in ("true", "false"):
        return raw.lower() == "true"
    try:
        return float(raw)
    except ValueError:
        return raw


async def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, args = argv[0], argv[1:]
    rsd = await native_tunnel.establish_native_rsd(serial=await _udid())
    async with AccessibilityAudit(rsd) as ax:
        if cmd == "items":
            out = args[0] if args else "-"
            items = [f.to_dict() async for f in ax.iter_elements()]
            text = json.dumps(items, ensure_ascii=False, indent=1)
            if out == "-":
                print(text)
            else:
                with open(out, "w", encoding="utf-8") as fh:
                    fh.write(text + "\n")
            for i, it in enumerate(items):
                print(f"{i:3d}  {it.get('spoken_description') or it.get('caption') or ''}")
            await ax.set_app_monitoring_enabled(False)
            return 0
        if cmd == "press":
            pattern = re.compile(args[0])
            async for focus in ax.iter_elements():
                spoken = focus.spoken_description or focus.caption or ""
                if pattern.search(spoken):
                    if focus.element is None:
                        print(f"matched but no element handle: {spoken}")
                        return 1
                    await ax.perform_press(focus.element.identifier)
                    print(f"pressed: {spoken}")
                    return 0
            print("no element matched", file=sys.stderr)
            return 1
        if cmd == "settings":
            sub = args[0] if args else "show"
            if sub == "show":
                for s in await ax.settings():
                    print(f"{s.key} = {s.value}")
            elif sub == "set":
                await ax.set_setting(args[1], _value(args[2]))
                for s in await ax.settings():
                    if s.key == args[1]:
                        print(f"{s.key} = {s.value}")
            elif sub == "reset":
                await ax.reset_settings()
                print("reset")
            return 0
        if cmd == "hold":
            seconds = 120.0
            pairs: list[tuple[str, str]] = []
            i = 0
            while i < len(args):
                if args[i] == "--seconds":
                    seconds = float(args[i + 1]); i += 2
                else:
                    k, v = args[i].split("=", 1); pairs.append((k, v)); i += 1
            before = {s.key: s.value for s in await ax.settings()}
            for k, v in pairs:
                await ax.set_setting(k, _value(v))
            # the daemon answers this client's own re-read with the value from before the set
            # (2026-09-09: printed False while a second client — `settings show` — and WDA's
            # `reduceMotion` both read True); wait a moment, then trust a fresh read
            await asyncio.sleep(1.0)
            now = {s.key: s.value for s in await ax.settings()}
            print("holding " + ", ".join(f"{k}={now.get(k)} (asked {v})" for k, v in pairs) + f" for {seconds:.0f} s — verify with a second client: `settings show`", flush=True)
            try:
                await asyncio.sleep(seconds)
            finally:
                for k, _ in pairs:
                    await ax.set_setting(k, before[k])
                after = {s.key: s.value for s in await ax.settings()}
                print("restored " + ", ".join(f"{k}={after.get(k)}" for k, _ in pairs), flush=True)
            return 0
        if cmd == "monitor":
            # `items` enables the daemon's app monitoring (focus events) and leaves it on; XCUITest
            # snapshots crawled while it stayed on (2026-09-07) — switch it off after a listing.
            on = (args[0] if args else "off") == "on"
            await ax.set_app_monitoring_enabled(on)
            print(f"app monitoring {'on' if on else 'off'}")
            return 0
        if cmd == "audit":
            types = args or await ax.supported_audits_types()
            issues = await ax.run_audit(list(types))
            print(json.dumps([i.json() for i in issues], ensure_ascii=False, indent=1))
            print(f"{len(issues)} issue(s)", file=sys.stderr)
            return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
