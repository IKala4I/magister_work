/**
 * Product analytics (NFR-O1, event half). Env-gated exactly like Sentry: without
 * BOTH EXPO_PUBLIC_POSTHOG_API_KEY and EXPO_PUBLIC_POSTHOG_HOST no client is ever
 * constructed, so development and CI ship nothing. The host comes only from the
 * env var — posthog-react-native falls back to the US cloud when host is omitted,
 * and NFR-S2 requires the EU instance, so a present key with a missing host stays
 * disabled rather than defaulting.
 *
 * Privacy posture (NFR-S2/NFR-S3): no PostHogProvider → no autocapture and no
 * session replay; GeoIP resolution disabled; event names + property shapes are
 * closed over the typed catalog in ./events.ts and never carry user-authored text.
 */
import PostHog from 'posthog-react-native';

import { isAnalyticsOptedOut } from '../privacy/state';

import type { AnalyticsEventName, AnalyticsEvents } from './events';

let client: PostHog | null = null;

export function initAnalytics(): boolean {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  // P10 (ADR-0014 §12): the opt-out flag wins over the keys — no client, no events
  if (!apiKey || !host || isAnalyticsOptedOut()) {
    client = null;
    return false;
  }
  client = new PostHog(apiKey, {
    host,
    disableGeoip: true,
    // the typed catalog (events.ts) is the complete list of what the app emits: no SDK-authored
    // lifecycle events (P10 adversarial M2)
    captureAppLifecycleEvents: false,
  });
  return true;
}

/** No-op until initAnalytics() ran with keys present — safe to call anywhere. */
export function track<N extends AnalyticsEventName>(name: N, properties: AnalyticsEvents[N]): void {
  client?.capture(name, properties);
}

/** Test seam + the Settings → Privacy toggle's read side. */
export function isAnalyticsEnabled(): boolean {
  return client !== null;
}

/**
 * Settings → Privacy (P10): switching off drops the client at once (nothing is captured or
 * flushed afterwards); switching on re-initialises from the env keys. The toggle event itself
 * is the last thing sent before an opt-out.
 */
export function setAnalyticsEnabled(enabled: boolean): boolean {
  if (!enabled) {
    track('privacy_toggled', { sdk: 'analytics', enabled: false });
    // optOut() is persisted by the SDK and gates capture on the live instance (its own
    // listeners included); dropping the reference alone would leave those running
    void client?.optOut().catch(() => undefined);
    client = null;
    return false;
  }
  return initAnalytics();
}
