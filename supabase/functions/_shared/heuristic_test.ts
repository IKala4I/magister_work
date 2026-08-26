/**
 * Arm A — hard constraints, matched randomization semantics, ordering, chunking, features.
 * The service's `test_planner.py` pins the same invariants for arm B.
 */
import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { BUCKET_IDS } from './contexts.ts';
import { heuristicPlan } from './heuristic.ts';
import {
  BUFFER_TICKS,
  EPSILON,
  EXPERIMENT_MIN_BUCKETS,
  HEURISTIC_MODEL_VERSION,
  TOP_M,
} from './params.ts';
import type { ServicePlanRequest, ServiceTaskIn } from './types.ts';

const KYIV = 'Europe/Kyiv';
const PLAN_DATE = '2026-08-26'; // Wednesday
const NOW = Date.parse('2026-08-26T05:00:00+03:00');
const kyiv = (h: number, m = 0): string =>
  `2026-08-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`;
const HOURS = { wed: [540, 1080] as [number, number] };

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

function request(
  tasks: ServiceTaskIn[],
  over: Partial<ServicePlanRequest> = {},
): ServicePlanRequest {
  return {
    user_id: '00000000-0000-4000-8000-000000000001',
    plan_date: PLAN_DATE,
    horizon: 'day',
    timezone: KYIV,
    working_hours: HOURS,
    sleep_window: [1380, 420],
    busy: [],
    tasks,
    previous_assignments: [],
    settings: { epsilon: EPSILON, top_m: TOP_M, policy: 'heuristic-shadow' },
    arm: 'A',
    now: null,
    ...over,
  };
}

const dayTasks = (): ServiceTaskIn[] => [
  task('deep1', { est_minutes: 90, value: 3, deadline: kyiv(17) }),
  task('admin1', { category: 'admin', est_minutes: 30, value: 1 }),
  task('learn1', { category: 'learning', est_minutes: 120, value: 2, splittable: true }),
  task('phys1', { category: 'physical', est_minutes: 45, value: 2, pinned_start: kyiv(14) }),
  task('deep2', { est_minutes: 60, value: 2, postpone_count: 2 }),
  task('admin2', { category: 'admin', est_minutes: 45, value: 1 }),
];

function checkHardConstraints(
  req: ServicePlanRequest,
  result: ReturnType<typeof heuristicPlan>,
): void {
  const spans = result.assignments
    .map((a) => ({
      s: Date.parse(a.slot_start),
      e: Date.parse(a.slot_end) + BUFFER_TICKS * 15 * 60_000,
      id: a.task_id,
    }))
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < spans.length; i++) {
    assert(
      spans[i - 1].e <= spans[i].s,
      `overlap incl. buffer: ${spans[i - 1].id} / ${spans[i].id}`,
    );
  }
  for (const a of result.assignments) {
    assert(BUCKET_IDS.includes(a.context_bucket));
    assertEquals(a.features.length, 17);
    assertEquals(a.q_hat, null);
    assertEquals(a.confidence, null);
    assert(
      ['pinned', 'experiment', 'deadline_pressure', 'earliest_feasible'].includes(a.rationale_key),
    );
    for (const b of req.busy) {
      assert(
        Date.parse(a.slot_end) <= Date.parse(b.start) ||
          Date.parse(a.slot_start) >= Date.parse(b.end),
      );
    }
    const t = req.tasks.find((x) => x.id === a.task_id) as ServiceTaskIn;
    if (t.deadline !== null) {
      assert(Date.parse(a.slot_end) <= Date.parse(t.deadline), `${a.task_id} past its deadline`);
    }
    if (t.pinned_start !== null) {
      assertEquals(a.slot_start, new Date(Date.parse(t.pinned_start)).toISOString());
    }
    // inside declared hours (09:00–18:00 local)
    const local = (ms: number) => ((ms - Date.parse('2026-08-26T00:00:00+03:00')) / 60_000);
    assert(local(Date.parse(a.slot_start)) >= 540 && local(Date.parse(a.slot_end)) <= 1080);
  }
}

Deno.test('representative day respects hard constraints; every task placed or reported', () => {
  const req = request(dayTasks(), { busy: [{ start: kyiv(10), end: kyiv(11, 30) }] });
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  checkHardConstraints(req, result);
  assertEquals(result.engine, 'heuristic');
  assertEquals(result.model_version, HEURISTIC_MODEL_VERSION);
  assertEquals(result.solver_status, 'HEURISTIC');
  const placed = new Set(result.assignments.map((a) => a.task_id));
  for (const t of req.tasks) {
    assert(placed.has(t.id) || result.unplaced.some((u) => u.task_id === t.id));
  }
  assertEquals(result.infeasible, null);
  assertEquals(result.telemetry.tick_minutes, 15);
  assertEquals(result.telemetry.n_ticks, 96);
});

Deno.test('matched randomization: exactly one labelled row, p = ε/|A_m(x)|, top-m persisted, symmetric eligibility', () => {
  let seen = 0;
  for (let seed = 0; seed < 30; seed++) {
    const req = request(dayTasks(), { busy: [{ start: kyiv(10), end: kyiv(11, 30) }] });
    const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed });
    checkHardConstraints(req, result);
    const exp = result.assignments.filter((a) => a.is_experiment);
    const rest = result.assignments.filter((a) => !a.is_experiment);
    assert(rest.every((a) => a.propensity === null && (a.experiment_top_m ?? null) === null));
    assert(exp.length <= 1);
    if (result.telemetry.experiment_drawn) {
      assertEquals(exp.length, 1);
      const a = exp[0];
      assert(a.experiment_top_m !== null && a.experiment_top_m !== undefined);
      assert(
        a.experiment_top_m.length >= EXPERIMENT_MIN_BUCKETS && a.experiment_top_m.length <= TOP_M,
      );
      assertEquals(a.propensity, EPSILON / a.experiment_top_m.length);
      assert(a.experiment_top_m.includes(a.context_bucket));
      assertEquals(a.rationale_key, 'experiment');
      assertEquals(a.chunk_index, 0);
      const t = req.tasks.find((x) => x.id === a.task_id) as ServiceTaskIn;
      assert(t.pinned_start === null && t.deadline === null && t.est_minutes <= 120); // eligibility
      assertEquals(result.experiment?.taskId, a.task_id);
      seen++;
    } else {
      assert(result.telemetry.experiment_dropped || exp.length === 0);
    }
  }
  assert(seen >= 25, `experiment drawn in ${seen}/30 plans`);
});

Deno.test('the drawn bucket follows the heuristic ranking (earliest reachable first) and the draw is uniform', () => {
  // one eligible task, 09–18 day: reachable buckets for a 30-min task = MO.wd.fresh, MD.wd, AF.wd.fresh, EV.wd
  const counts = new Map<string, number>();
  for (let seed = 0; seed < 400; seed++) {
    const result = heuristicPlan(request([task('t', { category: 'admin', est_minutes: 30 })]), {
      nowMs: NOW,
      cells: [],
      seed,
    });
    const a = result.assignments[0];
    assertEquals(a.is_experiment, true);
    assertEquals(a.propensity, 0.25);
    assertEquals(a.experiment_top_m, ['MO.wd.fresh', 'MD.wd', 'AF.wd.fresh', 'EV.wd']);
    counts.set(a.context_bucket, (counts.get(a.context_bucket) ?? 0) + 1);
  }
  assertEquals([...counts.keys()].sort(), ['AF.wd.fresh', 'EV.wd', 'MD.wd', 'MO.wd.fresh']);
  for (const c of counts.values()) assert(c > 60 && c < 140, `bucket count ${c} far from 100`);
});

Deno.test('|A_m(x)| ∈ {2, 3}: exact per-row p = ε/|A_m(x)| (owner decision, ADR-0008 §1)', () => {
  // a 2 h task on a 09–18 day can start in MO, MD or AF (a start only needs run length ≥ d + b)
  const three = heuristicPlan(request([task('t', { category: 'learning', est_minutes: 120 })]), {
    nowMs: NOW,
    cells: [],
    seed: 3,
  });
  assertEquals(three.assignments[0].is_experiment, true);
  assertEquals(three.assignments[0].experiment_top_m, ['MO.wd.fresh', 'MD.wd', 'AF.wd.fresh']);
  assertEquals(three.assignments[0].propensity, 1 / 3);
  // a 90-min task on a 09–14 day: MO and MD only
  const two = heuristicPlan(
    request([task('t', { est_minutes: 90 })], { working_hours: { wed: [540, 840] } }),
    { nowMs: NOW, cells: [], seed: 3 },
  );
  assertEquals(two.assignments[0].experiment_top_m, ['MO.wd.fresh', 'MD.wd']);
  assertEquals(two.assignments[0].propensity, 0.5);
});

Deno.test('no experiment when nothing is eligible (critical, pinned, > 2 h, single bucket)', () => {
  const req = request([
    task('crit', { deadline: kyiv(12) }),
    task('pin', { pinned_start: kyiv(15) }),
    task('long', { est_minutes: 150 }),
  ]);
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 5 });
  assertEquals(result.telemetry.experiment_drawn, false);
  assertEquals(result.telemetry.n_eligible, 0);
  assert(result.assignments.every((a) => !a.is_experiment && a.propensity === null));
  const single = heuristicPlan(
    request([task('t', { est_minutes: 60 })], { working_hours: { wed: [540, 660] } }),
    { nowMs: NOW, cells: [], seed: 5 },
  );
  assertEquals(single.telemetry.n_eligible, 0); // only MO reachable
  assertEquals(single.assignments.length, 1);
});

Deno.test('ε = 0 never experiments; same seed ⇒ same plan; different seeds may differ', () => {
  const req = request(dayTasks());
  req.settings = { ...req.settings, epsilon: 0 };
  const r0 = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 11 });
  assertEquals(r0.telemetry.experiment_drawn, false);
  assert(r0.assignments.every((a) => !a.is_experiment));
  const a = heuristicPlan(request(dayTasks()), { nowMs: NOW, cells: [], seed: 11 });
  const b = heuristicPlan(request(dayTasks()), { nowMs: NOW, cells: [], seed: 11 });
  assertEquals(a.assignments, b.assignments);
  assertEquals(a.telemetry.rng_seed, 11);
  let differs = false;
  for (let s = 0; s < 10 && !differs; s++) {
    const c = heuristicPlan(request(dayTasks()), { nowMs: NOW, cells: [], seed: s });
    if (JSON.stringify(c.assignments) !== JSON.stringify(a.assignments)) differs = true;
  }
  assert(differs);
});

Deno.test('experiment dropped when pinned occupancy blocks the drawn bucket (no row labelled)', () => {
  // 30-min task reaches MO/MD/AF/EV a priori; pins cover MD entirely (12:00–14:00) ⇒ when MD is drawn, drop
  const req = request([
    task('t', { category: 'admin', est_minutes: 30 }),
    task('pinA', { est_minutes: 60, pinned_start: kyiv(11, 45) }),
    task('pinB', { est_minutes: 60, pinned_start: kyiv(13) }),
  ]);
  let dropped = 0;
  let drawn = 0;
  for (let seed = 0; seed < 200; seed++) {
    const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed });
    const exp = result.assignments.filter((a) => a.is_experiment);
    if (result.telemetry.experiment_dropped) {
      dropped++;
      assertEquals(exp.length, 0);
      assertEquals(result.telemetry.experiment_drawn, false);
      assertEquals(result.experiment, null);
    } else {
      drawn++;
      assertEquals(exp.length, 1);
      assertNotEquals(exp[0].context_bucket, 'MD.wd');
    }
    assert(result.assignments.some((a) => a.task_id === 't')); // the task is still placed
  }
  assert(dropped > 20 && drawn > 100, `dropped ${dropped}, drawn ${drawn}`);
});

Deno.test('deadline-first: the tighter deadline is scheduled earlier; priority tiers order the rest', () => {
  const req = request([
    task('late', { deadline: kyiv(17), value: 3 }),
    task('early', { deadline: kyiv(11), value: 1 }),
    task('high', { value: 3 }),
    task('low', { value: 1 }),
  ]);
  req.settings = { ...req.settings, epsilon: 0 };
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  const start = (id: string) =>
    Date.parse(result.assignments.find((a) => a.task_id === id)?.slot_start ?? '');
  assert(start('early') < start('late'));
  assert(start('late') < start('high'));
  assert(start('high') < start('low'));
  assertEquals(
    result.assignments.find((a) => a.task_id === 'early')?.rationale_key,
    'deadline_pressure',
  );
  assertEquals(
    result.assignments.find((a) => a.task_id === 'low')?.rationale_key,
    'earliest_feasible',
  );
});

Deno.test('splittable tasks chunk (≥ d_min, ≤ 4 chunks) when no whole slot fits; else deferred', () => {
  // 09:00–12:00 with a 10:00–10:30 event: free runs 09:00–09:45 (3 ticks) and 10:45–12:00 (5 ticks)
  // ⇒ 2 + 4 work ticks around the buffers: exactly the 6 ticks of a 90-min task, in two chunks
  const req = request(
    [task('big', { est_minutes: 90, splittable: true }), task('rigid', { est_minutes: 90 })],
    { working_hours: { wed: [540, 720] }, busy: [{ start: kyiv(10), end: kyiv(10, 30) }] },
  );
  req.settings = { ...req.settings, epsilon: 0 };
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  const chunks = result.assignments.filter((a) => a.task_id === 'big').sort((a, b) =>
    a.chunk_index - b.chunk_index
  );
  assertEquals(chunks.length, 2);
  assertEquals(chunks.map((c) => c.chunk_index), [0, 1]);
  const minutes = chunks.reduce(
    (acc, c) => acc + (Date.parse(c.slot_end) - Date.parse(c.slot_start)) / 60_000,
    0,
  );
  assertEquals(minutes, 90);
  assertEquals(result.unplaced, [{ task_id: 'rigid', reason: 'no_feasible_start' }]); // no run ≥ 7 ticks a priori
  checkHardConstraints(req, result);
});

Deno.test("features are the bucket's k* snapshot (service parity), not the placed tick", () => {
  // two admin tasks land in MO.wd.fresh at different ticks; both log the SAME x (evaluated at k*)
  const req = request([
    task('a', { category: 'admin', est_minutes: 30 }),
    task('b', { category: 'admin', est_minutes: 30 }),
  ]);
  req.settings = { ...req.settings, epsilon: 0 };
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  const rows = result.assignments.filter((x) => x.context_bucket === 'MO.wd.fresh');
  assertEquals(rows.length, 2);
  assertNotEquals(rows[0].slot_start, rows[1].slot_start);
  assertEquals(rows[0].features, rows[1].features);
});

Deno.test('overlapping pins: the later pin is infeasible with an unpin option; others still placed', () => {
  const req = request([
    task('p1', { est_minutes: 60, pinned_start: kyiv(10) }),
    task('p2', { est_minutes: 60, pinned_start: kyiv(10, 30) }),
    task('x', { est_minutes: 30 }),
  ]);
  req.settings = { ...req.settings, epsilon: 0 };
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  assertEquals(result.unplaced, [{ task_id: 'p2', reason: 'infeasible' }]);
  assertEquals(result.infeasible?.options, [
    {
      kind: 'unpin',
      task_id: 'p2',
      delta_minutes: null,
      consequence: { metric: 'pinned_overlap_minutes', value: 30 },
    },
  ]);
  assertEquals(result.assignments.map((a) => a.task_id).sort(), ['p1', 'x']);
  checkHardConstraints(req, result);
});

Deno.test('unplaceable tasks: deadline in the past, pin off-grid or in a no-daypart hour', () => {
  const req = request([
    task('past', { deadline: '2026-08-25T12:00:00+03:00' }),
    task('offgrid', { pinned_start: '2026-08-27T10:00:00+03:00' }),
    task('night', { pinned_start: kyiv(3) }),
    task('ok', { est_minutes: 30 }),
  ]);
  const result = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  assertEquals(
    result.unplaced.sort((a, b) => a.task_id.localeCompare(b.task_id)),
    [
      { task_id: 'night', reason: 'no_feasible_start' },
      { task_id: 'offgrid', reason: 'no_feasible_start' },
      { task_id: 'past', reason: 'no_feasible_start' },
    ],
  );
  assertEquals(result.assignments.map((a) => a.task_id), ['ok']);
});

Deno.test('features 15–16 come from the user cells (flat prior when absent); preceding load from a-priori occupancy', () => {
  const req = request([task('t', { est_minutes: 30, category: 'admin' })], {
    busy: [{ start: kyiv(9), end: kyiv(11) }],
  });
  req.settings = { ...req.settings, epsilon: 0 };
  const flat = heuristicPlan(req, { nowMs: NOW, cells: [], seed: 1 });
  const a = flat.assignments[0];
  assertEquals(a.context_bucket, 'MO.wd.fatigued'); // 11:15 after a 2 h run
  assertEquals(a.features[8], 1);
  assertEquals(a.features[14], 0.5);
  assertEquals(a.features[16], 120 / 180); // 11:15 → 3 h window back to 08:15 holds 09:00–11:00
  const withCells = heuristicPlan(req, {
    nowMs: NOW,
    cells: [{
      category: 'admin',
      daypart: 'MO',
      dayType: 'weekday',
      alpha0: 2,
      beta0: 2,
      succ: 6,
      fail: 0,
      lastEventAtMs: null,
    }],
    seed: 1,
  });
  assertEquals(withCells.assignments[0].features[14], 0.8);
});

Deno.test('`now` inside the day removes past ticks; empty task list is a valid empty plan; week horizon spans days', () => {
  const late = heuristicPlan(request([task('t', { est_minutes: 30 })]), {
    nowMs: Date.parse('2026-08-26T16:50:00+03:00'),
    cells: [],
    seed: 1,
  });
  assert(Date.parse(late.assignments[0].slot_start) >= Date.parse(kyiv(17)));
  const empty = heuristicPlan(request([]), { nowMs: NOW, cells: [], seed: 1 });
  assertEquals(empty.assignments, []);
  assertEquals(empty.telemetry.experiment_drawn, false);
  const week = heuristicPlan(
    request(Array.from({ length: 12 }, (_, i) => task(`t${i}`, { est_minutes: 120 })), {
      plan_date: '2026-08-24',
      horizon: 'week',
      working_hours: { mon: [540, 1080], tue: [540, 1080], wed: [540, 1080] },
    }),
    { nowMs: Date.parse('2026-08-24T05:00:00+03:00'), cells: [], seed: 1 },
  );
  const days = new Set(week.assignments.map((a) => a.slot_start.slice(0, 10)));
  assert(days.size >= 2);
  assertEquals(week.assignments.length + week.unplaced.length, 12);
});
