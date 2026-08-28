/**
 * `gcal-webhook` — two callers (ADR-0012 §10):
 *   • Google push notifications (headers `X-Goog-Channel-ID` / `-Resource-ID` /
 *     `-Channel-Token` / `-Resource-State`): the per-channel token is checked against
 *     `gcal_sync_state`, then the user's calendar is synced incrementally and open blocks that
 *     now overlap a busy interval become `displaced_pending` (M-02, File 05 §2).
 *   • The pg_cron sweep every 5 min (`{mode: "sweep"}` + `x-service-key`): renews channels with
 *     < 24 h left, re-syncs users not synced in the last 5 min (UC-09's ≤ 5 min bound holds even
 *     without push), and runs the opt-in write-back.
 * Dependency-injected; `handler_test.ts` runs it against a fake Google and a fake database.
 */
import type { GoogleConfig } from '../_shared/gcal.ts';
import {
  ensureChannel,
  type GcalState,
  type SyncDeps,
  type SyncReport,
  syncUser,
  writeBack,
  type WriteBackReport,
} from '../_shared/gcal_sync.ts';

export interface Deps extends Omit<SyncDeps, 'config'> {
  config: GoogleConfig | null;
  serviceKey: string | null;
  loadStateByChannel(channelId: string): Promise<GcalState | null>;
  loadConnected(): Promise<GcalState[]>;
  /** Runs a user's writes under the per-user lease (ADR-0012 §7); direct call when absent. */
  withLease?<T>(userId: string, fn: () => Promise<T>): Promise<T>;
}

function leased<T>(deps: Deps, userId: string, fn: () => Promise<T>): Promise<T> {
  return deps.withLease ? deps.withLease(userId, fn) : fn();
}

/** A user is re-synced by the sweep when the last sync is older than this (UC-09). */
export const SWEEP_STALE_MS = 5 * 60_000;

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

export interface UserSweep {
  user_id: string;
  renewed: boolean;
  synced: SyncReport | null;
  write_back: WriteBackReport | null;
  error: string | null;
}

async function sweepUser(deps: Deps, state: GcalState, nowMs: number): Promise<UserSweep> {
  const sync = deps as SyncDeps;
  const out: UserSweep = {
    user_id: state.user_id,
    renewed: false,
    synced: null,
    write_back: null,
    error: null,
  };
  try {
    out.renewed = await ensureChannel(sync, state);
    const last = state.last_synced_at === null ? 0 : Date.parse(state.last_synced_at);
    await leased(deps, state.user_id, async () => {
      if (nowMs - last >= SWEEP_STALE_MS) out.synced = await syncUser(sync, state);
      out.write_back = await writeBack(sync, state);
    });
  } catch (err) {
    out.error = errorText(err);
    await deps.saveState(state.user_id, { last_error: out.error }).catch(() => {});
  }
  return out;
}

export async function handleGcalWebhook(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const nowMs = deps.now();

  // --- Google push notification ---------------------------------------------------------------
  const channelId = req.headers.get('x-goog-channel-id');
  if (channelId !== null) {
    if (deps.config === null) return json(503, { error: 'not_configured' });
    const state = await deps.loadStateByChannel(channelId);
    if (state === null || state.refresh_token === null) {
      return json(404, { error: 'unknown_channel' });
    }
    const token = req.headers.get('x-goog-channel-token') ?? '';
    if (state.channel_token === null || !constantTimeEqual(token, state.channel_token)) {
      return json(403, { error: 'bad_channel_token' });
    }
    const resourceState = req.headers.get('x-goog-resource-state') ?? '';
    if (resourceState === 'sync') return json(200, { ok: true, state: 'sync' });
    const sync = deps as SyncDeps;
    try {
      const { synced, wb } = await leased(deps, state.user_id, async () => ({
        synced: await syncUser(sync, state),
        wb: await writeBack(sync, state),
      }));
      return json(200, { ok: true, state: resourceState, synced, write_back: wb });
    } catch (err) {
      // never make Google retry-storm the function: record the error, answer 200
      const detail = errorText(err);
      await deps.saveState(state.user_id, { last_error: detail }).catch(() => {});
      console.error('gcal-webhook sync failed', detail);
      return json(200, { ok: false, error: 'sync_failed' });
    }
  }

  // --- pg_cron sweep ----------------------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    if (typeof raw !== 'object' || raw === null) return json(400, { error: 'bad_request' });
    body = raw as Record<string, unknown>;
  } catch {
    return json(400, { error: 'bad_request', detail: 'invalid JSON' });
  }
  if (body.mode !== 'sweep') {
    return json(400, { error: 'bad_request', detail: 'mode must be sweep (or a Google push)' });
  }
  const key = req.headers.get('x-service-key');
  if (key === null || deps.serviceKey === null || !constantTimeEqual(key, deps.serviceKey)) {
    return json(401, { error: 'unauthorized' });
  }
  if (deps.config === null) return json(200, { mode: 'sweep', skipped: 'not_configured' });
  const users = await deps.loadConnected();
  const reports: UserSweep[] = [];
  for (const state of users) reports.push(await sweepUser(deps, state, nowMs));
  return json(200, {
    mode: 'sweep',
    users: users.length,
    synced: reports.filter((r) => r.synced !== null).length,
    renewed: reports.filter((r) => r.renewed).length,
    displaced: reports.reduce((s, r) => s + (r.synced?.displaced ?? 0), 0),
    errors: reports.filter((r) => r.error !== null).length,
    reports,
  });
}
