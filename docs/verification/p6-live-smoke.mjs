/**
 * P6 live smoke — the plan flow end-to-end against the LINKED hosted project: anonymous
 * sign-in → completed profile (RLS) → tasks through RLS (what the client's task-push bridge
 * does) → `plan-request` edge function → plan + recommendation rows readable by the owner
 * only → a second request supersedes the first (`expired`) → empty-inbox path → rate limit
 * shape. Also times each round trip (client-measured, NFR-P1 accounting) — with no RECSYS_URL
 * secret set this exercises the NFR-R2 fallback (`fallback:not_configured`) end to end; the
 * learned path is measured once the HF Space exists.
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines and
 * timings only — never credentials. Leaves one anonymous test user behind (30-day purge).
 *
 * Usage: node docs/verification/p6-live-smoke.mjs [runs]   (from apps/mobile so supabase-js resolves)
 */
import { readFileSync } from 'node:fs';
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
const RUNS = Number(process.argv[2] ?? 5);

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
// Plan TOMORROW: a smoke run late in the day would find today's hours in the past (zero
// placements is correct then, but proves less). Tomorrow's grid is fully ahead of `now`.
const today = new Date();
today.setDate(today.getDate() + 1);
const planDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][today.getDay()];

const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
check('anonymous sign-in on the hosted project', !authError, authError?.message);
if (authError) process.exit(1);
const uid = authData.user.id;

// 404 before a profile exists
const before = await supabase.functions.invoke('plan-request', { body: { plan_date: planDate } });
check(
  'plan-request without a profile → 404 profile_not_found',
  before.error?.context?.status === 404,
  String(before.error?.context?.status),
);

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

// empty inbox path
const empty = await supabase.functions.invoke('plan-request', { body: { plan_date: planDate } });
check(
  'empty inbox → status empty_inbox, no plan row',
  !empty.error && empty.data?.status === 'empty_inbox',
  empty.error?.message,
);

// tasks through RLS (the client's task-push bridge)
const ids = ['a', 'b', 'c', 'd'].map(() => crypto.randomUUID());
// PostgREST bulk inserts null-fill missing keys across rows — send every column explicitly.
const taskRow = (id, title, category, est_minutes, value, splittable) => ({
  id,
  user_id: uid,
  title,
  category,
  est_minutes,
  value,
  splittable,
  deadline: null,
  earliest_start: null,
  status: 'inbox',
});
const { error: taskError } = await supabase
  .from('tasks')
  .insert([
    taskRow(ids[0], 'smoke deep', 'deep', 90, 3, false),
    taskRow(ids[1], 'smoke admin', 'admin', 30, 1, false),
    taskRow(ids[2], 'smoke learn', 'learning', 60, 2, true),
    taskRow(ids[3], 'smoke phys', 'physical', 45, 2, false),
  ]);
check('tasks insert through RLS', !taskError, taskError?.message);

const timings = [];
let first = null;
let second = null;
let last = null;
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now();
  const res = await supabase.functions.invoke('plan-request', {
    body: { plan_date: planDate, now: new Date().toISOString(), trigger: 'manual' },
  });
  const ms = Math.round(performance.now() - t0);
  timings.push(ms);
  if (res.error) {
    check(
      `plan-request run ${i + 1}`,
      false,
      `${res.error.message} (${res.error.context?.status})`,
    );
    continue;
  }
  if (i === 0) first = res.data;
  if (i === 1) second = res.data;
  last = res.data;
}
check('plan-request answers `planned`', first?.status === 'planned');
if (first?.status === 'planned') {
  const ef = first.plan.telemetry?.ef ?? {};
  console.log(
    `      engine=${first.plan.engine} model=${first.plan.model_version} reason=${ef.reason} ef.total_ms=${ef.total_ms} blocks=${first.recommendations.length} unplaced=${first.unplaced.length}`,
  );
  check(
    'every assignment field persisted (features 17, bucket, rationale key, engine, model_version)',
    first.recommendations.every(
      (r) =>
        Array.isArray(r.features) &&
        r.features.length === 17 &&
        r.context_bucket &&
        r.rationale_key &&
        r.engine &&
        r.model_version,
    ),
  );
  const exp = first.recommendations.filter((r) => r.is_experiment);
  check(
    'at most one experiment row; propensity ∈ {1/2, 1/3, 1/4} exactly (double precision); others null',
    exp.length <= 1 &&
      exp.every((r) => [0.5, 1 / 3, 0.25].some((p) => Math.abs(r.propensity - p) < 1e-12)) &&
      first.recommendations.filter((r) => !r.is_experiment).every((r) => r.propensity === null),
  );
  check(
    'experiment telemetry carries A_m(x)',
    exp.length === 0 ||
      (Array.isArray(ef.experiment?.top_m) && ef.experiment.top_m.includes(exp[0].context_bucket)),
  );
  check(
    'heuristic rows carry NULL q_hat/confidence (no fabricated estimate)',
    first.plan.engine !== 'heuristic' ||
      first.recommendations.every((r) => r.q_hat === null && r.confidence === null),
  );
}
if (second?.status === 'planned') {
  check(
    're-plan supersedes the first plan (expired ids returned)',
    second.expired_recommendation_ids.length === first.recommendations.length,
  );
  const { data: rows } = await supabase
    .from('recommendations')
    .select('id, status, plan_id')
    .eq('user_id', uid);
  const expiredCount = rows.filter(
    (r) => r.plan_id === first.plan.id && r.status === 'expired',
  ).length;
  check(
    'owner reads own rows through RLS; superseded rows are `expired`',
    expiredCount === first.recommendations.length,
    `${expiredCount}/${first.recommendations.length}`,
  );
  const { data: planRows } = await supabase
    .from('plans')
    .select('id, engine, arm, telemetry')
    .eq('user_id', uid);
  check('plans rows readable by the owner', planRows.length >= 2);
  // probe the LAST plan: its rows are still `shown` (earlier runs' rows were superseded)
  const target = last.recommendations[0]?.id;
  const { data: expireData, error: expireErr } = await supabase
    .from('recommendations')
    .update({ status: 'expired' })
    .eq('id', target)
    .select('id, status');
  check(
    'client cannot set a server-side status (trigger)',
    expireErr !== null,
    `no error; rows returned ${JSON.stringify(expireData)} for id ${target}`,
  );
  const { data: acceptData, error: acceptErr } = await supabase
    .from('recommendations')
    .update({ status: 'accepted' })
    .eq('id', last.recommendations[1]?.id)
    .select('id, status');
  check(
    'client CAN move a shown row to accepted (plan-review state)',
    acceptErr === null && acceptData?.[0]?.status === 'accepted',
    acceptErr?.message ?? JSON.stringify(acceptData),
  );
}
console.log(
  `      timings ms: ${timings.join(', ')} → p50 ${pct(timings, 50)} p95 ${pct(timings, 95)} (client → edge function → response, ${RUNS} runs, fallback path unless RECSYS_URL is set)`,
);

// another user sees nothing
const other = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await other.auth.signInAnonymously();
const { data: leak } = await other.from('recommendations').select('id').eq('user_id', uid);
check('another user cannot read the rows (RLS)', (leak ?? []).length === 0);

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
