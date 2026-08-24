#!/usr/bin/env python3
"""NFR-P2 cold-start measurement driver (docs/verification/p2-manual-verification.md).

Runs N cold launches of the app on the booted iOS simulator and reports per-launch
cold-start times plus the p90. Timing model:

  T0       = wall clock immediately before `simctl launch` is invoked
  T_frame  = wall clock when the app's first root frame pings the local listener
             (src/observability/startup.ts, built with EXPO_PUBLIC_STARTUP_MARKER_URL)
  cold     = T_frame - T0

Both timestamps come from this process's clock (the listener runs in-process), so
there is no cross-clock skew. The number is conservative: T0 includes simctl's own
process-spawn overhead, which a user tapping the home-screen icon does not pay.

Usage:  python3 measure-cold-start.py [launches=10] [bundle-id=com.hourwell.app]
"""

import http.server
import json
import statistics
import subprocess
import sys
import threading
import time

PORT = 8787
marks: list[dict] = []
marks_lock = threading.Condition()


class MarkHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (stdlib naming)
        now = time.monotonic()
        with marks_lock:
            marks.append({"t": now, "path": self.path})
            marks_lock.notify_all()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):  # silence per-request stderr noise
        pass


def wait_for_mark(count_before: int, timeout: float = 20.0) -> dict | None:
    deadline = time.monotonic() + timeout
    with marks_lock:
        while len(marks) <= count_before:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            marks_lock.wait(remaining)
        return marks[-1]


def main() -> int:
    launches = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    bundle_id = sys.argv[2] if len(sys.argv) > 2 else "com.hourwell.app"

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), MarkHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def run(*cmd: str) -> None:
        subprocess.run(cmd, check=False, capture_output=True)

    # Warm-up launch: first run applies the SQLite migration; the protocol measures
    # steady-state cold starts (kill between launches, no reboot, migration done).
    run("xcrun", "simctl", "terminate", "booted", bundle_id)
    time.sleep(2)
    before = len(marks)
    run("xcrun", "simctl", "launch", "booted", bundle_id)
    if wait_for_mark(before) is None:
        print("warm-up: no first-frame mark received — is this a marker build?")
        return 1
    print("warm-up launch ok (migration applied); starting measured launches")

    times_ms: list[float] = []
    for i in range(launches):
        run("xcrun", "simctl", "terminate", "booted", bundle_id)
        time.sleep(3)  # let the simulator settle between kills
        before = len(marks)
        t0 = time.monotonic()
        run("xcrun", "simctl", "launch", "booted", bundle_id)
        mark = wait_for_mark(before)
        if mark is None:
            print(f"launch {i + 1}: TIMEOUT waiting for first-frame mark")
            return 1
        cold_ms = (mark["t"] - t0) * 1000
        times_ms.append(cold_ms)
        js_half = mark["path"].split("js_ms=")[-1] if "js_ms=" in mark["path"] else "?"
        print(f"launch {i + 1:2d}: {cold_ms:7.0f} ms  (js-start→first-frame {js_half} ms)")

    times_sorted = sorted(times_ms)
    p90 = times_sorted[max(0, int(round(0.9 * len(times_sorted))) - 1)]
    print(json.dumps({
        "launches": launches,
        "times_ms": [round(t) for t in times_ms],
        "median_ms": round(statistics.median(times_ms)),
        "p90_ms": round(p90),
        "pass_2000ms": p90 <= 2000,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
