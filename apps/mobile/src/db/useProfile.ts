/**
 * Reactive profile reads for routing and Settings. Separate from src/db/profile.ts because
 * this file imports the device database (src/db/client.ts must never be imported in jest —
 * P3 rule), while profile.ts stays pure and unit-testable.
 *
 * The routing gate must be correct on the FIRST render (a live query that lands after
 * mount would flash onboarding at every launch), so the row is read synchronously each
 * render; useLiveRows and the session store are subscribed purely as re-render drivers
 * (profiles table changes, uid changes from adopt/wipe).
 */
import { currentUserId } from '../auth/identity';
import { useSessionStore } from '../auth/session';

import { db } from './client';
import { getProfile } from './profile';
import type { ProfileRow } from './profile';
import { profiles } from './schema';
import { useLiveRows } from './useLiveRows';
import type { LocalDb } from './writes';

const PROFILE_TABLES = ['profiles'] as const;

/** The current identity's profile row; synchronous truth + live re-render triggers. */
export function useCurrentProfile(): ProfileRow | undefined {
  useSessionStore((s) => s.userId);
  useLiveRows(() => db.select({ userId: profiles.userId }).from(profiles), PROFILE_TABLES);
  return getProfile(db as unknown as LocalDb, currentUserId());
}

/** UC-01 routing gate. */
export function useOnboardingComplete(): boolean {
  return useCurrentProfile()?.onboardingCompletedAt != null;
}
