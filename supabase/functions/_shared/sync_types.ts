/**
 * Wire types of the P8 sync surface (ADR-0012 §1): what the mobile client sends to
 * `sync-resolve` and gets back, and the `gcal-connect` request/response. Hand-written on both
 * sides (the client mirror is `apps/mobile/src/sync/types.ts`) because no OpenAPI document
 * exists for the edge functions — `sync_types_test.ts` pins the vocabulary that the SQL
 * `sync_replay()` RPC understands, so a drift between the three fails a test, not a user.
 */

/** Client outbox op types (apps/mobile/src/db/schema.ts OP_TYPES) — the RPC's vocabulary. */
export const SYNC_OP_TYPES = [
  'event_append',
  'task_upsert',
  'task_delete',
  'recommendation_status',
  'profile_update',
] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

export interface SyncOp {
  /** Client-monotonic id (`<deviceId>-<counter>`); the idempotency key. */
  op_id: string;
  op_type: SyncOpType;
  entity_id: string | null;
  /** Row version the op was written against; null for creates and class-1 facts. */
  base_version: number | null;
  /** Server-shaped payload (snake_case, epoch-ms timestamps) — see the client DAOs. */
  payload: Record<string, unknown>;
}

/** Why the client is syncing; `poll` skips the reward pass when nothing was pushed. */
export const SYNC_REASONS = [
  'foreground',
  'write',
  'reconnect',
  'poll',
  'manual',
  'sign_in',
  'pre_plan',
] as const;
export type SyncReason = (typeof SYNC_REASONS)[number];

export interface SyncRequestBody {
  ops: SyncOp[];
  /** Max `server_seq` the client has applied (0 = never pulled). */
  cursor: number;
  reason?: SyncReason;
  device_id?: string;
  /** Client wall clock (telemetry only). */
  now?: string;
  pull_limit?: number;
}

/** Per-op outcome of `sync_replay()` (ADR-0012 §2). */
export const OP_OUTCOMES = [
  'applied',
  'duplicate',
  'conflict',
  'superseded',
  'rejected',
  'error',
] as const;
export type OpOutcome = (typeof OP_OUTCOMES)[number];

export interface OpAck {
  op_id: string;
  outcome: OpOutcome;
  detail?: string;
  /** SQLSTATE on `error`. */
  code?: string;
  /** Row version after an `applied` class-2/3 op (the client's next base_version). */
  version?: number;
  server_seq?: number;
  updated_at?: string;
  /** The server row on `conflict` (File 05 §2 "409 + server row"). */
  row?: Record<string, unknown>;
}

export const PULL_TABLES = [
  'profiles',
  'tasks',
  'plans',
  'recommendations',
  'calendar_events',
] as const;
export type PullTable = (typeof PULL_TABLES)[number];

export interface PullRow {
  server_seq: number;
  tbl: PullTable;
  /** `to_jsonb(row)` — snake_case columns, ISO timestamps. */
  row: Record<string, unknown>;
}

/** Summary of the instant reward pass that ran after the replay (attribute-rewards `UserReport`). */
export interface SyncRewards {
  facts: number;
  tuples_written: number;
  patches: number;
  delivered: number;
  delivery: string;
  duration_updates: number;
}

export interface SyncResponse {
  acks: OpAck[];
  /** null when the pass was skipped (a `poll` with nothing pushed) or the user has no profile. */
  rewards: SyncRewards | null;
  pull: PullRow[];
  /** New cursor (max server_seq seen, never below the request's). */
  cursor: number;
  has_more: boolean;
  server_now: string;
}

export interface SyncErrorBody {
  error: 'method_not_allowed' | 'unauthorized' | 'bad_request' | 'busy' | 'internal';
  detail?: string;
}

// --- gcal-connect (FR-03) ---------------------------------------------------------------------

export type GcalScope = 'read' | 'write';

export interface GcalStatus {
  connected: boolean;
  scope: GcalScope | null;
  write_back: boolean;
  calendar_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  channel_expires_at: string | null;
  connected_at: string | null;
}

export type GcalConnectBody =
  | { action: 'status' }
  | { action: 'start'; scope?: GcalScope; return_to?: string }
  /** The device that received the consent redirect activates the connection (adversarial #10). */
  | { action: 'confirm'; token: string }
  | { action: 'disconnect' }
  | { action: 'set_write_back'; enabled: boolean };

export type GcalConnectResponse =
  | { status: GcalStatus }
  | { auth_url: string; expires_at: string }
  | {
    error:
      | 'unauthorized'
      | 'bad_request'
      | 'not_configured'
      | 'not_connected'
      | 'invalid_confirm'
      | 'internal';
    detail?: string;
  };
