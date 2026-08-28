/**
 * Supabase adapters for `sync-resolve`: the replay and the lease go through the SERVICE-ROLE
 * client (security-definer RPCs, the user id from the verified JWT); the pull goes through the
 * USER client so `sync_pull()` runs under RLS — the function cannot return another user's row
 * even with a broken filter (ADR-0012 §5).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { type OpAck, PULL_TABLES, type PullRow, type SyncOp } from '../_shared/sync_types.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

export async function replayOps(
  admin: AnyClient,
  userId: string,
  ops: readonly SyncOp[],
): Promise<OpAck[]> {
  const { data, error } = await admin.rpc('sync_replay', { p_user_id: userId, p_ops: ops });
  if (error) fail('sync_replay', error);
  if (!Array.isArray(data)) fail('sync_replay', { message: 'non-array result' });
  return data as OpAck[];
}

export async function acquireLease(
  admin: AnyClient,
  userId: string,
  ttlSeconds: number,
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

export async function pullRows(
  userClient: AnyClient,
  cursor: number,
  limit: number,
): Promise<PullRow[]> {
  const { data, error } = await userClient.rpc('sync_pull', { p_cursor: cursor, p_limit: limit });
  if (error) fail('sync_pull', error);
  const rows: PullRow[] = [];
  // deno-lint-ignore no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const seq = Number(r.server_seq);
    if (!Number.isSafeInteger(seq)) continue;
    if (!(PULL_TABLES as readonly string[]).includes(r.tbl)) continue;
    rows.push({ server_seq: seq, tbl: r.tbl, row: r.payload as Record<string, unknown> });
  }
  return rows;
}
