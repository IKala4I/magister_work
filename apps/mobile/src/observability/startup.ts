/**
 * NFR-P2 instrumentation (cold start ≤2 s p90): measures JS-bundle-start → first root
 * frame. The native half (process start → JS start) is read from the platform tools during
 * the on-device measurement protocol (docs/verification/p2-manual-verification.md,
 * §cold-start); this module provides the JS half and a single log line per launch.
 */
const jsStartMs = Date.now();

let firstFrameMs: number | null = null;

/** Idempotent: called from the root view's first onLayout. */
export function markFirstFrame(): void {
  if (firstFrameMs !== null) return;
  firstFrameMs = Date.now();
  if (__DEV__) {
    console.log(`[startup] js-start → first-frame: ${firstFrameMs - jsStartMs} ms`);
  }
}

export function getStartupTiming(): { jsStartToFirstFrameMs: number } | null {
  if (firstFrameMs === null) return null;
  return { jsStartToFirstFrameMs: firstFrameMs - jsStartMs };
}
