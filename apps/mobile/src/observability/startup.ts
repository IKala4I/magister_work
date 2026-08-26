/**
 * NFR-P2 instrumentation (cold start ≤2 s p90): measures JS-bundle-start → first root
 * frame. The native half (process start → JS start) is read from the platform tools during
 * the on-device measurement protocol (docs/verification/p2-manual-verification.md,
 * §cold-start); this module provides the JS half and a single log line per launch.
 */
const jsStartMs = Date.now();

/**
 * Measurement builds only (docs/verification/p2-manual-verification.md §cold-start):
 * when the build was made with EXPO_PUBLIC_STARTUP_MARKER_URL set, the first frame
 * pings that local listener so the protocol can timestamp render-complete without
 * relying on release-mode console logging. Never set this in .env — it is passed
 * inline to the one-off measurement build and is absent from shipping builds.
 */
const markerUrl = process.env.EXPO_PUBLIC_STARTUP_MARKER_URL;

let firstFrameMs: number | null = null;

/** Idempotent: called from the root view's first onLayout. */
export function markFirstFrame(): void {
  if (firstFrameMs !== null) return;
  firstFrameMs = Date.now();
  if (__DEV__) {
    console.log(`[startup] js-start → first-frame: ${firstFrameMs - jsStartMs} ms`);
  }
  if (markerUrl) {
    fetch(`${markerUrl}?js_ms=${firstFrameMs - jsStartMs}`).catch(() => {
      // Measurement listener gone — never let instrumentation touch the app.
    });
  }
}

export function getStartupTiming(): { jsStartToFirstFrameMs: number } | null {
  if (firstFrameMs === null) return null;
  return { jsStartToFirstFrameMs: firstFrameMs - jsStartMs };
}
