/**
 * `sync-resolve` — push-then-pull sync (File 05 §2; ADR-0012 §1). One round trip, three phases
 * under a per-user lease:
 *   1. replay the client's ops in order (`sync_replay()` — class 1 append-only facts, class 2
 *      base_version checks with `conflict` + server row, class 3 state-checked statuses);
 *   2. the instant reward pass (`attribute-rewards`' `processUser`, same module) — where
 *      FACTS BEAT PLANS resolves a pending displacement (ADR-0012 §9);
 *   3. pull every mirrored row with server_seq > cursor (`sync_pull()` under the user's RLS).
 * Dependency-injected so `handler_test.ts` and `scenario_test.ts` cover every branch without a
 * database; `index.ts` wires the Supabase clients.
 */
import {
  OP_OUTCOMES,
  type OpAck,
  type PullRow,
  SYNC_OP_TYPES,
  SYNC_REASONS,
  type SyncErrorBody,
  type SyncOp,
  type SyncReason,
  type SyncRequestBody,
  type SyncResponse,
  type SyncRewards,
} from '../_shared/sync_types.ts';
import type { UserReport } from '../attribute-rewards/handler.ts';

export interface Deps {
  now(): number;
  /** Verified user id for a bearer token, or null. */
  verifyUser(token: string): Promise<string | null>;
  /** Lease token, or null while another sync / the daily sweep holds the user. */
  acquireLease(userId: string): Promise<string | null>;
  releaseLease(userId: string, token: string): Promise<void>;
  replay(userId: string, ops: readonly SyncOp[]): Promise<OpAck[]>;
  /** The instant reward pass; null when the user has no completed profile. */
  rewards(userId: string): Promise<UserReport | null>;
  /** Rows with server_seq > cursor, ascending, at most `limit` (under the caller's RLS). */
  pull(token: string, cursor: number, limit: number): Promise<PullRow[]>;
}

export const MAX_OPS_PER_BATCH = 200;
export const PULL_LIMIT_DEFAULT = 500;
export const PULL_LIMIT_MAX = 1000;
export const LEASE_TTL_SECONDS = 30;
const MAX_OP_ID_LENGTH = 128;

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function error(status: number, body: SyncErrorBody): Response {
  return json(status, body);
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseOp(raw: unknown, index: number): SyncOp | string {
  if (!isRecord(raw)) return `ops[${index}] must be an object`;
  const opId = raw.op_id;
  if (typeof opId !== 'string' || opId.length === 0 || opId.length > MAX_OP_ID_LENGTH) {
    return `ops[${index}].op_id must be a non-empty string ≤ ${MAX_OP_ID_LENGTH} chars`;
  }
  const opType = raw.op_type;
  if (typeof opType !== 'string' || !(SYNC_OP_TYPES as readonly string[]).includes(opType)) {
    return `ops[${index}].op_type must be one of ${SYNC_OP_TYPES.join(', ')}`;
  }
  const entityId = raw.entity_id ?? null;
  if (entityId !== null && typeof entityId !== 'string') {
    return `ops[${index}].entity_id must be a string or null`;
  }
  const base = raw.base_version ?? null;
  if (base !== null && (!Number.isInteger(base) || (base as number) < 0)) {
    return `ops[${index}].base_version must be a non-negative integer or null`;
  }
  if (!isRecord(raw.payload)) return `ops[${index}].payload must be an object`;
  return {
    op_id: opId,
    op_type: opType as SyncOp['op_type'],
    entity_id: entityId,
    base_version: base as number | null,
    payload: raw.payload,
  };
}

export function parseBody(raw: unknown):
  | Required<Pick<SyncRequestBody, 'ops' | 'cursor'>> & {
    reason: SyncReason;
    pullLimit: number;
  }
  | string {
  if (!isRecord(raw)) return 'body must be a JSON object';
  if (!Array.isArray(raw.ops)) return 'ops must be an array';
  if (raw.ops.length > MAX_OPS_PER_BATCH) return `at most ${MAX_OPS_PER_BATCH} ops per batch`;
  const ops: SyncOp[] = [];
  for (let i = 0; i < raw.ops.length; i++) {
    const op = parseOp(raw.ops[i], i);
    if (typeof op === 'string') return op;
    ops.push(op);
  }
  const cursor = raw.cursor ?? 0;
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0) {
    return 'cursor must be a non-negative safe integer';
  }
  const reason = raw.reason ?? 'manual';
  if (typeof reason !== 'string' || !(SYNC_REASONS as readonly string[]).includes(reason)) {
    return `reason must be one of ${SYNC_REASONS.join(', ')}`;
  }
  const limitRaw = raw.pull_limit ?? PULL_LIMIT_DEFAULT;
  if (!Number.isInteger(limitRaw) || (limitRaw as number) < 1) {
    return 'pull_limit must be a positive integer';
  }
  const pullLimit = Math.min(limitRaw as number, PULL_LIMIT_MAX);
  return { ops, cursor: cursor as number, reason: reason as SyncReason, pullLimit };
}

/** The reward pass runs unless this is a bare poll (nothing pushed, nothing to attribute). */
export function shouldRunRewards(reason: SyncReason, ops: readonly SyncOp[]): boolean {
  if (reason !== 'poll') return true;
  return ops.some((o) => o.op_type === 'event_append' || o.op_type === 'recommendation_status');
}

function summarize(report: UserReport | null): SyncRewards | null {
  if (report === null) return null;
  return {
    facts: report.facts,
    tuples_written: report.tuples_written,
    patches: report.patches,
    delivered: report.delivered,
    delivery: report.delivery,
    duration_updates: report.duration_updates,
  };
}

function sanitizeAck(a: OpAck): OpAck {
  // never trust the RPC blindly on the wire: keep the vocabulary closed
  const outcome = (OP_OUTCOMES as readonly string[]).includes(a.outcome) ? a.outcome : 'error';
  return { ...a, outcome };
}

export async function handleSyncResolve(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return error(405, { error: 'method_not_allowed' });
  const token = bearer(req);
  if (token === null) return error(401, { error: 'unauthorized', detail: 'missing bearer token' });
  const userId = await deps.verifyUser(token);
  if (userId === null) return error(401, { error: 'unauthorized' });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error(400, { error: 'bad_request', detail: 'invalid JSON' });
  }
  const body = parseBody(raw);
  if (typeof body === 'string') return error(400, { error: 'bad_request', detail: body });

  const lease = await deps.acquireLease(userId);
  if (lease === null) {
    return json(409, { error: 'busy', detail: 'another sync of this user is in progress' });
  }
  try {
    const acks = body.ops.length > 0 ? (await deps.replay(userId, body.ops)).map(sanitizeAck) : [];
    const report = shouldRunRewards(body.reason, body.ops) ? await deps.rewards(userId) : null;
    const pull = await deps.pull(token, body.cursor, body.pullLimit);
    let cursor = body.cursor;
    for (const r of pull) if (r.server_seq > cursor) cursor = r.server_seq;
    const response: SyncResponse = {
      acks,
      rewards: summarize(report),
      pull,
      cursor,
      has_more: pull.length >= body.pullLimit,
      server_now: new Date(deps.now()).toISOString(),
    };
    return json(200, response);
  } finally {
    await deps.releaseLease(userId, lease);
  }
}
