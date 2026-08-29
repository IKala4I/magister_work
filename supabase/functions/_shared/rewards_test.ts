/**
 * specs/07 §3.4.1 rows 1–9 as executable statements, §3.4.2 timing/correction rules, H3 (excluded
 * ≠ lapse ≠ displacement), idempotency of the mapping, and the UC-06 A2 estimator.
 */
import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
  correction,
  dailyOutcome,
  effectiveEstMinutes,
  type Fact,
  instantOutcome,
  mapUser,
  type RewardRec,
  type StoredTuple,
  updateDurationEstimate,
} from './rewards.ts';
import { REWARD_OFF_SLOT, REWARD_OVERRIDE_IN, REWARD_OVERRIDE_OUT } from './params.ts';

const REC = '00000000-0000-4000-8000-00000000d001';
const TASK = '00000000-0000-4000-8000-00000000e001';
const SLOT_START = '2026-09-01T14:00:00+03:00';
const SLOT_END = '2026-09-01T15:30:00+03:00';
const NOW = '2026-09-01T23:55:00+03:00';
const FEATURES = [1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.6, 0, 0, 0, 0.5, 0.2, 0];

function rec(over: Partial<RewardRec> = {}): RewardRec {
  return {
    id: REC,
    task_id: TASK,
    category: 'deep',
    slot_start: SLOT_START,
    slot_end: SLOT_END,
    context_bucket: 'AF.wd.fresh',
    features: FEATURES,
    status: 'shown',
    conflict_flag: false,
    local_day: '2026-09-01',
    attributed_at: null,
    ...over,
  };
}

function fact(type: string, payload: Record<string, unknown>, over: Partial<Fact> = {}): Fact {
  return {
    type,
    task_id: TASK,
    recommendation_id: REC,
    payload,
    client_ts: (payload.ended_at ?? payload.done_at ?? payload.at ?? SLOT_END) as string,
    local_day: '2026-09-01',
    ...over,
  };
}

const session = (
  startedAt: string,
  outcome: 'finished' | 'abandoned',
  focusedMinutes: number,
  planned = 90,
) =>
  fact('focus_end', {
    outcome,
    started_at: startedAt,
    ended_at: SLOT_END,
    focused_ms: focusedMinutes * 60_000,
    planned_minutes: planned,
    est_minutes: 90,
    session_id: 's1',
  });

Deno.test('row 1 — focus finished in-window → 1.0 completed, instant', () => {
  const r = instantOutcome(rec(), [session('2026-09-01T14:10:00+03:00', 'finished', 80)], NOW);
  assert(r !== null);
  assertEquals(r.tuple.reward, 1.0);
  assertEquals(r.tuple.reason, 'completed');
  assertEquals(r.tuple.kind, 'outcome');
  assertEquals(r.tuple.excluded, false);
  assertEquals(r.patch.status, 'completed');
});

Deno.test('row 1 — task marked done inside the slot (no session) → 1.0 completed', () => {
  const r = instantOutcome(rec(), [
    fact('task_completed', { done_at: '2026-09-01T15:00:00+03:00', source: 'block' }),
  ], NOW);
  assert(r !== null);
  assertEquals([r.tuple.reward, r.tuple.reason], [1.0, 'completed']);
});

Deno.test('row 2 — abandoned in-window with f ≥ 0.5 → 1.0 completed', () => {
  const r = instantOutcome(rec(), [session('2026-09-01T13:50:00+03:00', 'abandoned', 45)], NOW);
  assert(r !== null);
  assertEquals([r.tuple.reward, r.tuple.reason], [1.0, 'completed']);
});

Deno.test('row 3 — abandoned in-window with f < 0.5 → r = f partial once the slot cannot be resumed; block not completed', () => {
  // while the slot (+ grace) is still open nothing instant is emitted — a restart can reach row 1/2
  const early = instantOutcome(
    rec(),
    [session('2026-09-01T14:14:59+03:00', 'abandoned', 27)],
    '2026-09-01T15:00:00+03:00',
  );
  assertStrictEquals(early, null);
  const r = instantOutcome(rec(), [session('2026-09-01T14:14:59+03:00', 'abandoned', 27)], NOW);
  assert(r !== null);
  assertEquals(r.tuple.reason, 'partial');
  assertEquals(r.tuple.reward, 0.3);
  assertEquals(r.patch.status, undefined);
  assertEquals(r.patch.attributed_at, NOW);
});

Deno.test('row 3 — two short in-window sessions add up (Σ focused / planned)', () => {
  const r = instantOutcome(rec(), [
    session('2026-09-01T14:05:00+03:00', 'abandoned', 18),
    session('2026-09-01T14:12:00+03:00', 'abandoned', 18),
  ], NOW);
  assert(r !== null);
  assertEquals(r.tuple.reward, 0.4);
});

Deno.test('±15 min grace — a session started 15:01 after slot start is NOT in-window', () => {
  const late = instantOutcome(rec(), [session('2026-09-01T14:15:01+03:00', 'finished', 80)], NOW);
  assertStrictEquals(late, null); // nothing instant; the daily job decides (row 4)
  const early = instantOutcome(rec(), [session('2026-09-01T13:45:00+03:00', 'finished', 80)], NOW);
  assert(early !== null);
});

Deno.test('row 4 — same-day completion out of window → 0.3 off_slot, DAILY only', () => {
  const facts = [fact('task_completed', { done_at: '2026-09-01T19:00:00+03:00', source: 'inbox' }, {
    recommendation_id: null,
  })];
  assertStrictEquals(instantOutcome(rec(), facts, NOW), null);
  const d = dailyOutcome(rec(), facts, NOW);
  assertEquals([d.tuple.reward, d.tuple.reason], [REWARD_OFF_SLOT, 'off_slot']);
  assertEquals(d.patch.status, 'completed');
  assertEquals(d.tuple.source, 'daily');
});

Deno.test('row 4 — a finished session started late counts as an off-slot completion', () => {
  const d = dailyOutcome(rec(), [session('2026-09-01T16:00:00+03:00', 'finished', 80)], NOW);
  assertEquals(d.tuple.reason, 'off_slot');
});

Deno.test('row 5 — nothing happened → 0.0 lapsed (a real update, H3), status lapsed', () => {
  const d = dailyOutcome(rec(), [], NOW);
  assertEquals([d.tuple.reward, d.tuple.reason, d.tuple.excluded], [0.0, 'lapsed', false]);
  assertEquals(d.patch.status, 'lapsed');
});

Deno.test("a completion on ANOTHER local day is not this block's outcome → lapsed", () => {
  const d = dailyOutcome(rec(), [
    fact('task_completed', { done_at: '2026-09-02T10:00:00+03:00', source: 'inbox' }, {
      recommendation_id: null,
      local_day: '2026-09-02',
    }),
  ], NOW);
  assertEquals(d.tuple.reason, 'lapsed');
});

Deno.test('row 6 — explicit skip → 0.0 skipped, instant, status rejected', () => {
  const r = instantOutcome(
    rec(),
    [fact('block_skipped', { at: '2026-09-01T14:02:00+03:00' })],
    NOW,
  );
  assert(r !== null);
  assertEquals([r.tuple.reward, r.tuple.reason], [0.0, 'skipped']);
  assertEquals(r.patch.status, 'rejected');
});

Deno.test('facts beat plans — skipped, then done in-window → completed', () => {
  const r = instantOutcome(rec(), [
    fact('block_skipped', { at: '2026-09-01T14:02:00+03:00' }),
    session('2026-09-01T14:10:00+03:00', 'finished', 80),
  ], NOW);
  assert(r !== null);
  assertEquals(r.tuple.reason, 'completed');
});

Deno.test('rows 8–9 — override pair: origin 0.1 with the stored features, target 0.7 with the target features', () => {
  const target = {
    to_start: '2026-09-01T18:00:00+03:00',
    to_end: '2026-09-01T19:30:00+03:00',
    context_bucket: 'EV.wd',
    features: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.6, 0, 0, 0, 0.55, 0.19, 0.1],
    local_day: '2026-09-01',
  };
  const out = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [fact('block_moved', {
      from_start: SLOT_START,
      from_end: SLOT_END,
      to_start: target.to_start,
      to_end: target.to_end,
      distance_minutes: 240,
    })],
    stored: [],
    nowIso: NOW,
    targets: new Map([[REC, target]]),
  });
  assertEquals(out.tuples.length, 2);
  const [o, i] = out.tuples;
  assertEquals([o.kind, o.reward, o.reason], ['override_out', REWARD_OVERRIDE_OUT, 'override_out']);
  assertEquals(o.features, FEATURES);
  assertEquals([i.kind, i.reward, i.reason], ['override_in', REWARD_OVERRIDE_IN, 'override_in']);
  assertEquals(i.features, target.features);
  assertEquals(out.patches[0], {
    id: REC,
    status: 'moved',
    slot_start: target.to_start,
    slot_end: target.to_end,
    context_bucket: 'EV.wd',
    features: target.features,
  });
});

Deno.test('one override pair per placement — a second move re-places the row without a second pair', () => {
  const stored: StoredTuple[] = [
    {
      recommendation_id: REC,
      kind: 'override_out',
      reward: 0.1,
      reason: 'override_out',
      excluded: false,
      attributed_at: NOW,
      corrected_at: null,
    },
  ];
  const out = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'moved' })],
    facts: [
      fact('block_moved', { to_start: SLOT_START, to_end: SLOT_END }, {
        client_ts: '2026-09-01T09:00:00+03:00',
      }),
      fact('block_moved', {
        to_start: '2026-09-01T18:00:00+03:00',
        to_end: '2026-09-01T19:30:00+03:00',
      }, { client_ts: '2026-09-01T10:00:00+03:00' }),
    ],
    stored,
    nowIso: NOW,
    targets: new Map([[REC, {
      to_start: '2026-09-01T18:00:00+03:00',
      to_end: '2026-09-01T19:30:00+03:00',
      context_bucket: 'EV.wd',
      features: FEATURES,
      local_day: '2026-09-01',
    }]]),
  });
  assertEquals(out.tuples, []);
  assertEquals(out.patches.length, 1);
  assertEquals(out.patches[0].status, 'moved');
  assertEquals(out.patches[0].slot_start, '2026-09-01T15:00:00.000Z');
  assertEquals(out.patches[0].context_bucket, 'EV.wd');
});

Deno.test('row 10 / H3 — displaced and expired rows never produce a tuple, even with facts', () => {
  for (const status of ['displaced', 'expired']) {
    const out = mapUser({
      mode: 'daily',
      recs: [rec({ status })],
      facts: [session('2026-09-01T14:00:00+03:00', 'finished', 90)],
      stored: [],
      nowIso: NOW,
      targets: new Map(),
    });
    assertEquals(out.tuples, [], status);
  }
  // P8: a PENDING displacement with completion evidence is the ambiguous case — a tuple exists
  // for audit but is excluded from updates (File 05 §2; ADR-0012 §9)
  const pending = mapUser({
    mode: 'daily',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [session('2026-09-01T14:00:00+03:00', 'finished', 90)],
    stored: [],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(pending.tuples.length, 1);
  assertEquals(pending.tuples[0].excluded, true);
});

Deno.test('M-02 conflict_flag — the outcome is written EXCLUDED with its value for audit', () => {
  const r = instantOutcome(rec({ conflict_flag: true }), [
    session('2026-09-01T14:00:00+03:00', 'finished', 90),
  ], NOW);
  assert(r !== null);
  assertEquals(r.tuple.excluded, true);
  assertEquals(r.tuple.excluded_reason, 'concurrent_external_conflict');
  assertEquals(r.tuple.reward, 1.0);
});

Deno.test('idempotent — a stored outcome is never re-emitted on a re-run', () => {
  const stored: StoredTuple[] = [{
    recommendation_id: REC,
    kind: 'outcome',
    reward: 0,
    reason: 'lapsed',
    excluded: false,
    attributed_at: NOW,
    corrected_at: null,
  }];
  const out = mapUser({
    mode: 'daily',
    recs: [rec()],
    facts: [],
    stored,
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(out.tuples, []);
  assertEquals(out.patches, []);
});

Deno.test('UC-04 A1 — correction inside the window replaces the lapsed tuple (r = 1.0, correction = true, original attributed_at kept)', () => {
  const stored: StoredTuple = {
    recommendation_id: REC,
    kind: 'outcome',
    reward: 0,
    reason: 'lapsed',
    excluded: false,
    attributed_at: '2026-09-01T20:55:00Z',
    corrected_at: null,
  };
  const c = correction(rec({ status: 'lapsed' }), stored, '2026-09-03T18:00:00Z');
  assert(c !== null);
  assertEquals(c.tuple.reward, 1.0);
  assertEquals(c.tuple.reason, 'completed');
  assertEquals(c.tuple.correction, true);
  assertEquals(c.tuple.source, 'correction');
  assertEquals(c.tuple.attributed_at, '2026-09-01T20:55:00Z');
  assertEquals(c.patch.status, 'completed');
});

Deno.test('UC-04 A1 — after the 7-day window the tuple is frozen (null)', () => {
  const stored: StoredTuple = {
    recommendation_id: REC,
    kind: 'outcome',
    reward: 0,
    reason: 'lapsed',
    excluded: false,
    attributed_at: '2026-09-01T20:55:00Z',
    corrected_at: null,
  };
  assertStrictEquals(correction(rec(), stored, '2026-09-08T20:55:01Z'), null);
  assert(correction(rec(), stored, '2026-09-08T20:54:59Z') !== null);
});

Deno.test('UC-04 A1 — an excluded or non-lapsed stored tuple is never corrected; no stored tuple → instant completion', () => {
  const base: StoredTuple = {
    recommendation_id: REC,
    kind: 'outcome',
    reward: 0,
    reason: 'lapsed',
    excluded: true,
    attributed_at: NOW,
    corrected_at: null,
  };
  assertStrictEquals(correction(rec(), base, NOW), null);
  assertStrictEquals(correction(rec(), { ...base, excluded: false, reason: 'skipped' }, NOW), null);
  const fresh = correction(rec(), undefined, NOW);
  assert(fresh !== null);
  assertEquals([fresh.tuple.reward, fresh.tuple.correction, fresh.tuple.source], [
    1,
    false,
    'instant',
  ]);
});

Deno.test('mapUser — a lapse_corrected fact routes to correction and suppresses the daily lapse', () => {
  const out = mapUser({
    mode: 'daily',
    recs: [rec()],
    facts: [fact('lapse_corrected', { at: '2026-09-01T22:00:00+03:00' })],
    stored: [],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(out.tuples.length, 1);
  assertEquals(out.tuples[0].reason, 'completed');
  // and an already-corrected tuple is left alone on the next run
  const again = mapUser({
    mode: 'daily',
    recs: [rec()],
    facts: [fact('lapse_corrected', { at: '2026-09-01T22:00:00+03:00' })],
    stored: [{
      recommendation_id: REC,
      kind: 'outcome',
      reward: 1,
      reason: 'completed',
      excluded: false,
      attributed_at: NOW,
      corrected_at: NOW,
    }],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(again.tuples, []);
});

Deno.test('ratings and lapse_observed are never rewards', () => {
  const out = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [
      fact('session_rated', { energy: 3, session_id: 's1' }),
      fact('lapse_observed', { observed_at: '2026-09-01T17:30:00+03:00' }),
    ],
    stored: [],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(out.tuples, []);
});

Deno.test('UC-06 A2 — EWMA α = 0.3, first sample seeds, samples clipped, applied only from n ≥ 3 within [0.5, 2]', () => {
  const e1 = updateDurationEstimate(null, 60, 40); // 1.5
  assertEquals(e1, { ewma_ratio: 1.5, n: 1 });
  const e2 = updateDurationEstimate(e1, 40, 40); // 0.7·1.5 + 0.3·1 = 1.35
  assertEquals(Math.round(e2.ewma_ratio * 1e6) / 1e6, 1.35);
  assertEquals(effectiveEstMinutes(60, e2), 60); // n = 2: the user's number stands
  const e3 = updateDurationEstimate(e2, 400, 40); // ratio 10 clipped to 4 → 0.945 + 1.2 = 2.145
  assertEquals(e3.n, 3);
  assertEquals(effectiveEstMinutes(60, e3), 120); // multiplier clipped to 2.0
  assertEquals(effectiveEstMinutes(60, { ewma_ratio: 0.1, n: 5 }), 30); // clipped to 0.5
  assertEquals(effectiveEstMinutes(60, null), 60);
  assertEquals(updateDurationEstimate(e3, 0, 40), e3); // an empty session teaches nothing
});

// --- adversarial-pass additions (2026-08-27) -----------------------------------------------------

const lapsedStored = (over: Partial<StoredTuple> = {}): StoredTuple => ({
  recommendation_id: REC,
  kind: 'outcome',
  reward: 0,
  reason: 'lapsed',
  excluded: false,
  attributed_at: '2026-09-01T20:55:00Z',
  corrected_at: null,
  source: 'daily',
  ...over,
});

Deno.test('#1 — facts that sync AFTER the daily job upgrade the stored lapse (correction, original attributed_at)', () => {
  const out = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'lapsed', attributed_at: '2026-09-01T20:55:00Z' })],
    facts: [session('2026-09-01T14:05:00+03:00', 'finished', 80)],
    stored: [lapsedStored()],
    nowIso: '2026-09-02T08:00:00+03:00',
    targets: new Map(),
  });
  assertEquals(out.tuples.length, 1);
  const t = out.tuples[0];
  assertEquals([t.reward, t.reason, t.correction, t.source], [1, 'completed', true, 'correction']);
  assertEquals(t.attributed_at, '2026-09-01T20:55:00Z');
  assertEquals(out.patches[0], { id: REC, status: 'completed' });
  // a late skip does not "upgrade" a lapse (0.0 is not better than 0.0)
  const same = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'lapsed' })],
    facts: [fact('block_skipped', { at: '2026-09-01T14:02:00+03:00' })],
    stored: [lapsedStored()],
    nowIso: '2026-09-02T08:00:00+03:00',
    targets: new Map(),
  });
  assertEquals(same.tuples, []);
  // and never outside the window, never on an excluded or corrected row
  for (
    const [stored, now] of [
      [lapsedStored(), '2026-09-09T08:00:00+03:00'],
      [lapsedStored({ excluded: true }), '2026-09-02T08:00:00+03:00'],
      [lapsedStored({ corrected_at: '2026-09-02T00:00:00Z' }), '2026-09-02T08:00:00+03:00'],
    ] as const
  ) {
    const o = mapUser({
      mode: 'instant',
      recs: [rec({ status: 'lapsed' })],
      facts: [session('2026-09-01T14:05:00+03:00', 'finished', 80)],
      stored: [stored],
      nowIso: now,
      targets: new Map(),
    });
    assertEquals(o.tuples, []);
  }
});

Deno.test('#2 — a stored partial is upgraded by a later in-window finish; the daily off-slot by a late in-window session', () => {
  const partial = lapsedStored({ reward: 0.3, reason: 'partial', source: 'instant' });
  const out = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [
      session('2026-09-01T14:05:00+03:00', 'abandoned', 27),
      session('2026-09-01T14:10:00+03:00', 'finished', 60),
    ],
    stored: [partial],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals([out.tuples[0].reason, out.tuples[0].correction], ['completed', true]);
  const offSlot = lapsedStored({ reward: 0.3, reason: 'off_slot' });
  const up = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'completed' })],
    facts: [session('2026-09-01T14:00:00+03:00', 'finished', 90)],
    stored: [offSlot],
    nowIso: '2026-09-02T08:00:00+03:00',
    targets: new Map(),
  });
  assertEquals([up.tuples[0].reward, up.tuples[0].reason], [1, 'completed']);
});

Deno.test('#3 — a move and a session at the NEW slot in one batch score completed on the target context', () => {
  const target = {
    to_start: '2026-09-01T16:00:00+03:00',
    to_end: '2026-09-01T17:30:00+03:00',
    context_bucket: 'AF.wd.fatigued',
    features: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0.5, 0.6, 0, 0, 0, 0.5, 0.2, 0.9],
    local_day: '2026-09-01',
  };
  const out = mapUser({
    mode: 'daily',
    recs: [rec()],
    facts: [
      fact('block_moved', { to_start: target.to_start, to_end: target.to_end }, {
        client_ts: '2026-09-01T13:00:00+03:00',
      }),
      session('2026-09-01T16:02:00+03:00', 'finished', 85),
    ],
    stored: [],
    nowIso: NOW,
    targets: new Map([[REC, target]]),
  });
  const outcome = out.tuples.find((t) => t.kind === 'outcome')!;
  assertEquals([outcome.reward, outcome.reason], [1, 'completed']);
  assertEquals(outcome.features, target.features);
  assertEquals(out.tuples.length, 3); // pair + outcome
});

Deno.test('#4 — a target without a bucket still moves the row (no pair, old features kept)', () => {
  const out = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [fact('block_moved', {
      to_start: '2026-09-01T03:00:00+03:00',
      to_end: '2026-09-01T04:30:00+03:00',
    })],
    stored: [],
    nowIso: NOW,
    targets: new Map([[REC, null]]),
  });
  assertEquals(out.tuples, []);
  assertEquals(out.patches, [{
    id: REC,
    status: 'moved',
    slot_start: '2026-09-01T00:00:00.000Z',
    slot_end: '2026-09-01T01:30:00.000Z',
  }]);
});

Deno.test('#11 — a fact logged under another device zone makes the outcome ambiguous (excluded, value kept)', () => {
  const out = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [session('2026-09-01T14:05:00+03:00', 'finished', 80)].map((f) => ({
      ...f,
      context: { tz: 'America/New_York' },
    })),
    stored: [],
    nowIso: NOW,
    targets: new Map(),
    timezone: 'Europe/Kyiv',
  });
  assertEquals(out.tuples[0].excluded, true);
  assertEquals(out.tuples[0].excluded_reason, 'timezone_mismatch');
  assertEquals(out.tuples[0].reward, 1);
  const fine = mapUser({
    mode: 'instant',
    recs: [rec()],
    facts: [session('2026-09-01T14:05:00+03:00', 'finished', 80)].map((f) => ({
      ...f,
      context: { tz: 'Europe/Kyiv' },
    })),
    stored: [],
    nowIso: NOW,
    targets: new Map(),
    timezone: 'Europe/Kyiv',
  });
  assertEquals(fine.tuples[0].excluded, false);
});

// --- P8: pending displacement resolution (File 05 §2; ADR-0012 §9) ---------------------------

Deno.test('P8 displaced_pending — completion evidence → completed + conflict_flag, tuple EXCLUDED (H3 ambiguous)', () => {
  const r = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [session('2026-09-01T14:00:00+03:00', 'finished', 55)],
    stored: [],
    nowIso: '2026-09-01T16:10:00+03:00',
    targets: new Map(),
  });
  assertEquals(r.tuples.length, 1);
  assertEquals(r.tuples[0].reason, 'completed');
  assertEquals(r.tuples[0].reward, 1.0);
  assertEquals(r.tuples[0].excluded, true);
  assertEquals(r.tuples[0].excluded_reason, 'concurrent_external_conflict');
  assertEquals(r.patches, [
    {
      id: REC,
      status: 'completed',
      conflict_flag: true,
      attributed_at: '2026-09-01T16:10:00+03:00',
    },
  ]);
});

Deno.test('P8 displaced_pending — no evidence after the slot → displaced, NO tuple (H3 no row)', () => {
  const r = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [],
    stored: [],
    nowIso: '2026-09-01T16:10:00+03:00',
    targets: new Map(),
  });
  assertEquals(r.tuples, []);
  assertEquals(r.patches, [
    { id: REC, status: 'displaced', attributed_at: '2026-09-01T16:10:00+03:00' },
  ]);
});

Deno.test('P8 displaced_pending — before the slot can no longer be resumed it stays pending (instant); daily mode finalises', () => {
  const early = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [],
    stored: [],
    nowIso: '2026-09-01T15:40:00+03:00', // slot_end 15:30 + 15 min grace = 15:45
    targets: new Map(),
  });
  assertEquals(early.tuples, []);
  assertEquals(early.patches, []);
  const daily = mapUser({
    mode: 'daily',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [],
    stored: [],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(daily.tuples, []);
  assertEquals(daily.patches, [{ id: REC, status: 'displaced', attributed_at: NOW }]);
});

Deno.test('P8 displaced_pending — a move on a void placement is ignored; an already-resolved row is skipped', () => {
  const moved = mapUser({
    mode: 'instant',
    recs: [rec({ status: 'displaced_pending' })],
    facts: [
      fact('block_moved', {
        from_start: SLOT_START,
        from_end: SLOT_END,
        to_start: '2026-09-02T10:00:00+03:00',
        to_end: '2026-09-02T11:30:00+03:00',
        at: '2026-09-01T13:00:00+03:00',
      }),
    ],
    stored: [],
    nowIso: '2026-09-01T16:10:00+03:00',
    targets: new Map(),
  });
  assertEquals(moved.tuples, []);
  assertEquals(moved.patches, [
    { id: REC, status: 'displaced', attributed_at: '2026-09-01T16:10:00+03:00' },
  ]);
  const stored: StoredTuple = {
    recommendation_id: REC,
    kind: 'outcome',
    reward: 1.0,
    reason: 'completed',
    excluded: true,
    attributed_at: '2026-09-01T16:10:00+03:00',
    corrected_at: null,
  };
  const resolved = mapUser({
    mode: 'daily',
    recs: [rec({ status: 'displaced_pending', conflict_flag: true })],
    facts: [session('2026-09-01T14:00:00+03:00', 'finished', 55)],
    stored: [stored],
    nowIso: NOW,
    targets: new Map(),
  });
  assertEquals(resolved.tuples, []);
  assertEquals(resolved.patches, []);
});
