/**
 * Screenshot fixture entry (clock.ts explains the mode). Imported first by the root layout, so
 * the clock is shifted before any other module reads it; in every other build both functions
 * are no-ops behind the inlined `false`.
 */
import type { LocalDb } from '../db/writes';

import { installFixtureClock, SCREENSHOT_FIXTURE } from './clock';

/**
 * The fixture's invented rows must never meet a backend: with a Supabase key the account
 * transition would adopt them for a real user, and every fact would carry a shifted clock. Refuse
 * to start rather than trust the build command (make.sh also unsets the keys).
 */
export function assertNoBackend(env: Record<string, string | undefined>): void {
  const keys = [
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    env.EXPO_PUBLIC_SENTRY_DSN,
    env.EXPO_PUBLIC_POSTHOG_API_KEY,
    env.EXPO_PUBLIC_POSTHOG_HOST,
  ];
  if (keys.some((k) => k !== undefined && k !== '')) {
    throw new Error('screenshot fixture build with a backend key — rebuild with EXPO_NO_DOTENV=1');
  }
}

if (SCREENSHOT_FIXTURE) {
  // each name spelled out: babel-preset-expo inlines only literal process.env.EXPO_PUBLIC_* reads
  assertNoBackend({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  });
  installFixtureClock();
}

let seeded = false;

/** Seed the demo day once per process, after the migrations and before the first screen. */
export function seedFixtureOnce(db: LocalDb): void {
  if (!SCREENSHOT_FIXTURE || seeded) return;
  seeded = true;
  // required lazily: the seed and its JSON are never evaluated outside the fixture build
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  (require('./seed') as typeof import('./seed')).seedFixture(db);
}
