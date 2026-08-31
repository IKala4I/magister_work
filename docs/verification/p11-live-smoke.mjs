/**
 * P11 live smoke — training/registry/study server contract against the LINKED hosted project
 * (ADR-0015; needs the P11 migration applied):
 *   migration objects (cluster_cells + RLS, private `models` bucket, the φ CHECK, priors v0
 *   promoted, both RPCs present and revoked from clients) → anonymous sign-in → onboarded
 *   profile through RLS → instantiation live on the PROMOTED version (48 cells, prior_version
 *   = the highest promoted priors version) → service-side `enroll_participant` (4 phases,
 *   BABA dates + arms, research_cohort + eu_eea stamped, re-enrollment raises) →
 *   `diagnose_user` (counts only, task title never in the payload, unknown e-mail raises) →
 *   cleanup (direct auth.users delete; the cascade is P10's proven ground).
 *
 * The full behavioural matrix (gate inert/takes-over, vocabulary refusals) re-runs live,
 * rolled back, via: scripts/pgtap-linked.sh supabase/tests/p11_training_test.sql
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines only.
 * Usage: node docs/verification/p11-live-smoke.mjs   (from apps/mobile so supabase-js resolves)
 */
/* global fetch */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { dbQuery } from './lib/db-query.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  readFileSync(join(repoRoot, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};

/** Service-side SQL through the CLI (postgres role) — the shared shape-tolerant parser. */
function sql(query) {
  try {
    return { rows: dbQuery(repoRoot, query, { prefix: 'p11-smoke' }), error: null };
  } catch (err) {
    return { rows: [], error: String(err.message ?? err) };
  }
}

// --- §1 migration objects ------------------------------------------------------------------------
const objects = sql(`
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_name = 'cluster_cells')::int as cluster_cells,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'cluster_cells')::int as cc_policies,
    (select count(*) from storage.buckets where id = 'models' and not public)::int as bucket,
    (select count(*) from pg_constraint
      where conname = 'recommendations_context_bucket_check')::int as phi_check,
    (select count(*) from public.model_registry
      where kind = 'priors' and version = '0' and promoted)::int as v0,
    (select has_function_privilege('authenticated',
      'public.enroll_participant(uuid, text, boolean, date)', 'execute'))::bool as enroll_priv,
    (select has_function_privilege('anon', 'public.diagnose_user(text)', 'execute'))::bool as diag_priv
`).rows[0];
check('cluster_cells exists', objects?.cluster_cells === 1, JSON.stringify(objects));
check('cluster_cells has no policies (service-only)', objects?.cc_policies === 0);
check('private models bucket exists', objects?.bucket === 1);
check('phi vocabulary CHECK present', objects?.phi_check === 1);
check('seed priors v0 promoted in the registry', objects?.v0 === 1);
check('clients cannot execute enroll_participant', objects?.enroll_priv === false);
check('anon cannot execute diagnose_user', objects?.diag_priv === false);

// --- §2 a live user through RLS ------------------------------------------------------------------
const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
check('anonymous sign-in on the hosted project', !authError, authError?.message);
if (authError) process.exit(1);
const uid = authData.user.id;
const { error: profErr } = await supabase.from('profiles').insert({
  user_id: uid,
  timezone: 'Europe/Kyiv',
  working_hours: {
    mon: [540, 1080],
    tue: [540, 1080],
    wed: [540, 1080],
    thu: [540, 1080],
    fri: [540, 1080],
  },
  rmeq_score: 14,
  chronotype_class: 'INT',
  survey_skipped: false,
  onboarding_completed_at: new Date().toISOString(),
});
check('onboarded profile through RLS', !profErr, profErr?.message);
const inst = sql(`
  select count(*)::int as n, min(prior_version)::int as v_min, max(prior_version)::int as v_max,
         (select max(pc.version) from public.prior_cells pc
            join public.model_registry mr on mr.kind = 'priors' and mr.promoted
             and mr.version = pc.version::text)::int as promoted_v
    from public.beta_cells where user_id = '${uid}'
`).rows[0];
check('instantiation live: 48 cells', inst?.n === 48, JSON.stringify(inst));
check(
  'cells seeded from the highest PROMOTED version (ADR-0015 §7 live)',
  inst && inst.v_min === inst.promoted_v && inst.v_max === inst.promoted_v,
  JSON.stringify(inst),
);

// --- §3 enrollment (service-side; File 06 §1.2) --------------------------------------------------
sql(`update auth.users set email = 'p11smoke@test.local' where id = '${uid}'`);
const enrolled = sql(
  `select public.enroll_participant('${uid}', 'BABA', false, date '2026-10-05') as n`,
).rows[0];
check('enroll_participant writes four phases', enrolled?.n === 4, JSON.stringify(enrolled));
const phases = sql(`
  select string_agg(arm, '' order by phase_no) as arms,
         min(starts_on)::text as first_start, max(ends_on)::text as last_end
    from public.study_assignments where user_id = '${uid}'
`).rows[0];
check('BABA arms in phase order', phases?.arms === 'BABA', JSON.stringify(phases));
check(
  'phases span 8 contiguous weeks',
  phases?.first_start === '2026-10-05' && phases?.last_end === '2026-11-29',
  JSON.stringify(phases),
);
const flags = sql(
  `select research_cohort, eu_eea_resident from public.profiles where user_id = '${uid}'`,
).rows[0];
check(
  'research_cohort + the G6 answer stamped',
  flags?.research_cohort === true && flags?.eu_eea_resident === false,
  JSON.stringify(flags),
);
const reEnroll = sql(
  `select public.enroll_participant('${uid}', 'ABAB', false, date '2026-10-05')`,
);
check('re-enrollment raises', reEnroll.error !== null && /already enrolled/.test(reEnroll.error));

// --- §4 diagnose_user: counts only ---------------------------------------------------------------
const { error: taskErr } = await supabase.from('tasks').insert({
  id: crypto.randomUUID(),
  user_id: uid,
  title: 'P11-SMOKE-SECRET-TITLE',
  category: 'deep',
  est_minutes: 30,
  value: 1,
});
check('a task with a sentinel title exists', !taskErr, taskErr?.message);
const diag = sql(`select public.diagnose_user('p11smoke@test.local') as d`).rows[0];
check(
  'diagnose_user answers counts',
  diag?.d && diag.d.tasks === 1 && diag.d.study?.enrolled === true,
  JSON.stringify(diag)?.slice(0, 200),
);
check('diagnose_user never leaks the title', diag?.d && !JSON.stringify(diag.d).includes('SECRET'));
const unknown = sql(`select public.diagnose_user('nobody-p11@test.local')`);
check('unknown e-mail raises', unknown.error !== null && /no user/.test(unknown.error));

// --- §5 cleanup ----------------------------------------------------------------------------------
sql(`delete from auth.users where id = '${uid}'`);
const gone = sql(
  `select (select count(*) from public.profiles where user_id = '${uid}')::int
        + (select count(*) from public.study_assignments where user_id = '${uid}')::int as n`,
).rows[0];
check('cleanup: the smoke user is gone everywhere', gone?.n === 0, JSON.stringify(gone));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
