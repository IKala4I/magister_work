/**
 * Every branch of `sync-resolve` with injected deps: auth, body validation, the lease (409 busy,
 * always released), replay acks passed through with a closed vocabulary, the reward pass gating
 * (a bare poll skips it), the pull with cursor max-semantics and `has_more`.
 */
import { assert, assertEquals } from '@std/assert';
import type { OpAck, PullRow, SyncOp, SyncResponse } from '../_shared/sync_types.ts';
import type { UserReport } from '../attribute-rewards/handler.ts';
import {
  type Deps,
  handleSyncResolve,
  MAX_OPS_PER_BATCH,
  parseBody,
  PULL_LIMIT_MAX,
  shouldRunRewards,
} from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-08-28T13:10:00Z');

interface State {
  leaseHeld: boolean;
  released: string[];
  replayed: SyncOp[][];
  acks: OpAck[];
  rewardsCalls: number;
  report: UserReport | null;
  pulls: Array<{ cursor: number; limit: number }>;
  pull: PullRow[];
}

function state(over: Partial<State> = {}): State {
  return {
    leaseHeld: false,
    released: [],
    replayed: [],
    acks: [],
    rewardsCalls: 0,
    report: null,
    pulls: [],
    pull: [],
    ...over,
  };
}

function deps(s: State): Deps {
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    acquireLease: () => Promise.resolve(s.leaseHeld ? null : 'lease-1'),
    releaseLease: (_u, token) => {
      s.released.push(token);
      return Promise.resolve();
    },
    replay: (_u, ops) => {
      s.replayed.push([...ops]);
      return Promise.resolve(s.acks);
    },
    rewards: () => {
      s.rewardsCalls++;
      return Promise.resolve(s.report);
    },
    pull: (_t, cursor, limit) => {
      s.pulls.push({ cursor, limit });
      return Promise.resolve(s.pull);
    },
  };
}

function req(body: unknown, token: string | null = 'good', method = 'POST'): Request {
  return new Request('http://x/sync-resolve', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

const op = (over: Partial<SyncOp> = {}): SyncOp => ({
  op_id: 'dev-000000000001',
  op_type: 'task_upsert',
  entity_id: 't1',
  base_version: null,
  payload: { id: 't1' },
  ...over,
});

Deno.test('405 / 401 / 400 before any work', async () => {
  const s = state();
  const d = deps(s);
  assertEquals((await handleSyncResolve(req({}, 'good', 'GET'), d)).status, 405);
  assertEquals((await handleSyncResolve(req({ ops: [] }, null), d)).status, 401);
  assertEquals((await handleSyncResolve(req({ ops: [] }, 'bad'), d)).status, 401);
  assertEquals((await handleSyncResolve(req('{not json'), d)).status, 400);
  assertEquals((await handleSyncResolve(req({ ops: 'x' }), d)).status, 400);
  assertEquals((await handleSyncResolve(req({ ops: [], cursor: -1 }), d)).status, 400);
  assertEquals((await handleSyncResolve(req({ ops: [], reason: 'nope' }), d)).status, 400);
  assertEquals(s.replayed.length, 0);
  assertEquals(s.released.length, 0, 'no lease was taken');
});

Deno.test('parseBody — op validation and limits', () => {
  assertEquals(typeof parseBody({ ops: [{}] }), 'string');
  assertEquals(typeof parseBody({ ops: [op({ op_type: 'bogus' as never })] }), 'string');
  assertEquals(typeof parseBody({ ops: [op({ base_version: -1 })] }), 'string');
  assertEquals(typeof parseBody({ ops: [op({ payload: 'x' as never })] }), 'string');
  assertEquals(typeof parseBody({ ops: [op({ op_id: 'x'.repeat(129) })] }), 'string');
  assertEquals(
    typeof parseBody({ ops: Array.from({ length: MAX_OPS_PER_BATCH + 1 }, () => op()) }),
    'string',
  );
  const ok = parseBody({ ops: [op()], cursor: 5, reason: 'poll', pull_limit: 99999 });
  if (typeof ok === 'string') throw new Error(ok);
  assertEquals(ok.cursor, 5);
  assertEquals(ok.reason, 'poll');
  assertEquals(ok.pullLimit, PULL_LIMIT_MAX);
  const defaults = parseBody({ ops: [] });
  if (typeof defaults === 'string') throw new Error(defaults);
  assertEquals(defaults.cursor, 0);
  assertEquals(defaults.reason, 'manual');
});

Deno.test('409 busy while another sync holds the lease', async () => {
  const s = state({ leaseHeld: true });
  const res = await handleSyncResolve(req({ ops: [op()] }), deps(s));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, 'busy');
  assertEquals(s.replayed.length, 0);
});

Deno.test('push → rewards → pull; acks pass through; cursor advances to the max server_seq', async () => {
  const s = state({
    acks: [
      { op_id: 'dev-000000000001', outcome: 'applied', version: 1, server_seq: 41 },
      { op_id: 'dev-000000000002', outcome: 'conflict', row: { id: 't2', version: 3 } },
    ],
    report: {
      user_id: USER,
      facts: 2,
      tuples_written: 1,
      patches: 1,
      delivered: 1,
      delivery: 'ok',
      duration_updates: 0,
      recommendations: [],
    },
    pull: [
      { server_seq: 40, tbl: 'tasks', row: { id: 't1' } },
      { server_seq: 42, tbl: 'recommendations', row: { id: 'r1' } },
    ],
  });
  const res = await handleSyncResolve(
    req({ ops: [op(), op({ op_id: 'dev-000000000002' })], cursor: 39, reason: 'write' }),
    deps(s),
  );
  assertEquals(res.status, 200);
  const body = (await res.json()) as SyncResponse;
  assertEquals(body.acks.length, 2);
  assertEquals(body.acks[1].outcome, 'conflict');
  assertEquals(body.acks[1].row, { id: 't2', version: 3 });
  assertEquals(body.rewards, {
    facts: 2,
    tuples_written: 1,
    patches: 1,
    delivered: 1,
    delivery: 'ok',
    duration_updates: 0,
  });
  assertEquals(body.pull.length, 2);
  assertEquals(body.cursor, 42);
  assertEquals(body.has_more, false);
  assertEquals(body.server_now, new Date(NOW).toISOString());
  assertEquals(s.replayed[0].length, 2);
  assertEquals(s.rewardsCalls, 1);
  assertEquals(s.pulls, [{ cursor: 39, limit: 500 }]);
  assertEquals(s.released, ['lease-1'], 'lease released after the round trip');
});

Deno.test('a bare poll skips the reward pass and the replay; a poll carrying facts runs it', async () => {
  const s = state();
  const res = await handleSyncResolve(req({ ops: [], cursor: 10, reason: 'poll' }), deps(s));
  assertEquals(res.status, 200);
  assertEquals(s.replayed.length, 0);
  assertEquals(s.rewardsCalls, 0);
  assertEquals((await res.json()).rewards, null);
  assertEquals(shouldRunRewards('poll', [op({ op_type: 'event_append' })]), true);
  assertEquals(shouldRunRewards('poll', [op({ op_type: 'task_upsert' })]), false);
  assertEquals(shouldRunRewards('foreground', []), true);
});

Deno.test('has_more when the page is full; the cursor never goes below the request cursor', async () => {
  const rows: PullRow[] = Array.from({ length: 3 }, (_, i) => ({
    server_seq: 100 + i,
    tbl: 'tasks',
    row: { id: `t${i}` },
  }));
  const s = state({ pull: rows });
  const res = await handleSyncResolve(
    req({ ops: [], cursor: 500, reason: 'manual', pull_limit: 3 }),
    deps(s),
  );
  const body = (await res.json()) as SyncResponse;
  assertEquals(body.has_more, true);
  assertEquals(body.cursor, 500, 'stale rows below the cursor never rewind it');
});

Deno.test('the lease is released even when the replay throws (500)', async () => {
  const s = state();
  const d = deps(s);
  d.replay = () => Promise.reject(new Error('boom'));
  let threw = false;
  try {
    await handleSyncResolve(req({ ops: [op()] }), d);
  } catch {
    threw = true;
  }
  assert(threw, 'index.ts turns the throw into a 500');
  assertEquals(s.released, ['lease-1']);
});

Deno.test('an unknown outcome from the RPC is closed down to error on the wire', async () => {
  const s = state({ acks: [{ op_id: 'dev-000000000001', outcome: 'weird' as never }] });
  const res = await handleSyncResolve(req({ ops: [op()] }), deps(s));
  const body = (await res.json()) as SyncResponse;
  assertEquals(body.acks[0].outcome, 'error');
});
