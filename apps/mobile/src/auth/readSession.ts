/**
 * One read of the persisted session for the network paths (sync, plan request). supabase-js
 * answers `session: null` in two very different situations: there is no session (signed out,
 * erased) — or the access token has expired and the refresh request FAILED ON THE NETWORK.
 * In the second case auth-js keeps the refresh token, retries for up to 30 s, then caches that
 * failure for 60 s (`REFRESH_FAILURE_COOLDOWN_MS`) and answers every `getSession()` in that
 * window from the cache — even once the radios are back. That is "offline", not "sign in":
 * on the Pixel 7a the first open of a day after an offline night showed "Sign in to plan your
 * day", and the first online foreground still got the cached failure and planned nothing
 * (hardware pass 2026-09-04, F1). The session store's `refreshedAt` bump on TOKEN_REFRESHED is
 * the other half: the plan trigger re-checks once the refresh finally lands.
 */
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from './client';

export type SessionRead =
  { kind: 'session'; userId: string } | { kind: 'offline' } | { kind: 'none' };

export async function readSession(): Promise<SessionRead> {
  if (!supabase) return { kind: 'none' };
  const { data, error } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) return { kind: 'session', userId };
  return isAuthRetryableFetchError(error) ? { kind: 'offline' } : { kind: 'none' };
}
