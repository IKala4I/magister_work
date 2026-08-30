/**
 * `delete-account` — FR-42 / UC-10 erasure (ADR-0014 §8–§10). One code path, three callers:
 *   • `self`      — the signed-in user (JWT verified here), Settings → "Delete my account";
 *   • `operator`  — the privacy README §7 path: the researcher acts on a request with the
 *                   backend key and the uid (never browses rows);
 *   • `retention` — the daily pg_cron tick: anonymous accounts inactive for
 *                   ANONYMOUS_RETENTION_DAYS (service-only RPC `anonymous_purge_candidates`).
 * Per user: best-effort Google disconnect (write-back mirror out, channel stopped, token
 * revoked — `_shared/gcal_sync.ts disconnectGoogle`), a `deletion_audit` row (user_hash =
 * SHA-256 of the uid, no FK — it survives), `auth.admin.deleteUser` (the cascade through every
 * user-owned table — pgTAP `p10_privacy_test.sql`), then `completed_at`. Nothing here reads a
 * user's rows; the response carries audit references only.
 */
import { ANONYMOUS_RETENTION_DAYS } from '../_shared/params.ts';
import { disconnectGoogle, type GcalState, type SyncDeps } from '../_shared/gcal_sync.ts';

export type DeletionReason = 'user_request' | 'operator' | 'anonymous_retention';

export interface Deps {
  now(): number;
  verifyUser(token: string): Promise<string | null>;
  verifyServiceKey(key: string | null): boolean;
  /** SHA-256 hex of the uid — the audit pseudonym. */
  hashUser(userId: string): Promise<string>;
  userExists(userId: string): Promise<boolean>;
  loadGcalState(userId: string): Promise<GcalState | null>;
  /** Google sync adapters with the config; null when Google is not configured here. */
  gcalSync: SyncDeps | null;
  revokeToken(token: string): Promise<boolean>;
  /** Insert the proof-of-erasure row; returns its id. */
  insertAudit(row: { user_hash: string; reason: DeletionReason }): Promise<string>;
  /** Stamp completed_at; returns the ISO timestamp written. */
  completeAudit(id: string): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  purgeCandidates(nowIso: string, days: number, limit: number): Promise<{ user_id: string }[]>;
}

export type Mode = 'self' | 'operator' | 'retention';

export interface DeleteAccountBody {
  mode?: Mode;
  user_id?: string;
}

export type DeleteAccountResponse =
  | { status: 'deleted'; reference: string; completed_at: string }
  | { status: 'swept'; deleted: number; failed: number; references: string[] }
  | { error: 'unauthorized' | 'bad_request' | 'not_found' | 'internal'; detail?: string };

/** Anonymous accounts erased per retention tick (the tick runs daily; a backlog drains). */
export const RETENTION_BATCH = 50;

const JSON_HEADERS = { 'content-type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: DeleteAccountResponse): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

function parseBody(raw: unknown): DeleteAccountBody | string {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object') return 'body must be a JSON object';
  const b = raw as Record<string, unknown>;
  const mode = b.mode ?? 'self';
  if (mode !== 'self' && mode !== 'operator' && mode !== 'retention') {
    return 'mode must be self, operator or retention';
  }
  if (b.user_id !== undefined && (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id))) {
    return 'user_id must be a uuid';
  }
  return { mode, user_id: b.user_id as string | undefined };
}

/** The erasure of one user, audited. Google teardown is best effort; the delete is not. */
export async function eraseUser(
  deps: Deps,
  userId: string,
  reason: DeletionReason,
): Promise<{ reference: string; completed_at: string }> {
  const state = await deps.loadGcalState(userId);
  if (state !== null && deps.gcalSync !== null && state.refresh_token !== null) {
    try {
      await disconnectGoogle(deps.gcalSync, state, deps.revokeToken);
    } catch (err) {
      console.error('delete-account: google disconnect failed', err); // the cascade still drops the token row
    }
  }
  const reference = await deps.insertAudit({ user_hash: await deps.hashUser(userId), reason });
  await deps.deleteUser(userId);
  // the user is gone at this point: a failure to stamp the audit row must not turn a completed
  // erasure into a 500 that strands the device with a dead session (P10 adversarial #6); the
  // row keeps completed_at = null as the evidence to look at
  try {
    const completed_at = await deps.completeAudit(reference);
    return { reference, completed_at };
  } catch (err) {
    console.error('delete-account: completeAudit failed after the delete', reference, err);
    return { reference, completed_at: new Date(deps.now()).toISOString() };
  }
}

export async function handleDeleteAccount(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'bad_request', detail: 'POST only' });
  let raw: unknown = null;
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      return json(400, { error: 'bad_request', detail: 'invalid JSON' });
    }
  }
  const body = parseBody(raw);
  if (typeof body === 'string') return json(400, { error: 'bad_request', detail: body });
  const mode = body.mode ?? 'self';

  if (mode === 'self') {
    const token = bearer(req);
    const userId = token === null ? null : await deps.verifyUser(token);
    if (userId === null) return json(401, { error: 'unauthorized' });
    // belt to the wiring's server-side getUser: a stateless JWT can outlive its account until
    // it expires — an already-erased account gets 401, never a second audit row (FR-42)
    if (!(await deps.userExists(userId))) return json(401, { error: 'unauthorized' });
    const done = await eraseUser(deps, userId, 'user_request');
    return json(200, { status: 'deleted', ...done });
  }

  // operator + retention: the backend key, never a user token
  if (!deps.verifyServiceKey(req.headers.get('x-service-key'))) {
    return json(401, { error: 'unauthorized' });
  }
  if (mode === 'operator') {
    if (body.user_id === undefined) {
      return json(400, { error: 'bad_request', detail: 'user_id required' });
    }
    if (!(await deps.userExists(body.user_id))) return json(404, { error: 'not_found' });
    const done = await eraseUser(deps, body.user_id, 'operator');
    return json(200, { status: 'deleted', ...done });
  }

  const nowIso = new Date(deps.now()).toISOString();
  const candidates = await deps.purgeCandidates(nowIso, ANONYMOUS_RETENTION_DAYS, RETENTION_BATCH);
  const references: string[] = [];
  let failed = 0;
  for (const c of candidates) {
    try {
      const done = await eraseUser(deps, c.user_id, 'anonymous_retention');
      references.push(done.reference);
    } catch (err) {
      failed += 1;
      console.error('delete-account: retention erase failed', err); // one failure never stops the sweep
    }
  }
  return json(200, { status: 'swept', deleted: references.length, failed, references });
}
