/**
 * `plan-request` — UC-03 context assembly → /plan (learned) or the arm-A heuristic → persisted
 * recommendations with propensities, model version and feature snapshot (FR-20/21/22, M-01,
 * NFR-O1, NFR-R2). Dependency-injected so `handler_test.ts` exercises every branch without a
 * database or a network; `index.ts` wires the real Supabase clients and the service call.
 *
 * Decision points (ADR-0008): arm A never calls the service (the study's baseline is the
 * heuristic + matched randomization); arm B / no assignment calls it under the fallback budget
 * and degrades to the SAME heuristic, tagged `engine = heuristic` with an explicit fallback
 * reason (so outage days are distinguishable from arm-A days — File 06 excludes the former).
 */
import { type BetaCell } from '../_shared/energy.ts';
import { daysBetween, hasWorkingWindow, parseIsoDate, wallClock } from '../_shared/grid.ts';
import { heuristicPlan } from '../_shared/heuristic.ts';
import {
  EPSILON,
  HEURISTIC_MODEL_VERSION,
  PLAN_FALLBACK_BUDGET_MS,
  PLAN_RATE_LIMIT_PER_DAY,
  TOP_M,
} from '../_shared/params.ts';
import type {
  Arm,
  Assignment,
  EfTelemetry,
  Engine,
  Horizon,
  Infeasible,
  PlanRequestBody,
  PlanRequestResponse,
  PlanRow,
  RecommendationRow,
  ServiceBusyInterval,
  ServicePlanRequest,
  ServicePreviousAssignment,
  ServiceTaskIn,
  ServiceTelemetry,
  Unplaced,
} from '../_shared/types.ts';
import type { ServiceCall } from './service.ts';

export interface PlanContext {
  profile: {
    timezone: string;
    working_hours: { [key: string]: [number, number] };
    sleep_window: [number, number] | null;
  };
  tasks: ServiceTaskIn[];
  busy: ServiceBusyInterval[];
  previous_assignments: ServicePreviousAssignment[];
  arm: Arm | null;
  cells: BetaCell[];
  /** Every earlier plan for the same (user, date, horizon) — their `shown` rows get superseded. */
  existing_plan_ids: string[];
  /** Tasks whose est_minutes the UC-06 A2 estimator rescaled (P7; both engines, H1 symmetry). */
  duration_scaled?: number;
}

export interface PersistInput {
  userId: string;
  planDate: string;
  horizon: Horizon;
  engine: Engine;
  modelVersion: string;
  arm: Arm | null;
  solverStatus: string;
  telemetry: Record<string, unknown>;
  assignments: Assignment[];
  nowMs: number;
  /** Plans whose still-`shown` rows this plan supersedes (from the context read). */
  supersedePlanIds: string[];
}

export interface PersistResult {
  plan: PlanRow;
  recommendations: RecommendationRow[];
  expiredRecommendationIds: string[];
}

export interface Deps {
  now(): number;
  /** Verified user id for a bearer token, or null. */
  verifyUser(token: string): Promise<string | null>;
  /** null when the user has no (completed) profile. */
  loadContext(
    userId: string,
    planDate: string,
    horizon: Horizon,
    nowMs: number,
  ): Promise<PlanContext | null>;
  countPlansLast24h(userId: string, nowMs: number): Promise<number>;
  callService(body: ServicePlanRequest, budgetMs: number): Promise<ServiceCall>;
  persist(input: PersistInput): Promise<PersistResult>;
  /** Fire-and-forget after a fallback; must never throw. */
  wakeService(): void;
  /** Heuristic RNG seed (tests); random when undefined. */
  seed?: () => number;
}

const JSON_HEADERS = { 'content-type': 'application/json' };
/** Client clock skew tolerated on `now` (past ticks become workable if `now` lies) — [INFERRED]. */
const NOW_SKEW_LIMIT_MS = 24 * 3_600_000;
const PLAN_DATE_PAST_DAYS = 1;
const PLAN_DATE_FUTURE_DAYS = 7;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m === null ? null : m[1].trim();
}

function parseBody(raw: unknown): PlanRequestBody | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be a JSON object';
  const b = raw as Record<string, unknown>;
  if (typeof b.plan_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.plan_date)) {
    return 'plan_date must be YYYY-MM-DD';
  }
  try {
    parseIsoDate(b.plan_date);
  } catch {
    return 'plan_date is not a calendar date';
  }
  const horizon = b.horizon ?? 'day';
  if (horizon !== 'day' && horizon !== 'week') return 'horizon must be day or week';
  if (b.now !== undefined && (typeof b.now !== 'string' || Number.isNaN(Date.parse(b.now)))) {
    return 'now must be an ISO timestamp';
  }
  const trigger = b.trigger ?? 'manual';
  if (
    trigger !== 'first_open' && trigger !== 'new_day' && trigger !== 'manual' &&
    trigger !== 'evening_ritual'
  ) {
    return 'trigger must be first_open, new_day, manual or evening_ritual';
  }
  return { plan_date: b.plan_date, horizon, now: b.now as string | undefined, trigger };
}

function experimentTelemetry(
  assignments: Assignment[],
  nEligible: number | null,
): EfTelemetry['experiment'] {
  const a = assignments.find((x) => x.is_experiment);
  if (a === undefined || a.propensity === null) return null;
  return {
    task_id: a.task_id,
    bucket_id: a.context_bucket,
    top_m: a.experiment_top_m ?? [],
    propensity: a.propensity,
    n_eligible: nEligible, // null on the learned path: not in the service telemetry
  };
}

export async function handlePlanRequest(req: Request, deps: Deps): Promise<Response> {
  const t0 = deps.now();
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = bearer(req);
  if (token === null) return json(401, { error: 'unauthorized', detail: 'missing bearer token' });
  const userId = await deps.verifyUser(token);
  if (userId === null) return json(401, { error: 'unauthorized' });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'bad_request', detail: 'invalid JSON' });
  }
  const body = parseBody(raw);
  if (typeof body === 'string') return json(400, { error: 'bad_request', detail: body });
  const horizon: Horizon = body.horizon ?? 'day';
  const nowMs = body.now === undefined ? t0 : Date.parse(body.now);
  if (Math.abs(nowMs - t0) > NOW_SKEW_LIMIT_MS) {
    return json(400, {
      error: 'bad_request',
      detail: 'now is more than 24 h from the server clock',
    });
  }

  // ADR-0018 (hardware pass, 2026-09-03): the rate-limit count and the context reads do not
  // depend on each other — one round trip instead of two. The 429 check still runs before
  // anything is planned or persisted.
  const [recent, ctx] = await Promise.all([
    deps.countPlansLast24h(userId, t0),
    deps.loadContext(userId, body.plan_date, horizon, nowMs),
  ]);
  if (recent >= PLAN_RATE_LIMIT_PER_DAY) {
    return json(429, { error: 'rate_limited', detail: `${PLAN_RATE_LIMIT_PER_DAY} plans per day` });
  }
  if (ctx === null) {
    return json(404, { error: 'profile_not_found', detail: 'complete onboarding first' });
  }
  // plan_date must be near "today" in the profile's zone: yesterday … a week ahead
  const todayTz = wallClock(t0, ctx.profile.timezone);
  const offsetDays = daysBetween(todayTz, parseIsoDate(body.plan_date));
  if (offsetDays < -PLAN_DATE_PAST_DAYS || offsetDays > PLAN_DATE_FUTURE_DAYS) {
    return json(400, {
      error: 'bad_request',
      detail:
        `plan_date must be within ${PLAN_DATE_PAST_DAYS} day back and ${PLAN_DATE_FUTURE_DAYS} days ahead`,
    });
  }
  // ADR-0019: a plan day without a working window is answered before any engine runs — nothing
  // persisted, no recommendation rows, no budget consumed. It precedes the empty-inbox check:
  // on a non-working day the truthful reason is the day, not the inbox.
  if (
    !hasWorkingWindow({
      planDate: body.plan_date,
      horizon,
      timezone: ctx.profile.timezone,
      workingHours: ctx.profile.working_hours,
      sleepWindow: ctx.profile.sleep_window,
    })
  ) {
    return json(
      200,
      { status: 'no_working_window', plan_date: body.plan_date } satisfies PlanRequestResponse,
    );
  }
  if (ctx.tasks.length === 0) {
    return json(200, { status: 'empty_inbox' } satisfies PlanRequestResponse);
  }

  const serviceBody: ServicePlanRequest = {
    user_id: userId,
    plan_date: body.plan_date,
    horizon,
    timezone: ctx.profile.timezone,
    working_hours: ctx.profile.working_hours,
    sleep_window: ctx.profile.sleep_window,
    busy: ctx.busy,
    tasks: ctx.tasks,
    previous_assignments: ctx.previous_assignments,
    settings: { epsilon: EPSILON, top_m: TOP_M, policy: 'ts' },
    arm: ctx.arm,
    now: new Date(nowMs).toISOString(),
  };

  let engine: Engine;
  let modelVersion: string;
  let solverStatus: string;
  let assignments: Assignment[];
  let unplaced: Unplaced[];
  let infeasible: Infeasible | null;
  let serviceTelemetry: ServiceTelemetry | null = null;
  let ef: Omit<EfTelemetry, 'total_ms' | 'n_tasks' | 'cells_source'>;
  const cellsSource: EfTelemetry['cells_source'] = ctx.cells.length > 0 ? 'user' : 'fallback';

  const runHeuristic = (reason: EfTelemetry['reason'], call: ServiceCall | null) => {
    const h = heuristicPlan(serviceBody, { nowMs, cells: ctx.cells, seed: deps.seed?.() });
    engine = 'heuristic';
    modelVersion = HEURISTIC_MODEL_VERSION;
    solverStatus = h.solver_status;
    assignments = h.assignments;
    unplaced = h.unplaced;
    infeasible = h.infeasible;
    ef = {
      reason,
      service_status: call?.status ?? null,
      service_ms: call?.ms ?? null,
      budget_ms: PLAN_FALLBACK_BUDGET_MS,
      experiment: experimentTelemetry(h.assignments, h.telemetry.n_eligible),
      experiment_drawn: h.telemetry.experiment_drawn,
      experiment_dropped: h.telemetry.experiment_dropped,
      rng_seed: h.telemetry.rng_seed,
      tick_minutes: h.telemetry.tick_minutes,
      n_ticks: h.telemetry.n_ticks,
    };
  };

  if (ctx.arm === 'A') {
    runHeuristic('arm_a', null);
  } else {
    const elapsed = deps.now() - t0;
    const budget = Math.max(PLAN_FALLBACK_BUDGET_MS - elapsed, 250);
    const call = await deps.callService(serviceBody, budget);
    if (call.kind === 'ok') {
      const r = call.response;
      engine = 'learned';
      modelVersion = r.model_version;
      solverStatus = r.solver_status;
      assignments = r.assignments;
      unplaced = r.unplaced;
      infeasible = r.infeasible;
      serviceTelemetry = r.telemetry;
      ef = {
        reason: 'learned',
        service_status: call.status,
        service_ms: call.ms,
        budget_ms: PLAN_FALLBACK_BUDGET_MS,
        experiment: experimentTelemetry(r.assignments, null),
        experiment_drawn: r.telemetry.experiment_drawn,
        experiment_dropped: r.telemetry.experiment_dropped,
        rng_seed: null,
        tick_minutes: r.telemetry.tick_minutes,
        n_ticks: r.telemetry.n_ticks,
      };
    } else {
      runHeuristic(`fallback:${call.kind}` as EfTelemetry['reason'], call);
      try {
        deps.wakeService();
      } catch {
        // never let the wake-up affect the response
      }
    }
  }

  const telemetry: Record<string, unknown> = {
    ef: {
      ...ef!,
      total_ms: deps.now() - t0,
      n_tasks: ctx.tasks.length,
      cells_source: cellsSource,
    } satisfies EfTelemetry,
    service: serviceTelemetry,
    request: {
      horizon,
      trigger: body.trigger ?? 'manual',
      n_busy: ctx.busy.length,
      n_previous: ctx.previous_assignments.length,
      duration_scaled: ctx.duration_scaled ?? 0,
    },
    unplaced: unplaced!,
    infeasible: infeasible!,
  };
  const persisted = await deps.persist({
    userId,
    planDate: body.plan_date,
    horizon,
    engine: engine!,
    modelVersion: modelVersion!,
    arm: ctx.arm,
    solverStatus: solverStatus!,
    telemetry,
    assignments: assignments!,
    nowMs: t0,
    supersedePlanIds: ctx.existing_plan_ids,
  });
  (persisted.plan.telemetry as Record<string, unknown>).ef = {
    ...(persisted.plan.telemetry.ef as EfTelemetry),
    total_ms: deps.now() - t0,
  };
  const response: PlanRequestResponse = {
    status: 'planned',
    plan: persisted.plan,
    recommendations: persisted.recommendations,
    unplaced: unplaced!,
    infeasible: infeasible!,
    expired_recommendation_ids: persisted.expiredRecommendationIds,
  };
  return json(200, response);
}
