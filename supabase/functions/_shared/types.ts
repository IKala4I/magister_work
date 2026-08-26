/**
 * Wire types for the plan flow. `ServicePlanRequest`/`ServicePlanResponse` mirror the FastAPI
 * schemas (specs/07 §5; `packages/shared/src/api.ts` is the generated source of truth and
 * `types_test.ts` proves assignability at compile time). The edge function's OWN response to
 * the client (`PlanRequestResponse`) is a superset: persisted rows with their server ids, the
 * unplaced list, and the ids of superseded recommendations.
 */
import type { Category } from './energy.ts';
import type { Horizon, WorkingHours } from './grid.ts';

export type { Category, Horizon, WorkingHours };
export type Arm = 'A' | 'B';
export type Policy = 'ts' | 'linucb' | 'heuristic-shadow';
export type Engine = 'learned' | 'heuristic';
export type UnplacedReason = 'no_feasible_start' | 'deferred' | 'infeasible';

export interface ServiceTaskIn {
  id: string;
  category: Category;
  est_minutes: number;
  deadline: string | null;
  value: number;
  splittable: boolean;
  earliest_start: string | null;
  pinned_start: string | null;
  postpone_count: number;
}

export interface ServiceBusyInterval {
  start: string;
  end: string;
}

export interface ServicePreviousAssignment {
  task_id: string;
  slot_start: string;
  chunk_index: number;
}

export interface ServicePlanSettings {
  epsilon: number;
  top_m: number;
  policy: Policy;
  seed?: number | null;
}

export interface ServicePlanRequest {
  user_id: string;
  plan_date: string;
  horizon: Horizon;
  timezone: string;
  /** Per-weekday [start, end] minutes from local midnight, keys mon..sun (profiles.working_hours). */
  working_hours: { [key: string]: [number, number] };
  sleep_window: [number, number] | null;
  busy: ServiceBusyInterval[];
  tasks: ServiceTaskIn[];
  previous_assignments: ServicePreviousAssignment[];
  settings: ServicePlanSettings;
  arm: Arm | null;
  now: string | null;
}

export interface Assignment {
  task_id: string;
  chunk_index: number;
  slot_start: string;
  slot_end: string;
  context_bucket: string;
  /** null on heuristic rows — the arm-A engine has no estimate (ADR-0008 §2). */
  q_hat: number | null;
  confidence: number | null;
  rationale_key: string;
  rationale_params: Record<string, unknown>;
  is_experiment: boolean;
  propensity: number | null;
  experiment_top_m?: string[] | null;
  features: number[];
}

export interface Unplaced {
  task_id: string;
  reason: UnplacedReason;
}

export interface TradeOffOption {
  kind: 'drop' | 'shrink' | 'move_past_deadline' | 'unpin';
  task_id: string;
  delta_minutes?: number | null;
  consequence: Record<string, number | string>;
}

export interface Infeasible {
  options: TradeOffOption[];
}

export interface ServiceTelemetry {
  solve_ms: number;
  literals: number;
  degradation: 'coarse_30min' | 'day_by_day' | null;
  rng_seed: number;
  policy: Policy;
  experiment_drawn: boolean;
  experiment_dropped: boolean;
  n_ticks: number;
  tick_minutes: number;
  objective: number;
  hints: number;
  run_length_penalty: number;
  fragmentation_penalty: number;
  solves: number;
  build_ms: number;
  total_ms: number;
}

export interface ServicePlanResponse {
  engine: 'learned';
  model_version: string;
  solver_status: string;
  assignments: Array<Assignment & { q_hat: number; confidence: number }>;
  unplaced: Unplaced[];
  infeasible: Infeasible | null;
  telemetry: ServiceTelemetry;
}

/** Telemetry the EF adds beside the service's (plans.telemetry.ef). */
export interface EfTelemetry {
  /** How this plan was produced: the learned engine, the study's arm A, or an NFR-R2 fallback. */
  reason:
    | 'learned'
    | 'arm_a'
    | 'fallback:not_configured'
    | 'fallback:timeout'
    | 'fallback:network'
    | 'fallback:http'
    | 'fallback:invalid_response';
  /** HTTP status of the service reply when there was one. */
  service_status: number | null;
  service_ms: number | null;
  budget_ms: number;
  total_ms: number;
  experiment: {
    task_id: string;
    bucket_id: string;
    top_m: string[];
    propensity: number;
    /** Heuristic path only; null on the learned path (not in the service telemetry). */
    n_eligible: number | null;
  } | null;
  experiment_drawn: boolean;
  experiment_dropped: boolean;
  /** Heuristic path only. */
  rng_seed: number | null;
  tick_minutes: number;
  n_ticks: number;
  /** Feature 15–16 source: the user's cells, or the flat prior when none are instantiated. */
  cells_source: 'user' | 'fallback';
  n_tasks: number;
}

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

/** Body the mobile client sends to `plan-request`. */
export interface PlanRequestBody {
  plan_date: string;
  horizon?: Horizon;
  /** Client wall-clock instant; ticks before it are not workable (defaults to server now). */
  now?: string;
  /** UC-03 trigger label, echoed into telemetry for the NFR-P1 measurement. */
  trigger?: 'first_open' | 'new_day' | 'manual';
}

export type PlanRequestResponse =
  | {
    status: 'planned';
    plan: PlanRow;
    recommendations: RecommendationRow[];
    unplaced: Unplaced[];
    infeasible: Infeasible | null;
    expired_recommendation_ids: string[];
  }
  | { status: 'empty_inbox' };

export interface PlanRequestError {
  error: string;
  detail?: string;
}
