/**
 * Every branch of `attribute-rewards` with injected deps: auth (JWT / backend key / cron), the
 * instant path (rows 1–3, 6, 8–9, corrections, the duration estimator), the daily authority
 * (rows 4–5 over the due slice), delivery + re-delivery of tuples when the service is down,
 * and idempotent re-runs.
 */
import { assert, assertEquals } from '@std/assert';
import type { Fact, RecPatch, StoredTuple, Tuple } from '../_shared/rewards.ts';
import type { FeedbackCall, WireTuple } from './feedback.ts';
import { type Deps, handleAttributeRewards, type RecRow } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const REC = '00000000-0000-4000-8000-00000000d001';
const REC2 = '00000000-0000-4000-8000-00000000d002';
const TASK = '00000000-0000-4000-8000-00000000e001';
const KEY = 'backend-key';
const NOW = Date.parse('2026-09-02T20:55:00Z'); // 23:55 Kyiv
const FEATURES = [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.6, 0, 0, 0.2, 0.5, 0.2, 0];

function rec(over: Partial<RecRow> = {}): RecRow {
  return {
    id: REC,
    user_id: USER,
    task_id: TASK,
    category: 'deep',
    slot_start: '2026-09-02T11:00:00Z', // 14:00 Kyiv
    slot_end: '2026-09-02T12:30:00Z',
    context_bucket: 'AF.wd.fresh',
    features: FEATURES,
    status: 'shown',
    conflict_flag: false,
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
    client_ts: '2026-09-02T12:30:00Z',
    local_day: '2026-09-02',
    ...over,
  };
}

interface State {
  recs: RecRow[];
  facts: Fact[];
  stored: Array<Tuple & { delivered_at: string | null; corrected_at: string | null }>;
  durations: Record<string, { ewma_ratio: number; n: number; last_session_at: string | null }>;
  feedback: FeedbackCall;
  posted: Array<{ userId: string; tuples: WireTuple[] }>;
  patches: RecPatch[];
  profile: boolean;
  due: RecRow[];
}

function makeDeps(state: State): Deps {
  return {
    now: () => NOW,
    verifyUser: (token) => Promise.resolve(token === 'good' ? USER : null),
    serviceKey: KEY,
    loadProfile: () =>
      Promise.resolve(
        state.profile
          ? { timezone: 'Europe/Kyiv', working_hours: { wed: [540, 1080] }, sleep_window: null }
          : null,
      ),
    loadFacts: (_u, since) => Promise.resolve(state.facts.filter((f) => f.client_ts >= since)),
    loadRecs: (_u, ids) => Promise.resolve(state.recs.filter((r) => ids.includes(r.id))),
    loadRecsForTasks: (_u, taskIds) =>
      Promise.resolve(state.recs.filter((r) => taskIds.includes(r.task_id))),
    loadRecsInRange: () => Promise.resolve(state.recs),
    loadDue: () => Promise.resolve(state.due.map((r) => ({ ...r, timezone: 'Europe/Kyiv' }))),
    loadStored: (_u, ids) =>
      Promise.resolve(
        state.stored
          .filter((s) => ids.includes(s.recommendation_id))
          .map((s): StoredTuple => ({
            recommendation_id: s.recommendation_id,
            kind: s.kind,
            reward: s.reward,
            reason: s.reason,
            excluded: s.excluded,
            attributed_at: s.attributed_at,
            corrected_at: s.corrected_at,
          })),
      ),
    loadUndelivered: () =>
      Promise.resolve(
        state.stored.filter((s) => s.delivered_at === null).map((s) => ({
          recommendation_id: s.recommendation_id,
          kind: s.kind,
          reward: s.reward,
          reason: s.reason,
          category: s.category,
          features: s.features,
          excluded: s.excluded,
          excluded_reason: s.excluded_reason,
          attributed_at: s.attributed_at,
          correction: s.corrected_at !== null,
          source: s.source,
        })),
      ),
    loadUndeliveredUsers: () =>
      Promise.resolve([
        ...new Set(state.stored.filter((s) => s.delivered_at === null).map(() => USER)),
      ]),
    loadCells: () => Promise.resolve([]),
    loadTask: () =>
      Promise.resolve({
        category: 'deep',
        value: 3,
        est_minutes: 90,
        splittable: false,
        deadline: null,
        postpone_count: 0,
      }),
    loadBusy: () => Promise.resolve([]),
    writeTuples: (_u, tuples) => {
      for (const t of tuples) {
        const existing = state.stored.find((s) =>
          s.recommendation_id === t.recommendation_id && s.kind === t.kind
        );
        if (t.correction && existing) {
          Object.assign(existing, {
            reward: t.reward,
            reason: t.reason,
            corrected_at: new Date(NOW).toISOString(),
            delivered_at: null,
            source: 'correction',
          });
        } else if (!existing) {
          state.stored.push({ ...t, delivered_at: null, corrected_at: null });
        }
      }
      return Promise.resolve();
    },
    patchRecs: (_u, patches) => {
      state.patches.push(...patches);
      const rows: RecRow[] = [];
      for (const p of patches) {
        const r = state.recs.find((x) => x.id === p.id);
        if (r) {
          Object.assign(r, p);
          rows.push({ ...r });
        }
      }
      return Promise.resolve(rows);
    },
    postFeedback: (userId, tuples) => {
      state.posted.push({ userId, tuples: [...tuples] });
      return Promise.resolve(state.feedback);
    },
    markDelivered: (_u, keys, at) => {
      for (const [id, kind] of keys) {
        const s = state.stored.find((x) => x.recommendation_id === id && x.kind === kind);
        if (s) s.delivered_at = at;
      }
      return Promise.resolve();
    },
    loadDurationEstimates: () =>
      Promise.resolve(
        { ...state.durations } as Deps extends
          { loadDurationEstimates: (u: string) => Promise<infer R> } ? R : never,
      ),
    saveDurationEstimate: (_u, category, est, last) => {
      state.durations[category] = { ...est, last_session_at: last };
      return Promise.resolve();
    },
  };
}

function freshState(over: Partial<State> = {}): State {
  return {
    recs: [rec()],
    facts: [],
    stored: [],
    durations: {},
    feedback: { kind: 'ok', state_version: 2, updated: 1, rebuilt: false, ms: 5 },
    posted: [],
    patches: [],
    profile: true,
    due: [],
    ...over,
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://local/attribute-rewards', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const asUser = { authorization: 'Bearer good' };
const asBackend = { 'x-service-key': KEY };

Deno.test('auth: no credentials → 401; bad token → 401; daily without the backend key → 401', async () => {
  const deps = makeDeps(freshState());
  assertEquals((await handleAttributeRewards(post({ mode: 'instant' }), deps)).status, 401);
  assertEquals(
    (await handleAttributeRewards(
      post({ mode: 'instant' }, { authorization: 'Bearer nope' }),
      deps,
    )).status,
    401,
  );
  assertEquals((await handleAttributeRewards(post({ mode: 'daily' }, asUser), deps)).status, 401);
  assertEquals(
    (await handleAttributeRewards(post({ mode: 'daily' }, { 'x-service-key': 'wrong' }), deps))
      .status,
    401,
  );
});

Deno.test('validation: unknown mode → 400; backend instant needs user_id; GET → 405', async () => {
  const deps = makeDeps(freshState());
  assertEquals((await handleAttributeRewards(post({ mode: 'weekly' }, asUser), deps)).status, 400);
  assertEquals(
    (await handleAttributeRewards(post({ mode: 'instant' }, asBackend), deps)).status,
    400,
  );
  const res = await handleAttributeRewards(new Request('http://local/x', { method: 'GET' }), deps);
  assertEquals(res.status, 405);
});

Deno.test('no completed profile → 404', async () => {
  const deps = makeDeps(freshState({ profile: false }));
  assertEquals((await handleAttributeRewards(post({ mode: 'instant' }, asUser), deps)).status, 404);
});

Deno.test('instant — an in-window finished session writes one completed tuple, patches the row, delivers it, returns the row', async () => {
  const state = freshState({
    facts: [
      fact('focus_end', {
        outcome: 'finished',
        started_at: '2026-09-02T11:05:00Z',
        ended_at: '2026-09-02T12:20:00Z',
        focused_ms: 75 * 60_000,
        planned_minutes: 90,
        est_minutes: 90,
        session_id: 's1',
      }),
    ],
  });
  const res = await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.tuples_written, 1);
  assertEquals(body.delivered, 1);
  assertEquals(body.delivery, 'ok');
  assertEquals(body.recommendations[0].status, 'completed');
  assertEquals(state.stored[0].reason, 'completed');
  assert(state.stored[0].delivered_at !== null);
  assertEquals(state.posted[0].userId, USER);
  assertEquals(state.posted[0].tuples[0].reward, 1);
  assertEquals('source' in state.posted[0].tuples[0], false); // wire shape = the /feedback contract
  assertEquals(body.duration_updates, 1);
  assertEquals(state.durations.deep.n, 1);
  assertEquals(state.durations.deep.ewma_ratio, 75 / 90);
});

Deno.test('instant — the backend key with user_id (P8 sync-resolve path) works the same', async () => {
  const state = freshState({ facts: [fact('block_skipped', { at: '2026-09-02T11:02:00Z' })] });
  const res = await handleAttributeRewards(
    post({ mode: 'instant', user_id: USER }, asBackend),
    makeDeps(state),
  );
  assertEquals(res.status, 200);
  assertEquals(state.stored[0].reason, 'skipped');
  assertEquals(state.patches[0].status, 'rejected');
});

Deno.test('instant — service down: the tuple is stored undelivered; the next daily sweep delivers it', async () => {
  const state = freshState({
    facts: [fact('block_skipped', { at: '2026-09-02T11:02:00Z' })],
    feedback: { kind: 'failed', status: null, detail: 'network', ms: 3 },
  });
  const first =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals([first.tuples_written, first.delivered, first.delivery], [1, 0, 'failed']);
  assertEquals(state.stored[0].delivered_at, null);
  // re-running instant does not duplicate the tuple, still cannot deliver
  const again =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals(again.tuples_written, 0);
  assertEquals(state.stored.length, 1);
  // the service comes back: the sweep (no due rows) finds the undelivered user
  state.feedback = { kind: 'ok', state_version: 3, updated: 1, rebuilt: false, ms: 4 };
  const daily =
    await (await handleAttributeRewards(post({ mode: 'daily' }, asBackend), makeDeps(state)))
      .json();
  assertEquals(daily.delivered, 1);
  assert(state.stored[0].delivered_at !== null);
});

Deno.test('instant — not_configured (no RECSYS_URL yet, ADR-0009) keeps tuples pending, never errors', async () => {
  const state = freshState({
    facts: [fact('block_skipped', { at: '2026-09-02T11:02:00Z' })],
    feedback: { kind: 'not_configured' },
  });
  const body =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals(body.delivery, 'not_configured');
  assertEquals(state.stored[0].delivered_at, null);
});

Deno.test('instant — a move writes the override pair with a computed target context and moves the row', async () => {
  const state = freshState({
    facts: [
      fact('block_moved', {
        from_start: '2026-09-02T11:00:00Z',
        from_end: '2026-09-02T12:30:00Z',
        to_start: '2026-09-02T07:00:00Z',
        to_end: '2026-09-02T08:30:00Z',
        distance_minutes: 240,
      }),
    ],
  });
  const body =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals(body.tuples_written, 2);
  const kinds = state.stored.map((s) => s.kind).sort();
  assertEquals(kinds, ['override_in', 'override_out']);
  const inn = state.stored.find((s) => s.kind === 'override_in')!;
  assertEquals(inn.features.length, 17);
  assertEquals(inn.features[1 + 1], 1); // 10:00 Kyiv → MO
  const row = state.recs[0];
  assertEquals(row.status, 'moved');
  assertEquals(row.slot_start, '2026-09-02T07:00:00.000Z');
  assertEquals(row.context_bucket, 'MO.wd.fresh');
  // the two tuples were delivered together
  assertEquals(state.posted[0].tuples.length, 2);
});

Deno.test('daily — the due slice lapses (row 5) or gets off-slot credit (row 4); re-runs are no-ops', async () => {
  const state = freshState({
    recs: [
      rec(),
      rec({
        id: REC2,
        task_id: '00000000-0000-4000-8000-00000000e002',
        slot_start: '2026-09-02T06:00:00Z',
        slot_end: '2026-09-02T07:00:00Z',
      }),
    ],
    facts: [
      fact('task_completed', { done_at: '2026-09-02T16:00:00Z', source: 'inbox' }, {
        recommendation_id: null,
      }),
    ],
  });
  state.due = state.recs.map((r) => ({ ...r }));
  const body =
    await (await handleAttributeRewards(post({ mode: 'daily' }, asBackend), makeDeps(state)))
      .json();
  assertEquals(body.due, 2);
  assertEquals(body.tuples_written, 2);
  const byRec = Object.fromEntries(state.stored.map((s) => [s.recommendation_id, s]));
  assertEquals([byRec[REC].reason, byRec[REC].reward], ['off_slot', 0.3]);
  assertEquals([byRec[REC2].reason, byRec[REC2].reward], ['lapsed', 0]);
  assertEquals(state.recs.find((r) => r.id === REC)!.status, 'completed');
  assertEquals(state.recs.find((r) => r.id === REC2)!.status, 'lapsed');
  assert(state.recs.every((r) => r.attributed_at !== null));
  assertEquals(body.delivered, 2);
  const again =
    await (await handleAttributeRewards(post({ mode: 'daily' }, asBackend), makeDeps(state)))
      .json();
  assertEquals(again.tuples_written, 0);
  assertEquals(state.stored.length, 2);
});

Deno.test('correction — "actually did it" on a lapsed row inside the window rewrites the tuple, re-sends it with correction = true', async () => {
  const state = freshState({
    recs: [rec({ status: 'lapsed', attributed_at: '2026-09-01T20:55:00Z' })],
    stored: [{
      recommendation_id: REC,
      kind: 'outcome',
      reward: 0,
      reason: 'lapsed',
      category: 'deep',
      features: FEATURES,
      excluded: false,
      excluded_reason: null,
      attributed_at: '2026-09-01T20:55:00Z',
      correction: false,
      source: 'daily',
      delivered_at: '2026-09-01T20:56:00Z',
      corrected_at: null,
    }],
    facts: [
      fact('lapse_corrected', { at: '2026-09-02T18:00:00Z' }, {
        client_ts: '2026-09-02T18:00:00Z',
      }),
    ],
  });
  const body =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals(body.tuples_written, 1);
  assertEquals(state.stored.length, 1);
  assertEquals([state.stored[0].reward, state.stored[0].reason], [1, 'completed']);
  assert(state.stored[0].corrected_at !== null);
  assertEquals(state.posted[0].tuples[0].correction, true);
  assertEquals(state.posted[0].tuples[0].attributed_at, '2026-09-01T20:55:00Z');
  assertEquals(state.recs[0].status, 'completed');
});

Deno.test('duration estimator — only finished sessions, folded once (monotone marker), scoped to the rec category', async () => {
  const s = (id: string, ts: string, outcome: 'finished' | 'abandoned', focusedMin: number) =>
    fact('focus_end', {
      outcome,
      started_at: '2026-09-02T11:05:00Z',
      ended_at: ts,
      focused_ms: focusedMin * 60_000,
      planned_minutes: 90,
      est_minutes: 60,
      session_id: id,
    }, { client_ts: ts });
  const state = freshState({
    facts: [
      s('a', '2026-09-02T12:00:00Z', 'abandoned', 20),
      s('b', '2026-09-02T12:30:00Z', 'finished', 90),
    ],
  });
  await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state));
  assertEquals(state.durations.deep, {
    ewma_ratio: 1.5,
    n: 1,
    last_session_at: '2026-09-02T12:30:00Z',
  });
  const again =
    await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), makeDeps(state))).json();
  assertEquals(again.duration_updates, 0);
  assertEquals(state.durations.deep.n, 1);
});

Deno.test('#6 — a patch is dropped when a concurrent pass already stored a different tuple for the row', async () => {
  const state = freshState({
    facts: [fact('focus_end', {
      outcome: 'finished',
      started_at: '2026-09-02T11:05:00Z',
      ended_at: '2026-09-02T12:20:00Z',
      focused_ms: 75 * 60_000,
      planned_minutes: 90,
      est_minutes: 90,
      session_id: 's1',
    })],
  });
  const deps = makeDeps(state);
  // simulate the daily sweep winning the (rec, outcome) insert between map and write
  deps.writeTuples = (_u, _t) => {
    state.stored.push({
      recommendation_id: REC,
      kind: 'outcome',
      reward: 0,
      reason: 'lapsed',
      category: 'deep',
      features: FEATURES,
      excluded: false,
      excluded_reason: null,
      attributed_at: new Date(NOW).toISOString(),
      correction: false,
      source: 'daily',
      delivered_at: null,
      corrected_at: null,
    });
    return Promise.resolve();
  };
  const body = await (await handleAttributeRewards(post({ mode: 'instant' }, asUser), deps)).json();
  assertEquals(body.patches, 1); // computed…
  assertEquals(state.patches, []); // …but not applied: the stored tuple is not ours
  assertEquals(state.recs[0].status, 'shown');
});
