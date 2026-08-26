/**
 * EXPO_PUBLIC_* variables are inlined by babel-preset-expo at bundle time. Only variables
 * declared here are read by app code; secrets never use the EXPO_PUBLIC prefix (NFR-S1 —
 * a public DSN is not a secret, the service-role key would be and must never appear here).
 */
declare const process: {
  env: {
    /** Sentry ingest DSN (EU org). Absent → crash reporting disabled (env-gated). */
    EXPO_PUBLIC_SENTRY_DSN?: string;
    /** Supabase project URL. Absent (with the key) → auth disabled, app stays local-only. */
    EXPO_PUBLIC_SUPABASE_URL?: string;
    /** Supabase anon (publishable) key — RLS-scoped, safe in the bundle (NFR-S1). */
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** PostHog project key. Absent → analytics disabled (env-gated, like Sentry). */
    EXPO_PUBLIC_POSTHOG_API_KEY?: string;
    /**
     * PostHog ingest host — must be the EU instance (NFR-S2). Never hardcoded and
     * never defaulted: key without host stays disabled rather than falling back to
     * the SDK's US default.
     */
    EXPO_PUBLIC_POSTHOG_HOST?: string;
    /**
     * Measurement builds only (p2-manual-verification §cold-start): local listener
     * pinged at first frame. Passed inline to one-off builds, never set in .env.
     */
    EXPO_PUBLIC_STARTUP_MARKER_URL?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  };
};
