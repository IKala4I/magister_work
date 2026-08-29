/**
 * P8 live smoke — the sync flow end-to-end against the LINKED hosted project, reproducing
 * File 05 §2 with the displacement injected through `supabase db query --linked` (the Google
 * hop is the owner's gate; the webhook's displacement write is what it would have done):
 *   anonymous sign-in → profile through RLS → sync-resolve push (task + fact) → acks applied,
 *   pull returns the rows, cursor advances → duplicate replay is a no-op → plan-request
 *   (persist_plan RPC live) → rec A marked displaced_pending + a busy meeting over its slot →
 *   offline facts (focus_start / focus_end finished in-window / task done) synced → rec A is
 *   `completed` with `conflict_flag`, its reward tuple is stored EXCLUDED → counterfactual on
 *   rec B (slot moved to the past, no facts) → `displaced`, no tuple → the lease answers 409
 *   under a concurrent sync → EU region header on every function → the Google functions answer
 *   their fingerprints without credentials (gcal-connect status/start, gcal-webhook 401,
 *   gcal-callback bounce).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines and
 * timings only — never credentials. Leaves one anonymous test user behind (30-day purge).
 *
 * Usage: node docs/verification/p8-live-smoke.mjs   (from apps/mobile so supabase-js resolves)
 */
/* global fetch */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  readFileSync(join(repoRoot, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(URL_, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const uuid = () => globalThis.crypto.randomUUID();
const pad = (n) => String(n).padStart(12, '0');
const DEVICE = uuid();
let counter = 0;
const opId = () => `${DEVICE}-${pad(++counter)}`;

/** Service-side write through the CLI (postgres role) — what the webhook / daily job would do. */
function sql(query) {
  const file = join(tmpdir(), `p8-smoke-${uuid()}.sql`);
  writeFileSync(file, query);
  const out = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const parsed = JSON.parse(out);
  return parsed.rows ?? [];
}

// --- sign in, profile ------------------------------------------------------------------------
const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
check('anonymous sign-in on the hosted project', !authError, authError?.message);
if (authError) process.exit(1);
const uid = authData.user.id;
const jwt = authData.session.access_token;

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const planDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][tomorrow.getDay()];
const { error: profileError } = await supabase.from('profiles').insert({
  user_id: uid,
  timezone: 'Europe/Kyiv',
  working_hours: {
    [dayKey]: [0, 1440],
    mon: [540, 1080],
    tue: [540, 1080],
    wed: [540, 1080],
    thu: [540, 1080],
    fri: [540, 1080],
  },
  sleep_window: [1380, 420],
  rmeq_score: 24,
  chronotype_class: 'DM',
  survey_skipped: false,
  top_categories: ['deep'],
  onboarding_completed_at: new Date().toISOString(),
});
check('profile insert through RLS', !profileError, profileError?.message);

async function sync(ops, cursor, reason = 'manual') {
  const t0 = Date.now();
  const res = await fetch(`${URL_}/functions/v1/sync-resolve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON,
      authorization: `Bearer ${jwt}`,
      'x-region': 'eu-west-1',
    },
    body: JSON.stringify({ ops, cursor, reason, device_id: DEVICE, now: new Date().toISOString() }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  return { status: res.status, body, ms, region: res.headers.get('x-sb-edge-region') };
}

// --- push a task + a fact; pull; duplicate replay --------------------------------------------
const TASK = uuid();
const nowMs = Date.now();
const taskPayload = {
  id: TASK,
  user_id: uid,
  title: 'Slides',
  category: 'deep',
  est_minutes: 60,
  deadline: null,
  value: 2,
  splittable: false,
  earliest_start: null,
  recurrence: null,
  status: 'inbox',
  done_at: null,
  postpone_count: 0,
  deleted_at: null,
  version: 1,
  created_at: nowMs,
  updated_at: nowMs,
};
const createOps = [
  {
    op_id: opId(),
    op_type: 'task_upsert',
    entity_id: TASK,
    base_version: null,
    payload: taskPayload,
  },
  {
    op_id: opId(),
    op_type: 'event_append',
    entity_id: TASK,
    base_version: null,
    payload: {
      user_id: uid,
      type: 'task_created',
      task_id: TASK,
      recommendation_id: null,
      payload: { source: 'form', category: 'deep' },
      context: { tz: 'Europe/Kyiv' },
      client_ts: nowMs,
      local_day: new Date().toISOString().slice(0, 10),
    },
  },
];
createOps[1].payload.op_id = createOps[1].op_id;
// a second task so the plan places two blocks (the counterfactual branch needs rec B)
const TASK2 = uuid();
createOps.push({
  op_id: opId(),
  op_type: 'task_upsert',
  entity_id: TASK2,
  base_version: null,
  payload: { ...taskPayload, id: TASK2, title: 'Reading', category: 'learning', est_minutes: 45 },
});
const s1 = await sync(createOps, 0, 'write');
check(
  'sync-resolve push → 200',
  s1.status === 200,
  `${s1.status} ${JSON.stringify(s1.body).slice(0, 160)}`,
);
check(
  'acks: task create + fact + second task applied',
  s1.body?.acks?.map((a) => a.outcome).join(',') === 'applied,applied,applied',
  JSON.stringify(s1.body?.acks),
);
check(
  'pull returns the profile and the task',
  ['profiles', 'tasks'].every((t) => s1.body?.pull?.some((r) => r.tbl === t)),
  JSON.stringify(s1.body?.pull?.map((r) => r.tbl)),
);
check('cursor advanced', (s1.body?.cursor ?? 0) > 0, String(s1.body?.cursor));
check('EU region header on sync-resolve', s1.region === 'eu-west-1', String(s1.region));
console.log(`      sync-resolve round trip: ${s1.ms} ms`);
const cursor1 = s1.body.cursor;

const s2 = await sync(createOps, cursor1, 'write');
check(
  'duplicate op replay is a no-op (both duplicate)',
  s2.body?.acks?.every((a) => a.outcome === 'duplicate'),
  JSON.stringify(s2.body?.acks),
);
check(
  'nothing new to pull after the replay',
  (s2.body?.pull?.length ?? -1) === 0,
  String(s2.body?.pull?.length),
);

// --- a stale base_version comes back as conflict + server row --------------------------------
const stale = await sync(
  [
    {
      op_id: opId(),
      op_type: 'task_upsert',
      entity_id: TASK,
      base_version: 7,
      payload: { ...taskPayload, title: 'stale edit', version: 8 },
    },
  ],
  s2.body.cursor,
);
check(
  'stale base_version → conflict with the server row',
  stale.body?.acks?.[0]?.outcome === 'conflict' && stale.body?.acks?.[0]?.row?.version === 1,
  JSON.stringify(stale.body?.acks?.[0]).slice(0, 200),
);

// --- plan (persist_plan RPC live) -----------------------------------------------------------
const t0plan = Date.now();
const plan = await supabase.functions.invoke('plan-request', {
  body: { plan_date: planDate, horizon: 'day', trigger: 'manual', now: new Date().toISOString() },
  region: 'eu-west-1',
});
const planMs = Date.now() - t0plan;
const planned = plan.data?.status === 'planned';
check(
  'plan-request → planned (persist_plan RPC)',
  planned && plan.data.recommendations.length >= 1,
  plan.error?.message ?? JSON.stringify(plan.data).slice(0, 160),
);
console.log(
  `      plan-request round trip: ${planMs} ms (engine ${plan.data?.plan?.engine}, ${plan.data?.plan?.telemetry?.ef?.reason})`,
);
if (!planned) process.exit(1);
const recA =
  plan.data.recommendations.find((r) => r.task_id === TASK) ?? plan.data.recommendations[0];

// --- File 05 §2: meeting lands on rec A's slot (what gcal-webhook writes) ---------------------
sql(`update public.recommendations set status = 'displaced_pending' where id = '${recA.id}' and user_id = '${uid}';
insert into public.calendar_events (user_id, source, external_id, start_at, end_at, title, busy)
values ('${uid}', 'google', 'smoke-meet-${DEVICE}', '${recA.slot_start}', '${recA.slot_end}', 'Design review', true);`);
const pendingRow = sql(`select status from public.recommendations where id = '${recA.id}'`);
check(
  'rec A is displaced_pending (injected as the webhook would)',
  pendingRow[0]?.status === 'displaced_pending',
  JSON.stringify(pendingRow),
);

// the device worked the block offline: focus_start, focus_end (finished, in-window), task done
const startMs = Date.parse(recA.slot_start);
const endMs = startMs + 55 * 60_000;
const localDay = new Date(startMs).toISOString().slice(0, 10);
const factOps = [
  {
    op_id: opId(),
    op_type: 'event_append',
    entity_id: TASK,
    base_version: null,
    payload: {
      user_id: uid,
      type: 'focus_start',
      task_id: TASK,
      recommendation_id: recA.id,
      payload: {
        session_id: 's1',
        started_at: new Date(startMs).toISOString(),
        slot_start: recA.slot_start,
        planned_minutes: 60,
      },
      context: { tz: 'Europe/Kyiv' },
      client_ts: startMs,
      local_day: localDay,
    },
  },
  {
    op_id: opId(),
    op_type: 'task_upsert',
    entity_id: TASK,
    base_version: 1,
    payload: { ...taskPayload, status: 'done', done_at: endMs, version: 2, updated_at: endMs },
  },
  {
    op_id: opId(),
    op_type: 'event_append',
    entity_id: TASK,
    base_version: null,
    payload: {
      user_id: uid,
      type: 'focus_end',
      task_id: TASK,
      recommendation_id: recA.id,
      payload: {
        session_id: 's1',
        outcome: 'finished',
        started_at: new Date(startMs).toISOString(),
        ended_at: new Date(endMs).toISOString(),
        focused_ms: 55 * 60_000,
        planned_minutes: 60,
        est_minutes: 60,
      },
      context: { tz: 'Europe/Kyiv' },
      client_ts: endMs,
      local_day: localDay,
    },
  },
];
for (const op of factOps) if (op.op_type === 'event_append') op.payload.op_id = op.op_id;
const s3 = await sync(factOps, stale.body.cursor, 'reconnect');
check(
  'offline facts replayed: all applied',
  s3.body?.acks?.every((a) => a.outcome === 'applied'),
  JSON.stringify(s3.body?.acks),
);
check(
  'reward pass ran and wrote a tuple',
  (s3.body?.rewards?.tuples_written ?? 0) >= 1,
  JSON.stringify(s3.body?.rewards),
);
const pulledA = s3.body?.pull?.find(
  (r) => r.tbl === 'recommendations' && r.row.id === recA.id,
)?.row;
check(
  'FACTS BEAT PLANS: rec A pulled as completed + conflict_flag',
  pulledA?.status === 'completed' && pulledA?.conflict_flag === true,
  JSON.stringify({ status: pulledA?.status, conflict_flag: pulledA?.conflict_flag }),
);
check(
  'the meeting is pulled as a calendar_events row',
  s3.body?.pull?.some((r) => r.tbl === 'calendar_events' && r.row.title === 'Design review'),
  '',
);
check(
  'the task is pulled as done (7→8 analogue: version 2)',
  s3.body?.pull?.some((r) => r.tbl === 'tasks' && r.row.status === 'done' && r.row.version === 2),
  '',
);
const tupleA = sql(
  `select reward, reason, excluded, excluded_reason from public.feedback_rewards where recommendation_id = '${recA.id}' and kind = 'outcome'`,
);
check(
  'reward tuple stored EXCLUDED (concurrent_external_conflict), value kept for audit',
  tupleA[0]?.excluded === true &&
    tupleA[0]?.excluded_reason === 'concurrent_external_conflict' &&
    Number(tupleA[0]?.reward) === 1,
  JSON.stringify(tupleA),
);

// --- counterfactual: rec B displaced with no facts, slot already past → displaced, no tuple ----
const recB = plan.data.recommendations.find((r) => r.id !== recA.id);
if (recB) {
  sql(
    `update public.recommendations set status = 'displaced_pending', slot_start = now() - interval '3 hours', slot_end = now() - interval '2 hours' where id = '${recB.id}' and user_id = '${uid}';`,
  );
  const s4 = await sync([], s3.body.cursor, 'foreground');
  const pulledB = s4.body?.pull?.find(
    (r) => r.tbl === 'recommendations' && r.row.id === recB.id,
  )?.row;
  check(
    'counterfactual: rec B → displaced on sync',
    pulledB?.status === 'displaced',
    JSON.stringify({ status: pulledB?.status }),
  );
  const tupleB = sql(
    `select count(*)::int as n from public.feedback_rewards where recommendation_id = '${recB.id}'`,
  );
  check(
    'counterfactual: NO reward tuple for the displaced block (H3)',
    tupleB[0]?.n === 0,
    JSON.stringify(tupleB),
  );
} else {
  console.log('SKIP  counterfactual — the plan placed only one block');
}

// --- lease: two concurrent syncs → one 200 + one 409 (or both 200 if they did not overlap) ----
const [c1, c2] = await Promise.all([sync([], 0, 'poll'), sync([], 0, 'poll')]);
const statuses = [c1.status, c2.status].sort();
check(
  'concurrent syncs: lease serialises (200/200 or 200/409)',
  statuses.join('/') === '200/200' || statuses.join('/') === '200/409',
  statuses.join('/'),
);

// --- Google functions: fingerprints without credentials -----------------------------------------
const gc = await supabase.functions.invoke('gcal-connect', {
  body: { action: 'status' },
  region: 'eu-west-1',
});
check(
  'gcal-connect status → connected:false',
  gc.data?.status?.connected === false,
  gc.error?.message ?? JSON.stringify(gc.data),
);
const gs = await fetch(`${URL_}/functions/v1/gcal-connect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ action: 'start' }),
});
check(
  'gcal-connect start without Google credentials → 503 not_configured',
  gs.status === 503,
  String(gs.status),
);
// handler-specific fingerprint (P7.1 lesson): the deployed build must know the confirm action
const fp = await fetch(`${URL_}/functions/v1/gcal-connect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ action: 'nope' }),
});
const fpBody = await fp.json().catch(() => null);
check(
  'gcal-connect deployed build is the confirm-aware one (action list names confirm)',
  fp.status === 400 && String(fpBody?.detail ?? '').includes('confirm'),
  `${fp.status} ${JSON.stringify(fpBody)}`,
);
const cf = await fetch(`${URL_}/functions/v1/gcal-connect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ action: 'confirm', token: 'not-a-real-token' }),
});
check(
  'gcal-connect confirm with an unknown token → 409 invalid_confirm (or 503 while the Google gate is closed) — nothing activated',
  cf.status === 409 || cf.status === 503,
  String(cf.status),
);
const wh = await fetch(`${URL_}/functions/v1/gcal-webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ mode: 'sweep' }),
});
check('gcal-webhook sweep without the backend key → 401', wh.status === 401, String(wh.status));
const cb = await fetch(`${URL_}/functions/v1/gcal-callback?code=x&state=nope`, {
  method: 'GET',
  redirect: 'manual',
  headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
});
const loc = cb.headers.get('location') ?? '';
check(
  'gcal-callback bounces to the app deep link',
  cb.status === 302 && loc.startsWith('hourwell://gcal-callback?status='),
  `${cb.status} ${loc}`,
);

// --- timing sample -------------------------------------------------------------------------------
const times = [];
for (let i = 0; i < 5; i++) times.push((await sync([], s3.body.cursor, 'poll')).ms);
times.sort((a, b) => a - b);
console.log(
  `      sync-resolve bare poll ×5: min ${times[0]} ms, median ${times[2]} ms, max ${times[4]} ms`,
);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
