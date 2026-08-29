/**
 * File 05 §2 reproduced end to end (PLAN §3 P8 acceptance) with the real handlers and the real
 * reward mapping over an in-memory server: the device works "Slides" (rec 9c1d, 14:00–15:00)
 * offline while a new meeting lands on the same slot through the webhook (→ displaced_pending);
 * at 16:10 the sync replays ops 41/42, FACTS BEAT PLANS turns the row into `completed` with
 * `conflict_flag`, the reward tuple is written EXCLUDED (never guessed), the task moves 7 → 8,
 * and the pull hands back the meeting and the resolved row. Counterfactual branch: no offline
 * facts → `displaced`, no tuple. A replay of the same ops is a no-op.
 */
import { assert, assertEquals } from '@std/assert';
import type { EventsPage, MappedEvent } from '../_shared/gcal.ts';
import type { GcalState } from '../_shared/gcal_sync.ts';
import type { Fact, RecPatch, StoredTuple, Tuple } from '../_shared/rewards.ts';
import type { OpAck, PullRow, SyncOp, SyncResponse } from '../_shared/sync_types.ts';
import type { WireTuple } from '../attribute-rewards/feedback.ts';
import { type Deps as RewardDeps, processUser, type RecRow } from '../attribute-rewards/handler.ts';
import { type Deps as WebhookDeps, handleGcalWebhook } from '../gcal-webhook/handler.ts';
import { type Deps as SyncDeps, handleSyncResolve } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const TASK = '00000000-0000-4000-8000-00000000e001';
const REC = '00000000-0000-4000-8000-00000000d9c1';
const FEATURES = [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.6, 0, 0, 0.2, 0.5, 0.2, 0];
const T_MEETING = Date.parse('2026-09-01T10:58:00Z'); // 13:58 Kyiv — the push arrives
const T_SYNC = Date.parse('2026-09-01T13:10:00Z'); // 16:10 Kyiv — connectivity restored

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  category: string;
  est_minutes: number;
  value: number;
  status: string;
  done_at: string | null;
  version: number;
  updated_at: string;
  server_seq: number;
}

interface Server {
  clock: number;
  seq: number;
  task: TaskRow;
  rec: RecRow & { version: number; server_seq: number };
  events: Array<Fact & { op_id: string }>;
  ledger: Set<string>;
  tuples: Array<Tuple & { delivered_at: string | null; corrected_at: string | null }>;
  calendar: Map<string, MappedEvent & { server_seq: number }>;
  gcal: GcalState;
  posted: WireTuple[][];
}

function server(): Server {
  const s: Server = {
    clock: T_MEETING,
    seq: 10,
    task: {
      id: TASK,
      user_id: USER,
      title: 'Slides',
      category: 'deep',
      est_minutes: 60,
      value: 2,
      status: 'scheduled',
      done_at: null,
      version: 7,
      updated_at: '2026-09-01T06:00:00.000Z',
      server_seq: 3,
    },
    rec: {
      id: REC,
      user_id: USER,
      task_id: TASK,
      category: 'deep',
      slot_start: '2026-09-01T11:00:00.000Z',
      slot_end: '2026-09-01T12:00:00.000Z',
      context_bucket: 'AF.wd.fresh',
      features: FEATURES,
      status: 'accepted',
      conflict_flag: false,
      attributed_at: null,
      version: 2,
      server_seq: 5,
    },
    events: [],
    ledger: new Set(),
    tuples: [],
    calendar: new Map(),
    gcal: {
      user_id: USER,
      calendar_id: 'primary',
      refresh_token: 'rt',
      access_token: 'at',
      access_token_expires_at: new Date(T_SYNC + 3_600_000).toISOString(),
      sync_token: 'tok1',
      channel_id: 'ch1',
      resource_id: 'res1',
      channel_token: 'secret1',
      channel_expires_at: new Date(T_SYNC + 5 * 86_400_000).toISOString(),
      scope: 'read',
      write_back: false,
      last_synced_at: null,
      last_error: null,
      connected_at: '2026-08-30T00:00:00.000Z',
      confirmed_at: '2026-08-30T00:00:00.000Z',
      confirm_token: null,
      confirm_token_expires_at: null,
      oauth_state: null,
      oauth_state_expires_at: null,
      timezone: 'Europe/Kyiv',
    },
    posted: [],
  };
  return s;
}

function webhookDeps(s: Server, page: EventsPage): WebhookDeps {
  return {
    now: () => s.clock,
    config: {
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'https://fn/gcal-callback',
      webhookAddress: 'https://fn/gcal-webhook',
    },
    serviceKey: 'k',
    randomId: () => 'id',
    google: {
      refreshAccessToken: () => Promise.resolve({ access_token: 'at', expires_in: 3600 }),
      listEvents: () => Promise.resolve(page),
      watchEvents: () => Promise.resolve({ resourceId: 'r', expiration: 0 }),
      stopChannel: () => Promise.resolve(),
      insertEvent: () => Promise.resolve('e'),
      patchEvent: () => Promise.resolve(),
      deleteEvent: () => Promise.resolve(),
    },
    saveState: (_u, patch) => {
      Object.assign(s.gcal, patch);
      return Promise.resolve();
    },
    upsertEvents: (_u, events) => {
      for (const e of events) s.calendar.set(e.external_id, { ...e, server_seq: ++s.seq });
      return Promise.resolve();
    },
    wipeEvents: () => Promise.resolve(),
    loadOpenRecs: () =>
      Promise.resolve(
        ['shown', 'accepted', 'pinned', 'moved'].includes(s.rec.status) ? [s.rec] : [],
      ),
    markDisplaced: (_u, ids) => {
      if (ids.includes(s.rec.id)) {
        s.rec.status = 'displaced_pending';
        s.rec.version++;
        s.rec.server_seq = ++s.seq;
      }
      return Promise.resolve();
    },
    loadWriteBackRecs: () => Promise.resolve([]),
    loadWriteBackMirrored: () => Promise.resolve([]),
    saveWriteBack: () => Promise.resolve(),
    loadStateByChannel: (id) => Promise.resolve(id === 'ch1' ? s.gcal : null),
    loadConnected: () => Promise.resolve([s.gcal]),
  };
}

function rewardDeps(s: Server): RewardDeps {
  const recIf = (pred: boolean): RecRow[] => (pred ? [s.rec] : []);
  return {
    now: () => s.clock,
    verifyUser: () => Promise.resolve(USER),
    serviceKey: 'k',
    acquireLease: () => Promise.resolve('lease'),
    releaseLease: () => Promise.resolve(),
    loadProfile: () =>
      Promise.resolve({
        timezone: 'Europe/Kyiv',
        working_hours: { tue: [540, 1080] },
        sleep_window: null,
      }),
    loadFacts: (_u, since) => Promise.resolve(s.events.filter((f) => f.client_ts >= since)),
    loadRecs: (_u, ids) => Promise.resolve(recIf(ids.includes(REC))),
    loadRecsForTasks: (_u, taskIds) => Promise.resolve(recIf(taskIds.includes(TASK))),
    loadRecsInRange: () => Promise.resolve([s.rec]),
    loadDisplacedPending: () => Promise.resolve(recIf(s.rec.status === 'displaced_pending')),
    loadDue: () => Promise.resolve([]),
    loadStored: (_u, ids) =>
      Promise.resolve(
        s.tuples
          .filter((t) => ids.includes(t.recommendation_id))
          .map((t): StoredTuple => ({
            recommendation_id: t.recommendation_id,
            kind: t.kind,
            reward: t.reward,
            reason: t.reason,
            excluded: t.excluded,
            attributed_at: t.attributed_at,
            corrected_at: t.corrected_at,
          })),
      ),
    loadUndelivered: () =>
      Promise.resolve(
        s.tuples.filter((t) => t.delivered_at === null).map((t) => ({
          recommendation_id: t.recommendation_id,
          kind: t.kind,
          reward: t.reward,
          reason: t.reason,
          category: t.category,
          features: t.features,
          excluded: t.excluded,
          excluded_reason: t.excluded_reason,
          attributed_at: t.attributed_at,
          correction: t.corrected_at !== null,
          source: t.source,
        })),
      ),
    loadUndeliveredUsers: () => Promise.resolve([]),
    loadCells: () => Promise.resolve([]),
    loadTask: () =>
      Promise.resolve({
        category: 'deep',
        value: 2,
        est_minutes: 60,
        splittable: false,
        deadline: null,
        postpone_count: 0,
      }),
    loadBusy: () =>
      Promise.resolve(
        [...s.calendar.values()].filter((c) => c.busy && !c.deleted).map((c) => ({
          startMs: Date.parse(c.start_at),
          endMs: Date.parse(c.end_at),
        })),
      ),
    writeTuples: (_u, tuples) => {
      for (const t of tuples) {
        if (
          !s.tuples.some((x) => x.recommendation_id === t.recommendation_id && x.kind === t.kind)
        ) {
          s.tuples.push({ ...t, delivered_at: null, corrected_at: null });
        }
      }
      return Promise.resolve();
    },
    patchRecs: (_u, patches: readonly RecPatch[]) => {
      const out: RecRow[] = [];
      for (const p of patches) {
        if (p.id !== s.rec.id) continue;
        const { id: _id, ...fields } = p;
        Object.assign(s.rec, fields);
        s.rec.version++;
        s.rec.server_seq = ++s.seq;
        out.push(s.rec);
      }
      return Promise.resolve(out);
    },
    postFeedback: (_u, tuples) => {
      s.posted.push([...tuples]);
      return Promise.resolve({ kind: 'not_configured' as const });
    },
    markDelivered: () => Promise.resolve(),
    loadDurationEstimates: () => Promise.resolve({}),
    saveDurationEstimate: () => Promise.resolve(),
  };
}

/** A faithful in-memory `sync_replay()` for the op types this scenario uses. */
function replay(s: Server, ops: readonly SyncOp[]): OpAck[] {
  const acks: OpAck[] = [];
  for (const op of ops) {
    if (s.ledger.has(op.op_id)) {
      acks.push({ op_id: op.op_id, outcome: 'duplicate' });
      continue;
    }
    if (op.op_type === 'event_append') {
      const p = op.payload;
      s.events.push({
        op_id: op.op_id,
        type: String(p.type),
        task_id: (p.task_id as string | null) ?? null,
        recommendation_id: (p.recommendation_id as string | null) ?? null,
        payload: (p.payload as Record<string, unknown>) ?? {},
        context: (p.context as Record<string, unknown>) ?? {},
        client_ts: new Date(p.client_ts as number).toISOString(),
        local_day: String(p.local_day),
      });
      s.ledger.add(op.op_id);
      acks.push({ op_id: op.op_id, outcome: 'applied' });
    } else if (op.op_type === 'task_upsert') {
      if (op.base_version !== s.task.version) {
        acks.push({ op_id: op.op_id, outcome: 'conflict', row: { ...s.task } });
        continue;
      }
      const p = op.payload;
      s.task = {
        ...s.task,
        status: String(p.status),
        done_at: p.done_at === null ? null : new Date(p.done_at as number).toISOString(),
        version: s.task.version + 1,
        updated_at: new Date(p.updated_at as number).toISOString(),
        server_seq: ++s.seq,
      };
      s.ledger.add(op.op_id);
      acks.push({ op_id: op.op_id, outcome: 'applied', version: s.task.version });
    } else {
      acks.push({ op_id: op.op_id, outcome: 'rejected' });
    }
  }
  return acks;
}

function pull(s: Server, cursor: number): PullRow[] {
  const rows: PullRow[] = [];
  if (s.task.server_seq > cursor) {
    rows.push({ server_seq: s.task.server_seq, tbl: 'tasks', row: { ...s.task } });
  }
  if (s.rec.server_seq > cursor) {
    rows.push({ server_seq: s.rec.server_seq, tbl: 'recommendations', row: { ...s.rec } });
  }
  for (const c of s.calendar.values()) {
    if (c.server_seq > cursor) {
      rows.push({
        server_seq: c.server_seq,
        tbl: 'calendar_events',
        row: { user_id: USER, source: 'google', ...c },
      });
    }
  }
  return rows.sort((a, b) => a.server_seq - b.server_seq);
}

function syncDeps(s: Server): SyncDeps {
  const rewards = rewardDeps(s);
  return {
    now: () => s.clock,
    verifyUser: () => Promise.resolve(USER),
    acquireLease: () => Promise.resolve('lease'),
    releaseLease: () => Promise.resolve(),
    replay: (_u, ops) => Promise.resolve(replay(s, ops)),
    rewards: () => processUser(rewards, USER, 'instant', null),
    pull: (_t, cursor) => Promise.resolve(pull(s, cursor)),
  };
}

/** The device's outbox from 13:55–16:10 offline (File 05 §2 ops 41, 42). */
const OFFLINE_OPS: SyncOp[] = [
  {
    op_id: 'dev-000000000041',
    op_type: 'event_append',
    entity_id: TASK,
    base_version: null,
    payload: {
      op_id: 'dev-000000000041',
      user_id: USER,
      type: 'focus_start',
      task_id: TASK,
      recommendation_id: REC,
      payload: {
        session_id: 's1',
        started_at: '2026-09-01T11:00:00.000Z',
        slot_start: '2026-09-01T11:00:00.000Z',
        planned_minutes: 60,
      },
      context: { tz: 'Europe/Kyiv' },
      client_ts: Date.parse('2026-09-01T11:00:00Z'),
      local_day: '2026-09-01',
    },
  },
  {
    op_id: 'dev-000000000042',
    op_type: 'task_upsert',
    entity_id: TASK,
    base_version: 7,
    payload: {
      id: TASK,
      user_id: USER,
      title: 'Slides',
      category: 'deep',
      est_minutes: 60,
      value: 2,
      status: 'done',
      done_at: Date.parse('2026-09-01T11:55:00Z'),
      version: 8,
      updated_at: Date.parse('2026-09-01T11:55:00Z'),
    },
  },
  {
    op_id: 'dev-000000000043',
    op_type: 'event_append',
    entity_id: TASK,
    base_version: null,
    payload: {
      op_id: 'dev-000000000043',
      user_id: USER,
      type: 'focus_end',
      task_id: TASK,
      recommendation_id: REC,
      payload: {
        session_id: 's1',
        outcome: 'finished',
        started_at: '2026-09-01T11:00:00.000Z',
        ended_at: '2026-09-01T11:55:00.000Z',
        focused_ms: 55 * 60_000,
        planned_minutes: 60,
        est_minutes: 60,
      },
      context: { tz: 'Europe/Kyiv' },
      client_ts: Date.parse('2026-09-01T11:55:00Z'),
      local_day: '2026-09-01',
    },
  },
];

const MEETING_PAGE: EventsPage = {
  items: [{
    id: 'meet1',
    status: 'confirmed',
    summary: 'Design review',
    start: { dateTime: '2026-09-01T14:00:00+03:00' },
    end: { dateTime: '2026-09-01T15:00:00+03:00' },
  }],
  nextSyncToken: 'tok2',
  timeZone: 'Europe/Kyiv',
};

async function pushMeeting(s: Server): Promise<void> {
  const res = await handleGcalWebhook(
    new Request('http://x/gcal-webhook', {
      method: 'POST',
      headers: {
        'x-goog-channel-id': 'ch1',
        'x-goog-channel-token': 'secret1',
        'x-goog-resource-state': 'exists',
      },
    }),
    webhookDeps(s, MEETING_PAGE),
  );
  assertEquals(res.status, 200);
}

async function sync(s: Server, ops: SyncOp[], cursor: number): Promise<SyncResponse> {
  const res = await handleSyncResolve(
    new Request('http://x/sync-resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer jwt' },
      body: JSON.stringify({ ops, cursor, reason: 'reconnect' }),
    }),
    syncDeps(s),
  );
  assertEquals(res.status, 200);
  return (await res.json()) as SyncResponse;
}

Deno.test('File 05 §2 — meeting lands during the offline window; on reconnect FACTS BEAT PLANS: completed + conflict_flag, reward EXCLUDED, task 7 → 8, pull carries the meeting', async () => {
  const s = server();
  await pushMeeting(s);
  assertEquals(s.rec.status, 'displaced_pending', 'the webhook marked the placement');
  assertEquals(s.calendar.get('meet1')?.busy, true);

  s.clock = T_SYNC;
  const r = await sync(s, OFFLINE_OPS, 0);
  assertEquals(r.acks.map((a) => a.outcome), ['applied', 'applied', 'applied']);
  assertEquals(s.task.status, 'done');
  assertEquals(s.task.version, 8, 'version check passed 7 → 8');
  assertEquals(s.rec.status, 'completed', 'completion outranks displacement');
  assertEquals(s.rec.conflict_flag, true, 'concurrent_external_conflict flag');
  assertEquals(s.tuples.length, 1);
  assertEquals(s.tuples[0].reason, 'completed');
  assertEquals(s.tuples[0].reward, 1.0);
  assertEquals(s.tuples[0].excluded, true, 'ambiguous → EXCLUDED from the bandit update');
  assertEquals(s.tuples[0].excluded_reason, 'concurrent_external_conflict');
  assertEquals(r.rewards?.tuples_written, 1);
  // the excluded tuple still travels to /feedback (the service drops excluded rows — H3 guard)
  assertEquals(s.posted.length, 1);
  assertEquals(s.posted[0][0].excluded, true);
  // pull: the imported meeting, the resolved row and the done task, cursor advanced
  const tables = r.pull.map((p) => p.tbl);
  assert(tables.includes('calendar_events'));
  assert(tables.includes('recommendations'));
  assert(tables.includes('tasks'));
  const recRow = r.pull.find((p) => p.tbl === 'recommendations')?.row;
  assertEquals(recRow?.status, 'completed');
  assertEquals(recRow?.conflict_flag, true);
  assertEquals(r.cursor, s.seq);
  assertEquals(r.has_more, false);

  // replaying the same ops after reconnecting again is a no-op: no second tuple, no version bump
  const again = await sync(s, OFFLINE_OPS, r.cursor);
  assertEquals(again.acks.map((a) => a.outcome), ['duplicate', 'duplicate', 'duplicate']);
  assertEquals(s.task.version, 8);
  assertEquals(s.tuples.length, 1);
  assertEquals(again.pull, []);
});

Deno.test('File 05 §2 counterfactual — no offline facts: on sync the row is displaced, NO reward is emitted', async () => {
  const s = server();
  await pushMeeting(s);
  s.clock = T_SYNC;
  const r = await sync(s, [], 0);
  assertEquals(r.acks, []);
  assertEquals(s.rec.status, 'displaced');
  assertEquals(s.tuples, [], 'external displacement emits no reward (H3)');
  assertEquals(s.task.status, 'scheduled', 'the client mirrors the task back to the Inbox on pull');
  const recRow = r.pull.find((p) => p.tbl === 'recommendations')?.row;
  assertEquals(recRow?.status, 'displaced');
});

Deno.test('File 05 §2 — a conflicting task edit comes back as conflict + server row, never applied blindly', async () => {
  const s = server();
  s.task.version = 9; // edited on another device meanwhile
  s.clock = T_SYNC;
  const r = await sync(s, [OFFLINE_OPS[1]], 0);
  assertEquals(r.acks[0].outcome, 'conflict');
  assertEquals(r.acks[0].row?.version, 9);
  assertEquals(s.task.status, 'scheduled');
});
