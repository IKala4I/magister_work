/**
 * Wire types of the `plan-request` edge function response (supabase/functions/_shared/types.ts
 * is the authoring side; the shapes are pinned there by Deno tests against the OpenAPI
 * contract). Kept hand-written on the client because the Deno source is not importable from
 * the pnpm workspace; P8's generated sync types will replace this file.
 */
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
  trigger?: 'first_open' | 'new_day' | 'manual';
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
