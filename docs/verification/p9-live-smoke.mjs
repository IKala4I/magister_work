/**
 * P9 live smoke — the trust surfaces end-to-end against the LINKED hosted project and the
 * deployed RecSys service (the P9 migration applied 2026-08-30):
 *   anonymous sign-in → onboarded profile through RLS → `insights` function (401 without a
 *   token, 404 before onboarding; 200 with the service document: 48 heatmap cells, 8 beliefs,
 *   learning mode, no labels, no PAR weeks, prior provenance, EU region header) → a
 *   `belief_label` ✓ on the deep/morning cell through sync-resolve → the trigger materialised
 *   the `belief_labels` row (id = op_id) → the reward pass delivered it (`delivered_at`) → the
 *   service rebuilt: the cell's evidence equals one prior's worth (succ = α₀ + β₀) → `insights`
 *   shows the label in force and the belief moved from the DM early-morning prior (0.78) to the
 *   labelled morning cell (≈ 0.87), personal, the badge stays on → replay = duplicate, one row → a `none` label
 *   clears the evidence again (rebuild, not a downdate) and the belief returns to EM → a
 *   malformed state_ref fails the op with nothing half-applied → FR-24: two pinned blocks on
 *   one slot → plan-request answers ranked `infeasible.options` with `unpin` first, stored in
 *   plans.telemetry → the decision fact syncs (`applied`).
 *
 * Why the morning cell: one prior's worth of ✓ lifts a cell's mean to (μ₀·n₀ + n₀)/(2n₀) — for
 * MO (μ₀ = 0.74) that is 0.87 > EM's 0.78 prior, so the belief must move; a ✓ on the evening
 * cell (μ₀ = 0.40) only reaches 0.70 and the belief stays at EM. A label weighs one prior, it
 * is not a veto (ADR-0013 §2).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines and
 * timings only — never credentials. Leaves one anonymous test user behind (30-day purge).
 * A missing `belief_labels` table is a FAIL with the reason, never a skip.
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
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const uuid = () => globalThis.crypto.randomUUID();
const pad = (n) => String(n).padStart(12, '0');
const DEVICE = uuid();
let counter = 0;
const opId = () => `${DEVICE}-${pad(++counter)}`;

/** Service-side read through the CLI (postgres role). A parse failure is printed, never hidden. */
function sql(query) {
  const file = join(tmpdir(), `p9-smoke-${uuid()}.sql`);
  writeFileSync(file, query);
  const out = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const json = out.slice(out.indexOf('{')); // the CLI may print notices before the document
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.rows)) throw new Error('no rows array');
    return parsed.rows;
  } catch (err) {
    console.log(`      db query could not be parsed (${err.message}): ${out.slice(0, 200)}`);
    throw err;
  }
}

// --- sign in, function helper --------------------------------------------------------------------
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
const localDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const eventOp = (type, payload, extra = {}) => {
  const id = opId();
  const ts = extra.ts ?? Date.now();
  return {
    op_id: id,
    op_type: 'event_append',
    entity_id: extra.task_id ?? null,
    base_version: null,
    payload: {
      op_id: id,
      user_id: uid,
      type,
      task_id: extra.task_id ?? null,
      recommendation_id: null,
      payload,
      context: { tz: 'Europe/Kyiv' },
      client_ts: ts,
      local_day: localDay(ts),
    },
  };
};
async function sync(ops, cursor, reason = 'write') {
  return fn('sync-resolve', {
    ops,
    cursor,
    reason,
    device_id: DEVICE,
    now: new Date().toISOString(),
  });
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

// --- insights document ---------------------------------------------------------------------------
const tableRow = sql(`select to_regclass('public.belief_labels') is not null as present`)[0];
check(
  'belief_labels exists on the hosted project (P9 migration applied)',
  tableRow?.present === true,
  JSON.stringify(tableRow),
);
const ins1 = await fn('insights', { action: 'get' });
console.log(
  `      insights round trip: ${ins1.ms} ms (service ${ins1.data?.service_ms ?? '—'} ms)`,
);
check('EU region header on insights', ins1.region === 'eu-west-1', String(ins1.region));
const d1 = ins1.data ?? {};
check(
  'insights → 200 with the service document',
  ins1.status === 200,
  `${ins1.status} ${JSON.stringify(ins1.data).slice(0, 120)}`,
);
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
const cellOf = (doc, dp) =>
  doc?.heatmap?.find((c) => c.category === 'deep' && c.daypart === dp && c.day_type === 'weekday');
const deepBeliefOf = (doc) =>
  doc?.beliefs?.find((b) => b.category === 'deep' && b.day_type === 'weekday');
const mo1 = cellOf(d1, 'MO');
check(
  'deep/MO/weekday cell carries the DM prior (mean ≈ 0.74, n_effective 0, not personal)',
  mo1 !== undefined && Math.abs(mo1.mean - 0.74) < 0.02 && mo1.n_effective === 0 && !mo1.personal,
  JSON.stringify(mo1),
);
const b1 = deepBeliefOf(d1);
check(
  'the deep/weekday belief starts at the DM prior peak (EM 0.78), not personal, unlabelled',
  b1?.daypart === 'EM' && b1?.personal === false && b1?.label === null,
  JSON.stringify(b1),
);

// --- belief label round trip -------------------------------------------------------------------
const REF = 'beta:deep.MO.weekday';
const CELL = `user_id = '${uid}' and category = 'deep' and daypart = 'MO' and day_type = 'weekday'`;
const prior = sql(`select alpha0, beta0, succ, fail from public.beta_cells where ${CELL}`)[0];
const w = Number(prior?.alpha0) + Number(prior?.beta0);
check(
  'the cell starts at its prior with no evidence',
  prior !== undefined && Number(prior.succ) === 0 && Number(prior.fail) === 0 && w > 0,
  JSON.stringify(prior),
);

const labelOp = eventOp('belief_label', { state_ref: REF, label: 'correct', surface: 'beliefs' });
const s1 = await sync([labelOp], 0);
check(
  'belief_label op applied',
  s1.status === 200 && s1.data?.acks?.[0]?.outcome === 'applied',
  `${s1.status} ${JSON.stringify(s1.data).slice(0, 200)}`,
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
    row[0].id === labelOp.op_id &&
    row[0].label === 'correct' &&
    row[0].state_ref === REF &&
    row[0].delivered_at !== null,
  JSON.stringify(row),
);
const cell = sql(
  `select alpha0, beta0, succ, fail, last_event_at from public.beta_cells where ${CELL}`,
)[0];
check(
  "service rebuilt: the cell's evidence is one prior's worth (succ = α₀ + β₀, fail = 0)",
  cell !== undefined &&
    Math.abs(Number(cell.succ) - w) < 1e-6 &&
    Number(cell.fail) === 0 &&
    cell.last_event_at !== null,
  JSON.stringify({ w, cell }),
);
const ins2 = await fn('insights', { action: 'get' });
const b2 = deepBeliefOf(ins2.data);
check(
  'insights: the label is in force and the belief moved from EM to the labelled MO cell (≈ 0.87), personal',
  ins2.data?.labels?.length === 1 &&
    ins2.data.labels[0].state_ref === REF &&
    ins2.data.labels[0].label === 'correct' &&
    b2?.daypart === 'MO' &&
    b2?.label === 'correct' &&
    b2?.personal === true &&
    b2?.mean > 0.8,
  JSON.stringify({ labels: ins2.data?.labels, belief: b2 }),
);
const mo2 = cellOf(ins2.data, 'MO');
check(
  'heatmap cell reports n_effective = weight and personal = true',
  mo2 !== undefined && Math.abs(mo2.n_effective - w) < 0.01 && mo2.personal === true,
  JSON.stringify(mo2),
);
check(
  'learning mode stays on: a label is a statement, not an observed day (ADR-0013 §2, amended after the first live run)',
  ins2.data?.learning_mode === true,
  String(ins2.data?.learning_mode),
);

// replaying the same op is a no-op
const s1b = await sync([labelOp], s1.data?.cursor ?? 0);
check(
  'replaying the label op → duplicate, still one row',
  s1b.data?.acks?.[0]?.outcome === 'duplicate' &&
    sql(`select count(*)::int as n from public.belief_labels where user_id = '${uid}'`)[0]?.n === 1,
  JSON.stringify(s1b.data?.acks),
);

// clear it
const clearOp = eventOp('belief_label', { state_ref: REF, label: 'none', surface: 'beliefs' });
const s2 = await sync([clearOp], s1b.data?.cursor ?? 0);
check(
  'a "none" label applied and delivered (rebuild, not a downdate)',
  s2.data?.acks?.[0]?.outcome === 'applied' && s2.data?.rewards?.labels_delivered === 1,
  JSON.stringify(s2.data?.rewards),
);
const cleared = sql(`select succ, fail, last_event_at from public.beta_cells where ${CELL}`)[0];
check(
  'the cell is back to its prior (succ = fail = 0, no event)',
  cleared !== undefined &&
    Number(cleared.succ) === 0 &&
    Number(cleared.fail) === 0 &&
    cleared.last_event_at === null,
  JSON.stringify(cleared),
);
const ins3 = await fn('insights', { action: 'get' });
const b3 = deepBeliefOf(ins3.data);
check(
  'insights: label in force is none → belief back at EM, unlabelled, not personal; learning mode still on',
  ins3.data?.labels?.[0]?.label === 'none' &&
    b3?.daypart === 'EM' &&
    b3?.label === null &&
    b3?.personal === false &&
    ins3.data?.learning_mode === true,
  JSON.stringify({ labels: ins3.data?.labels, belief: b3, lm: ins3.data?.learning_mode }),
);

// vocabulary guard: a bad state_ref fails the op at the event, nothing half-applied
const badOp = eventOp('belief_label', { state_ref: 'beta:deep.XX.weekday', label: 'correct' });
const s3 = await sync([badOp], s2.data?.cursor ?? 0);
check(
  'a malformed state_ref fails the op and leaves no event/label',
  ['error', 'rejected'].includes(s3.data?.acks?.[0]?.outcome) &&
    sql(
      `select count(*)::int as n from public.events where user_id = '${uid}' and op_id = '${badOp.op_id}'`,
    )[0]?.n === 0 &&
    sql(`select count(*)::int as n from public.belief_labels where user_id = '${uid}'`)[0]?.n === 2,
  JSON.stringify(s3.data?.acks),
);

// --- FR-24: two pinned blocks on one slot → infeasible options ----------------------------------
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
  s3.data?.cursor ?? 0,
);
check(
  'two tasks synced',
  sT.status === 200 && sT.data?.acks?.every((a) => a.outcome === 'applied'),
  `${sT.status} ${JSON.stringify(sT.data).slice(0, 200)}`,
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
  const chosen = opts[0];
  const decision = eventOp(
    'tradeoff_decision',
    {
      plan_id: plan2.data?.plan?.id,
      kind: chosen?.kind,
      rank: 1,
      delta_minutes: chosen?.delta_minutes ?? null,
      consequence: chosen?.consequence,
      alternatives: opts.map((o) => ({ kind: o.kind, metric: o.consequence.metric })),
    },
    { task_id: chosen?.task_id ?? T1 },
  );
  const sD = await sync([decision], sT.data?.cursor ?? 0);
  check(
    'tradeoff_decision fact synced (UC-05 post: decision logged)',
    sD.data?.acks?.[0]?.outcome === 'applied',
    `${sD.status} ${JSON.stringify(sD.data).slice(0, 200)}`,
  );
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
