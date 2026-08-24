/**
 * Crash reporting (NFR-O1, crash half). Env-gated: without EXPO_PUBLIC_SENTRY_DSN the SDK
 * initializes disabled, so development and CI never ship events. Privacy posture (NFR-S2):
 * EU-hosted org (the DSN itself must point at the EU ingest — deployment gate), no default
 * PII, tracing off — Sentry receives stack traces and device context, never task text.
 */
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): boolean {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 50,
  });
  return Boolean(dsn);
}

export { Sentry };
