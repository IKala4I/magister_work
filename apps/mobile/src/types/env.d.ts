/**
 * EXPO_PUBLIC_* variables are inlined by babel-preset-expo at bundle time. Only variables
 * declared here are read by app code; secrets never use the EXPO_PUBLIC prefix (NFR-S1 —
 * a public DSN is not a secret, the service-role key would be and must never appear here).
 */
declare const process: {
  env: {
    /** Sentry ingest DSN (EU org). Absent → crash reporting disabled (env-gated). */
    EXPO_PUBLIC_SENTRY_DSN?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  };
};
