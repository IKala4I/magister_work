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

import type { AnalyticsEventName, AnalyticsEvents } from './events';

let client: PostHog | null = null;

export function initAnalytics(): boolean {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  if (!apiKey || !host) {
    client = null;
    return false;
  }
  client = new PostHog(apiKey, {
    host,
    disableGeoip: true,
  });
  return true;
}

/** No-op until initAnalytics() ran with keys present — safe to call anywhere. */
export function track<N extends AnalyticsEventName>(name: N, properties: AnalyticsEvents[N]): void {
  client?.capture(name, properties);
}

/** Test seam + future opt-out surface (P10 privacy screen). */
export function isAnalyticsEnabled(): boolean {
  return client !== null;
}
