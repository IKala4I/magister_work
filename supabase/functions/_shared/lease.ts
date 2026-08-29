/**
 * The per-user lease (ADR-0012 §7; adversarial #1/#14): every server-side writer of a user's
 * rows — `sync-resolve`, the daily attribution sweep, the calendar sync, plan persistence —
 * holds it while writing, and the pull reads under it, so a pull never lands between a writer's
 * `server_seq` assignment and its commit. Service-role RPCs; TTL-bounded (a crashed holder
 * cannot wedge a user).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export const LEASE_TTL_SECONDS = 30;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

export async function acquireLease(
  admin: AnyClient,
  userId: string,
  ttlSeconds = LEASE_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await admin.rpc('acquire_sync_lease', {
    p_user_id: userId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) fail('acquire_sync_lease', error);
  return typeof data === 'string' && data.length > 0 ? data : null;
}

export async function releaseLease(admin: AnyClient, userId: string, token: string): Promise<void> {
  const { error } = await admin.rpc('release_sync_lease', { p_user_id: userId, p_token: token });
  if (error) console.error('release_sync_lease failed', error.message); // the TTL bounds it
}

/**
 * Run `fn` under the user's lease, waiting up to `waitMs` for a busy one (short writers —
 * plan persistence, a calendar delta — should not fail because a sync is in flight). When the
 * lease is still busy after the wait, `fn` runs anyway with `held = false` so the caller can
 * log it: correctness then rests on the compare-and-set patches, not on the lease.
 */
export async function withLease<T>(
  admin: AnyClient,
  userId: string,
  fn: (held: boolean) => Promise<T>,
  waitMs = 3_000,
  stepMs = 250,
): Promise<T> {
  const deadline = Date.now() + waitMs;
  let token: string | null = null;
  for (;;) {
    token = await acquireLease(admin, userId);
    if (token !== null || Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  try {
    return await fn(token !== null);
  } finally {
    if (token !== null) await releaseLease(admin, userId, token);
  }
}
