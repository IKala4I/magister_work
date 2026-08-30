/**
 * Wire types of the edge functions the client calls (`plan-request`, `sync-resolve`,
 * `gcal-connect`). Hand-written mirrors of `supabase/functions/_shared/{types,sync_types}.ts`
 * — the Deno tree is not importable from the pnpm workspace and no OpenAPI document exists for
 * the functions; the Deno test `_shared/sync_types_test.ts` pins the sync vocabulary against
 * `src/db/schema.ts` OP_TYPES and the SQL RPC, so a drift fails CI.
 */

// --- plan-request --------------------------------------------------------------------------------

export type Engine = 'learned' | 'heuristic';
export type Horizon = 'day' | 'week';
export type Arm = 'A' | 'B';

export interface PlanRow {
  id: string;
  user_id: string;
  plan_date: string;
  horizon: Horizon;
  engine: Engine;
  model_version: string;
  arm: Arm | null;
  solver_status: string;
  telemetry: Record<string, unknown>;
  generated_at: string;
  server_seq: number | null;
}

export interface RecommendationRow {
  id: string;
  user_id: string;
  plan_id: string;
  task_id: string;
  chunk_index: number;
  slot_start: string;
  slot_end: string;
  context_bucket: string;
  features: number[];
  q_hat: number | null;
  confidence: number | null;
  rationale_key: string;
  rationale_params: Record<string, unknown>;
  is_experiment: boolean;
  engine: Engine;
  model_version: string;
  status: 'shown';
  attributed_at: null;
  propensity: number | null;
  conflict_flag: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  server_seq: number | null;
}

export interface Unplaced {
  task_id: string;
  reason: 'no_feasible_start' | 'deferred' | 'infeasible';
}

export interface PlanRequestBody {
  plan_date: string;
  horizon?: Horizon;
  now?: string;
  trigger?: 'first_open' | 'new_day' | 'manual' | 'evening_ritual';
}

export type PlanRequestResponse =
  | {
      status: 'planned';
      plan: PlanRow;
      recommendations: RecommendationRow[];
      unplaced: Unplaced[];
      infeasible: { options: unknown[] } | null;
      expired_recommendation_ids: string[];
    }
  | { status: 'empty_inbox' };

// --- sync-resolve (ADR-0012 §1) -------------------------------------------------------------------

export type SyncOpType =
  'event_append' | 'task_upsert' | 'task_delete' | 'recommendation_status' | 'profile_update';

export interface SyncOp {
  op_id: string;
  op_type: SyncOpType;
  entity_id: string | null;
  base_version: number | null;
  payload: Record<string, unknown>;
}

export type SyncReason =
  'foreground' | 'write' | 'reconnect' | 'poll' | 'manual' | 'sign_in' | 'pre_plan';

export interface SyncRequestBody {
  ops: SyncOp[];
  cursor: number;
  reason?: SyncReason;
  device_id?: string;
  now?: string;
  pull_limit?: number;
}

export type OpOutcome = 'applied' | 'duplicate' | 'conflict' | 'superseded' | 'rejected' | 'error';

export interface OpAck {
  op_id: string;
  outcome: OpOutcome;
  detail?: string;
  code?: string;
  version?: number;
  server_seq?: number;
  updated_at?: string;
  row?: Record<string, unknown>;
}

export type PullTable = 'profiles' | 'tasks' | 'plans' | 'recommendations' | 'calendar_events';

export interface PullRow {
  server_seq: number;
  tbl: PullTable;
  row: Record<string, unknown>;
}

export interface SyncRewards {
  facts: number;
  tuples_written: number;
  patches: number;
  delivered: number;
  delivery: string;
  duration_updates: number;
  /** P9: belief labels delivered to the service in this pass (absent from older deployments). */
  labels_delivered?: number;
}

export interface SyncResponse {
  acks: OpAck[];
  rewards: SyncRewards | null;
  pull: PullRow[];
  cursor: number;
  has_more: boolean;
  server_now: string;
}

// --- gcal-connect (FR-03) -------------------------------------------------------------------------

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
  | { action: 'start'; scope?: GcalScope }
  /** The device that received the consent redirect activates the connection (ADR-0012 §10). */
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
