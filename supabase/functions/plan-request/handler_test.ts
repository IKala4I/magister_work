/**
 * Every branch of `plan-request` with injected deps: auth, validation, rate limit, empty inbox,
 * learned path, the study's arm A, and each NFR-R2 fallback kind — plus what gets persisted
 * (engine tag, model version, propensity/top-m in telemetry, experiment symmetry).
 */
import { assert, assertEquals } from '@std/assert';
import {
  HEURISTIC_MODEL_VERSION,
  PLAN_FALLBACK_BUDGET_MS,
  PLAN_RATE_LIMIT_PER_DAY,
} from '../_shared/params.ts';
import type {
  Assignment,
  PlanRequestResponse,
  ServicePlanRequest,
  ServiceTaskIn,
} from '../_shared/types.ts';
import { type Deps, handlePlanRequest, type PersistInput, type PlanContext } from './handler.ts';
import type { ServiceCall } from './service.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const T0 = Date.parse('2026-08-26T05:00:00+03:00');
const kyiv = (h: number, m = 0): string =>
  `2026-08-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`;

function task(id: string, over: Partial<ServiceTaskIn> = {}): ServiceTaskIn {
  return {
    id,
    category: 'deep',
    est_minutes: 60,
    deadline: null,
    value: 2,
    splittable: false,
    earliest_start: null,
    pinned_start: null,
    postpone_count: 0,
    ...over,
  };
}

function context(over: Partial<PlanContext> = {}): PlanContext {
  return {
    profile: {
      timezone: 'Europe/Kyiv',
      working_hours: { wed: [540, 1080] },
      sleep_window: [1380, 420],
    },
    tasks: [
      task('a', { est_minutes: 30, category: 'admin' }),
      task('b', { est_minutes: 90, deadline: kyiv(17), value: 3 }),
      task('c', { est_minutes: 120, splittable: true }),
    ],
    busy: [{ start: kyiv(10), end: kyiv(11) }],
    previous_assignments: [],
    arm: null,
    cells: [],
    existing_plan_ids: ['00000000-0000-4000-8000-00000000aaaa'],
    ...over,
  };
}

type LearnedAssignment = Assignment & { q_hat: number; confidence: number };
const learnedAssignment = (over: Partial<LearnedAssignment> = {}): LearnedAssignment => ({
  task_id: 'a',
  chunk_index: 0,
  slot_start: '2026-08-26T06:00:00Z',
  slot_end: '2026-08-26T06:30:00Z',
  context_bucket: 'MO.wd.fresh',
  q_hat: 0.61,
  confidence: 0.7,
  rationale_key: 'best_available',
  rationale_params: { category: 'admin', daypart: 'MO' },
  is_experiment: false,
  propensity: null,
  experiment_top_m: null,
  features: new Array(17).fill(0),
  ...over,
});

const okCall = (assignments = [learnedAssignment()]): ServiceCall => ({
  kind: 'ok',
  status: 200,
  ms: 120,
  response: {
    engine: 'learned',
    model_version: 'recsys-p5.0',
    solver_status: 'OPTIMAL',
    assignments: assignments as Array<Assignment & { q_hat: number; confidence: number }>,
    unplaced: [{ task_id: 'c', reason: 'deferred' }],
    infeasible: null,
    telemetry: {
      solve_ms: 70,
      literals: 300,
      degradation: null,
      rng_seed: 5,
      policy: 'ts',
      experiment_drawn: assignments.some((a) => a.is_experiment),
      experiment_dropped: false,
      n_ticks: 96,
      tick_minutes: 15,
      objective: 1.2,
      hints: 0,
      run_length_penalty: 0,
      fragmentation_penalty: 0,
      solves: 1,
      build_ms: 10,
      total_ms: 90,
    },
  },
});

interface Harness {
  deps: Deps;
  persisted: PersistInput[];
  serviceCalls: Array<{ body: ServicePlanRequest; budgetMs: number }>;
  wakes: number;
}

function harness(
  over: Partial<Deps> & { ctx?: PlanContext | null; call?: ServiceCall; plans24h?: number } = {},
): Harness {
  const persisted: PersistInput[] = [];
  const serviceCalls: Harness['serviceCalls'] = [];
  const h: Harness = { persisted, serviceCalls, wakes: 0, deps: undefined as unknown as Deps };
  let clock = T0;
  h.deps = {
    now: () => (clock += 5),
    verifyUser: (token) => Promise.resolve(token === 'good' ? USER : null),
    loadContext: () => Promise.resolve(over.ctx === undefined ? context() : over.ctx),
    countPlansLast24h: () => Promise.resolve(over.plans24h ?? 0),
    callService: (body, budgetMs) => {
      serviceCalls.push({ body, budgetMs });
      return Promise.resolve(over.call ?? okCall());
    },
    persist: (input) => {
      persisted.push(input);
      const planId = '11111111-1111-4111-8111-111111111111';
      return Promise.resolve({
        plan: {
          id: planId,
          user_id: input.userId,
          plan_date: input.planDate,
          horizon: input.horizon,
          engine: input.engine,
          model_version: input.modelVersion,
          arm: input.arm,
          solver_status: input.solverStatus,
          telemetry: input.telemetry,
          generated_at: new Date(input.nowMs).toISOString(),
          server_seq: 10,
        },
        recommendations: input.assignments.map((a, i) => ({
          id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
          user_id: input.userId,
          plan_id: planId,
          task_id: a.task_id,
          chunk_index: a.chunk_index,
          slot_start: a.slot_start,
          slot_end: a.slot_end,
          context_bucket: a.context_bucket,
          features: a.features,
          q_hat: a.q_hat,
          confidence: a.confidence,
          rationale_key: a.rationale_key,
          rationale_params: a.rationale_params,
          is_experiment: a.is_experiment,
          engine: input.engine,
          model_version: input.modelVersion,
          status: 'shown' as const,
          attributed_at: null,
          propensity: a.propensity,
          conflict_flag: false,
          version: 1,
          created_at: new Date(input.nowMs).toISOString(),
          updated_at: new Date(input.nowMs).toISOString(),
          server_seq: 11 + i,
        })),
        expiredRecommendationIds: ['33333333-3333-4333-8333-333333333333'],
      });
    },
    wakeService: () => {
      h.wakes++;
    },
    seed: () => 7,
    ...over,
  };
  return h;
}

function post(body: unknown, token: string | null = 'good', method = 'POST'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/plan-request', {
    method,
    headers,
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });
}

Deno.test('405 / 401 / 400 / 429 / 404 before any planning happens', async () => {
  const h = harness();
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26' }, 'good', 'GET'), h.deps)).status,
    405,
  );
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26' }, null), h.deps)).status,
    401,
  );
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26' }, 'bad'), h.deps)).status,
    401,
  );
  assertEquals((await handlePlanRequest(post({ plan_date: '26.08.2026' }), h.deps)).status, 400);
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26', horizon: 'month' }), h.deps)).status,
    400,
  );
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26', now: 'yesterday' }), h.deps)).status,
    400,
  );
  assertEquals(
    (await handlePlanRequest(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { authorization: 'Bearer good' },
        body: '{',
      }),
      h.deps,
    )).status,
    400,
  );
  const limited = harness({ plans24h: PLAN_RATE_LIMIT_PER_DAY });
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26' }), limited.deps)).status,
    429,
  );
  const noProfile = harness({ ctx: null });
  assertEquals(
    (await handlePlanRequest(post({ plan_date: '2026-08-26' }), noProfile.deps)).status,
    404,
  );
  assertEquals(h.persisted.length + limited.persisted.length + noProfile.persisted.length, 0);
  assertEquals(h.serviceCalls.length, 0);
});

Deno.test('empty inbox (UC-03 A2): no service call, nothing persisted, status empty_inbox', async () => {
  const h = harness({ ctx: context({ tasks: [] }) });
  const res = await handlePlanRequest(post({ plan_date: '2026-08-26' }), h.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: 'empty_inbox' });
  assertEquals(h.serviceCalls.length, 0);
  assertEquals(h.persisted.length, 0);
});

Deno.test('learned path: context forwarded verbatim with the pinned ε/m, rows persisted as engine=learned', async () => {
  const exp = learnedAssignment({
    task_id: 'c',
    is_experiment: true,
    propensity: 1 / 3,
    experiment_top_m: ['MO.wd.fresh', 'MD.wd', 'AF.wd.fresh'],
    context_bucket: 'MD.wd',
    rationale_key: 'experiment',
  });
  const h = harness({ call: okCall([learnedAssignment(), exp]) });
  const res = await handlePlanRequest(
    post({ plan_date: '2026-08-26', trigger: 'first_open', now: kyiv(8) }),
    h.deps,
  );
  assertEquals(res.status, 200);
  const body = (await res.json()) as PlanRequestResponse;
  assert(body.status === 'planned');
  assertEquals(body.plan.engine, 'learned');
  assertEquals(body.plan.model_version, 'recsys-p5.0');
  assertEquals(body.recommendations.length, 2);
  assertEquals(body.recommendations[1].propensity, 1 / 3);
  assertEquals(body.expired_recommendation_ids, ['33333333-3333-4333-8333-333333333333']);
  assertEquals(body.unplaced, [{ task_id: 'c', reason: 'deferred' }]);
  // the request the service saw
  assertEquals(h.serviceCalls.length, 1);
  const sent = h.serviceCalls[0].body;
  assertEquals(sent.user_id, USER);
  assertEquals(sent.settings, { epsilon: 1, top_m: 4, policy: 'ts' });
  assertEquals(sent.arm, null);
  assertEquals(sent.now, new Date(Date.parse(kyiv(8))).toISOString());
  assertEquals(sent.tasks.length, 3);
  assert(
    h.serviceCalls[0].budgetMs <= PLAN_FALLBACK_BUDGET_MS &&
      h.serviceCalls[0].budgetMs > PLAN_FALLBACK_BUDGET_MS - 100,
  );
  // what was persisted
  const p = h.persisted[0];
  assertEquals(p.engine, 'learned');
  const ef = p.telemetry.ef as Record<string, unknown>;
  assertEquals(ef.reason, 'learned');
  assertEquals(ef.experiment, {
    task_id: 'c',
    bucket_id: 'MD.wd',
    top_m: ['MO.wd.fresh', 'MD.wd', 'AF.wd.fresh'],
    propensity: 1 / 3,
    n_eligible: -1,
  });
  assertEquals((p.telemetry.request as Record<string, unknown>).trigger, 'first_open');
  assertEquals((p.telemetry.service as Record<string, unknown>).solve_ms, 70);
  assertEquals(p.supersedePlanIds, ['00000000-0000-4000-8000-00000000aaaa']);
  assertEquals(h.wakes, 0);
});

Deno.test('arm A: the service is never called; heuristic rows with the matched randomization', async () => {
  const h = harness({ ctx: context({ arm: 'A' }) });
  const res = await handlePlanRequest(post({ plan_date: '2026-08-26', now: kyiv(8) }), h.deps);
  assertEquals(res.status, 200);
  const body = (await res.json()) as PlanRequestResponse;
  assert(body.status === 'planned');
  assertEquals(h.serviceCalls.length, 0);
  assertEquals(body.plan.engine, 'heuristic');
  assertEquals(body.plan.model_version, HEURISTIC_MODEL_VERSION);
  assertEquals(body.plan.arm, 'A');
  const ef = h.persisted[0].telemetry.ef as Record<string, unknown>;
  assertEquals(ef.reason, 'arm_a');
  assertEquals(ef.rng_seed, 7);
  assertEquals(ef.cells_source, 'fallback');
  const exp = body.recommendations.filter((r) => r.is_experiment);
  assertEquals(exp.length, 1);
  assert(exp[0].propensity !== null && [0.25, 1 / 3, 0.5].includes(exp[0].propensity));
  assertEquals((ef.experiment as Record<string, unknown>).task_id, exp[0].task_id);
  assert(
    body.recommendations.every((r) =>
      r.engine === 'heuristic' && r.q_hat === null && r.confidence === null &&
      r.features.length === 17
    ),
  );
  assertEquals(h.wakes, 0);
});

Deno.test('NFR-R2 fallbacks: every failure kind ⇒ heuristic plan, reason recorded, service woken', async () => {
  const kinds: ServiceCall[] = [
    { kind: 'timeout', status: null, ms: 1900 },
    { kind: 'network', status: null, ms: 12 },
    { kind: 'http', status: 503, ms: 40 },
    { kind: 'invalid_response', status: 200, ms: 40 },
    { kind: 'not_configured', status: null, ms: 0 },
  ];
  for (const call of kinds) {
    const h = harness({ call });
    const res = await handlePlanRequest(post({ plan_date: '2026-08-26', now: kyiv(8) }), h.deps);
    assertEquals(res.status, 200);
    const body = (await res.json()) as PlanRequestResponse;
    assert(body.status === 'planned');
    assertEquals(body.plan.engine, 'heuristic');
    assertEquals(body.plan.arm, null);
    const ef = h.persisted[0].telemetry.ef as Record<string, unknown>;
    assertEquals(ef.reason, `fallback:${call.kind}`);
    assertEquals(ef.service_status, call.status);
    assertEquals(ef.service_ms, call.ms);
    assertEquals(h.persisted[0].telemetry.service, null);
    assertEquals(h.wakes, 1);
    assertEquals(h.serviceCalls.length, 1);
  }
});

Deno.test('the fallback budget shrinks by the time already spent; a wake-up failure never fails the request', async () => {
  let clock = T0;
  const h = harness({
    now: () => (clock += 400), // each clock read costs 400 ms ⇒ ~1.2 s elapsed before the call
    wakeService: () => {
      throw new Error('boom');
    },
    call: { kind: 'timeout', status: null, ms: 500 },
  });
  const res = await handlePlanRequest(post({ plan_date: '2026-08-26', now: kyiv(8) }), h.deps);
  assertEquals(res.status, 200);
  assert(h.serviceCalls[0].budgetMs < PLAN_FALLBACK_BUDGET_MS - 300);
  assert(h.serviceCalls[0].budgetMs >= 250);
});
