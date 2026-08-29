/**
 * P9 live smoke — the trust surfaces end-to-end against the LINKED hosted project and the
 * deployed RecSys service:
 *   anonymous sign-in → onboarded profile through RLS → `insights` function (401 without a
 *   token; 200 with the service document: 48 heatmap cells, 8 beliefs, learning mode, labels
 *   empty, PAR weeks empty, EU region header) → a `belief_label` fact through sync-resolve →
 *   the trigger materialised a `belief_labels` row → the reward pass delivered it to `/labels`
 *   (delivered_at set) → the service rebuilt: the cell's evidence equals one prior's worth
 *   (α₀ + β₀) → `insights` shows the label in force, the belief personal → a `none` label
 *   clears the evidence again → FR-24: two pinned blocks on the same slot → plan-request answers
 *   `infeasible.options` ranked with `unpin` first → the decision fact syncs (`applied`).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL/SKIP lines and
 * timings only — never credentials. Leaves one anonymous test user behind (30-day purge).
 * The label checks SKIP (with the reason) while the P9 migration is not on the hosted project.
 *
 * Usage: node docs/verification/p9-live-smoke.mjs   (from apps/mobile so supabase-js resolves)
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
let skips = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const skip = (name, why) => {
  skips += 1;
  console.log(`SKIP  ${name} — ${why}`);
};
const uuid = () => globalThis.crypto.randomUUID();
const pad = (n) => String(n).padStart(12, '0');
const DEVICE = uuid();
let counter = 0;
const opId = () => `${DEVICE}-${pad(++counter)}`;

/** Service-side read/write through the CLI (postgres role). */
function sql(query) {
  const file = join(tmpdir(), `p9-smoke-${uuid()}.sql`);
  writeFileSync(file, query);
  const out = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
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

const headers = {
  'content-type': 'application/json',
  apikey: ANON,
  authorization: `Bearer ${jwt}`,
  'x-region': 'eu-west-1',
};
async function fn(name, body, withAuth = true) {
  const t0 = Date.now();
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: withAuth ? headers : { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms, region: res.headers.get('x-sb-edge-region') };
}

const noToken = await fn('insights', { action: 'get' }, false);
check('insights without a session → 401', noToken.status === 401, String(noToken.status));
const noProfile = await fn('insights', { action: 'get' });
check(
  'insights before onboarding → 404 profile_missing',
  noProfile.status === 404,
  String(noProfile.status),
);

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
check(
  'profile insert through RLS (priors instantiated by trigger)',
  !profileError,
  profileError?.message,
);

// --- insights document -----------------------------------------------------------------------
const ins1 = await fn('insights', { action: 'get' });
check(
  'insights → 200 with the service document',
  ins1.status === 200,
  `${ins1.status} ${JSON.stringify(ins1.data).slice(0, 120)}`,
);
console.log(`      insights round trip: ${ins1.ms} ms (service ${ins1.data?.service_ms} ms)`);
check('EU region header on insights', ins1.region === 'eu-west-1', String(ins1.region));
const d1 = ins1.data ?? {};
check(
  '48 heatmap cells (4 categories × 6 dayparts × 2 day types)',
  d1.heatmap?.length === 48,
  String(d1.heatmap?.length),
);
check(
  '8 beliefs (one per category × day type), none labelled',
  d1.beliefs?.length === 8 && d1.beliefs.every((b) => b.label === null),
  JSON.stringify(d1.beliefs?.map((b) => b.label)),
);
check(
  'learning mode on for a fresh user; no labels; no adherence weeks yet',
  d1.learning_mode === true && d1.labels?.length === 0 && d1.adherence?.length === 0,
  JSON.stringify({ lm: d1.learning_mode, labels: d1.labels?.length, adh: d1.adherence?.length }),
);
check(
  'chronotype provenance = DM (from the profile)',
  d1.chronotype_class === 'DM' && d1.survey_skipped === false,
  String(d1.chronotype_class),
);
const deepMorning = d1.heatmap?.find(
  (c) => c.category === 'deep' && c.daypart === 'MO' && c.day_type === 'weekday',
);
check(
  'deep/MO/weekday cell carries the DM prior (mean ≈ 0.74, n_effective 0, not personal)',
  deepMorning !== undefined &&
    Math.abs(deepMorning.mean - 0.74) < 0.02 &&
    deepMorning.n_effective === 0 &&
    deepMorning.personal === false,
  JSON.stringify(deepMorning),
);

// --- belief label round trip -----------------------------------------------------------------
async function sync(ops, cursor, reason = 'write') {
  const r = await fn('sync-resolve', {
    ops,
    cursor,
    reason,
    device_id: DEVICE,
    now: new Date().toISOString(),
  });
  return r;
}
const hasTable =
  sql(`select to_regclass('public.belief_labels') is not null as present`)[0]?.present === true;
const REF = 'beta:deep.EV.weekday'; // an out-of-hours-for-DM cell: the prior is weak there (n₀ = 4 h)
const prior = sql(
  `select alpha0, beta0, succ, fail from public.beta_cells where user_id = '${uid}' and category = 'deep' and daypart = 'EV' and day_type = 'weekday'`,
)[0];
if (!hasTable) {
  skip(
    'belief_label fact → trigger row → /labels delivery → rebuild → insights',
    'P9 migration not on the hosted project yet (⛔ supabase db push --linked)',
  );
} else {
  const labelOp = opId();
  const ts = Date.now();
  const s1 = await sync(
    [
      {
        op_id: labelOp,
        op_type: 'event_append',
        entity_id: null,
        base_version: null,
        payload: {
          op_id: labelOp,
          user_id: uid,
          type: 'belief_label',
          task_id: null,
          recommendation_id: null,
          payload: { state_ref: REF, label: 'correct', surface: 'beliefs' },
          context: { tz: 'Europe/Kyiv' },
          client_ts: ts,
          local_day: new Date(ts).toISOString().slice(0, 10),
        },
      },
    ],
    0,
  );
  check(
    'belief_label op applied',
    s1.status === 200 && s1.data?.acks?.[0]?.outcome === 'applied',
    JSON.stringify(s1.data?.acks ?? s1.data).slice(0, 200),
  );
  check(
    'reward pass ran and delivered 1 label',
    s1.data?.rewards?.labels_delivered === 1,
    JSON.stringify(s1.data?.rewards),
  );
  const row = sql(
    `select id, label, state_ref, delivered_at, source from public.belief_labels where user_id = '${uid}'`,
  );
  check(
    'belief_labels row materialised by the trigger with the op_id and marked delivered',
    row.length === 1 &&
      row[0].id === labelOp &&
      row[0].label === 'correct' &&
      row[0].delivered_at !== null,
    JSON.stringify(row),
  );
  const cell = sql(
    `select alpha0, beta0, succ, fail, last_event_at from public.beta_cells where user_id = '${uid}' and category = 'deep' and daypart = 'EV' and day_type = 'weekday'`,
  )[0];
  const w = Number(cell?.alpha0) + Number(cell?.beta0);
  check(
    "service rebuilt: the cell's evidence is one prior's worth (succ = α₀ + β₀, fail = 0)",
    cell !== undefined &&
      Math.abs(Number(cell.succ) - w) < 1e-6 &&
      Number(cell.fail) === 0 &&
      cell.last_event_at !== null,
    JSON.stringify({ prior, cell }),
  );
  const ins2 = await fn('insights', { action: 'get' });
  const belief = ins2.data?.beliefs?.find((b) => b.category === 'deep' && b.day_type === 'weekday');
  check(
    'insights shows the label in force and the belief as personal',
    ins2.data?.labels?.[0]?.state_ref === REF &&
      ins2.data?.labels?.[0]?.label === 'correct' &&
      belief?.label === 'correct' &&
      belief?.personal === true,
    JSON.stringify({ labels: ins2.data?.labels, belief }),
  );
  check(
    'the labelled cell now favours the evening (label moved the belief)',
    belief?.daypart === 'EV',
    String(belief?.daypart),
  );
  const evCell = ins2.data?.heatmap?.find(
    (c) => c.category === 'deep' && c.daypart === 'EV' && c.day_type === 'weekday',
  );
  check(
    'heatmap cell reports n_effective = weight and personal = true',
    evCell !== undefined && Math.abs(evCell.n_effective - w) < 0.01 && evCell.personal === true,
    JSON.stringify(evCell),
  );
  // replaying the same op is a no-op (idempotent)
  const s1b = await sync(
    [
      {
        op_id: labelOp,
        op_type: 'event_append',
        entity_id: null,
        base_version: null,
        payload: {
          op_id: labelOp,
          user_id: uid,
          type: 'belief_label',
          task_id: null,
          recommendation_id: null,
          payload: { state_ref: REF, label: 'correct', surface: 'beliefs' },
          context: {},
          client_ts: ts,
          local_day: new Date(ts).toISOString().slice(0, 10),
        },
      },
    ],
    s1.data?.cursor ?? 0,
  );
  check(
    'replaying the label op → duplicate, still one row',
    s1b.data?.acks?.[0]?.outcome === 'duplicate' &&
      sql(`select count(*)::int as n from public.belief_labels where user_id = '${uid}'`)[0]?.n ===
        1,
    JSON.stringify(s1b.data?.acks),
  );
  // clear it
  const clearOp = opId();
  const ts2 = Date.now();
  const s2 = await sync(
    [
      {
        op_id: clearOp,
        op_type: 'event_append',
        entity_id: null,
        base_version: null,
        payload: {
          op_id: clearOp,
          user_id: uid,
          type: 'belief_label',
          task_id: null,
          recommendation_id: null,
          payload: { state_ref: REF, label: 'none', surface: 'beliefs' },
          context: {},
          client_ts: ts2,
          local_day: new Date(ts2).toISOString().slice(0, 10),
        },
      },
    ],
    s1b.data?.cursor ?? 0,
  );
  check(
    'a "none" label applied and delivered (rebuild, not a downdate)',
    s2.data?.acks?.[0]?.outcome === 'applied' && s2.data?.rewards?.labels_delivered === 1,
    JSON.stringify(s2.data?.rewards),
  );
  const cleared = sql(
    `select succ, fail, last_event_at from public.beta_cells where user_id = '${uid}' and category = 'deep' and daypart = 'EV' and day_type = 'weekday'`,
  )[0];
  check(
    'the cell is back to its prior (succ = fail = 0, no event)',
    cleared !== undefined &&
      Number(cleared.succ) === 0 &&
      Number(cleared.fail) === 0 &&
      cleared.last_event_at === null,
    JSON.stringify(cleared),
  );
  const ins3 = await fn('insights', { action: 'get' });
  check(
    'insights: label in force is none → belief unlabelled, not personal',
    ins3.data?.labels?.[0]?.label === 'none' &&
      ins3.data?.beliefs?.find((b) => b.category === 'deep' && b.day_type === 'weekday')?.label ===
        null,
    JSON.stringify(ins3.data?.labels),
  );
  // vocabulary guard: a bad state_ref is rejected at the event, nothing half-applied
  const badOp = opId();
  const s3 = await sync(
    [
      {
        op_id: badOp,
        op_type: 'event_append',
        entity_id: null,
        base_version: null,
        payload: {
          op_id: badOp,
          user_id: uid,
          type: 'belief_label',
          task_id: null,
          recommendation_id: null,
          payload: { state_ref: 'beta:deep.XX.weekday', label: 'correct' },
          context: {},
          client_ts: Date.now(),
          local_day: new Date().toISOString().slice(0, 10),
        },
      },
    ],
    s2.data?.cursor ?? 0,
  );
  check(
    'a malformed state_ref fails the op and leaves no event/label',
    ['error', 'rejected'].includes(s3.data?.acks?.[0]?.outcome) &&
      sql(
        `select count(*)::int as n from public.events where user_id = '${uid}' and op_id = '${badOp}'`,
      )[0]?.n === 0,
    JSON.stringify(s3.data?.acks),
  );
}

// --- FR-24: two pinned blocks on one slot → infeasible options ------------------------------
const nowMs = Date.now();
const task = (id, title, category, est) => ({
  id,
  user_id: uid,
  title,
  category,
  est_minutes: est,
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
});
const T1 = uuid();
const T2 = uuid();
const sT = await sync(
  [
    {
      op_id: opId(),
      op_type: 'task_upsert',
      entity_id: T1,
      base_version: null,
      payload: task(T1, 'Slides', 'deep', 60),
    },
    {
      op_id: opId(),
      op_type: 'task_upsert',
      entity_id: T2,
      base_version: null,
      payload: task(T2, 'Reading', 'learning', 60),
    },
  ],
  0,
);
check(
  'two tasks synced',
  sT.status === 200 && sT.data?.acks?.every((a) => a.outcome === 'applied'),
  JSON.stringify(sT.data?.acks),
);
const plan1 = await fn('plan-request', {
  plan_date: planDate,
  horizon: 'day',
  now: new Date().toISOString(),
  trigger: 'manual',
});
check(
  'plan-request planned both tasks',
  plan1.status === 200 &&
    plan1.data?.status === 'planned' &&
    plan1.data.recommendations.length >= 2,
  `${plan1.status} ${JSON.stringify(plan1.data).slice(0, 160)}`,
);
console.log(
  `      plan-request round trip: ${plan1.ms} ms (engine ${plan1.data?.plan?.engine}, ${plan1.data?.plan?.telemetry?.ef?.reason})`,
);
if (plan1.data?.status === 'planned') {
  const r1 = plan1.data.recommendations.find((r) => r.task_id === T1);
  const r2 = plan1.data.recommendations.find((r) => r.task_id === T2);
  // pin both on r1's slot (what two "pin" reviews on overlapping moves would leave behind)
  sql(`update public.recommendations set status = 'pinned' where user_id = '${uid}' and id in ('${r1.id}', '${r2.id}');
update public.recommendations set slot_start = '${r1.slot_start}', slot_end = '${r1.slot_end}' where user_id = '${uid}' and id = '${r2.id}';`);
  const plan2 = await fn('plan-request', {
    plan_date: planDate,
    horizon: 'day',
    now: new Date().toISOString(),
    trigger: 'manual',
  });
  const opts = plan2.data?.infeasible?.options ?? [];
  check(
    're-plan with two pins on one slot → infeasible options (FR-24), unpin first',
    plan2.status === 200 && opts.length > 0 && opts[0].kind === 'unpin',
    `${plan2.status} ${JSON.stringify(plan2.data?.infeasible ?? plan2.data).slice(0, 200)}`,
  );
  check(
    'options are stored in plans.telemetry.infeasible (what the sheet reads)',
    Array.isArray(plan2.data?.plan?.telemetry?.infeasible?.options) &&
      plan2.data.plan.telemetry.infeasible.options.length === opts.length,
    JSON.stringify(plan2.data?.plan?.telemetry?.infeasible).slice(0, 120),
  );
  const decOp = opId();
  const chosen = opts[0];
  const sD = await sync(
    [
      {
        op_id: decOp,
        op_type: 'event_append',
        entity_id: chosen?.task_id ?? T1,
        base_version: null,
        payload: {
          op_id: decOp,
          user_id: uid,
          type: 'tradeoff_decision',
          task_id: chosen?.task_id ?? T1,
          recommendation_id: null,
          payload: {
            plan_id: plan2.data?.plan?.id,
            kind: chosen?.kind,
            rank: 1,
            delta_minutes: chosen?.delta_minutes ?? null,
            consequence: chosen?.consequence,
            alternatives: opts.map((o) => ({ kind: o.kind, metric: o.consequence.metric })),
          },
          context: { tz: 'Europe/Kyiv' },
          client_ts: Date.now(),
          local_day: new Date().toISOString().slice(0, 10),
        },
      },
    ],
    sT.data?.cursor ?? 0,
  );
  check(
    'tradeoff_decision fact synced (UC-05 post: decision logged)',
    sD.data?.acks?.[0]?.outcome === 'applied',
    JSON.stringify(sD.data?.acks),
  );
}

console.log(
  `\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}${skips ? ` (${skips} skipped)` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
