/**
 * P4 live smoke — runs the thesis-critical cold-start path end-to-end against the LINKED
 * hosted project (not a simulator, not local Docker): anonymous sign-in (FR-01) → completed
 * profile insert through RLS → trigger-instantiated beta_cells + seed cluster (File 04 §3),
 * plus the invariant-1 negative (client cannot execute the instantiation function).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines only —
 * never credentials. Leaves one anonymous test user behind (30-day purge policy, Appendix A).
 *
 * Usage: node docs/verification/p4-live-smoke.mjs   (from apps/mobile so supabase-js resolves)
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

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
check('FR-01: anonymous sign-in on the hosted EU project', !authError, authError?.message);
if (authError) process.exit(1);
const uid = authData.user.id;
check('anonymous user is flagged is_anonymous', authData.user.is_anonymous === true);

const { error: profileError } = await supabase.from('profiles').insert({
  user_id: uid,
  timezone: 'Europe/Kyiv',
  working_hours: {
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
  top_categories: ['deep', 'learning'],
  onboarding_completed_at: new Date().toISOString(),
});
check('FR-02: completed profile insert through RLS', !profileError, profileError?.message);

const { data: cells, error: cellsError } = await supabase
  .from('beta_cells')
  .select('category, daypart, day_type, alpha0, beta0, prior_version')
  .eq('user_id', uid);
check(
  'trigger instantiated beta_cells',
  !cellsError && cells?.length === 48,
  cellsError?.message ?? `got ${cells?.length ?? 0} cells`,
);

const cell = (c, d, t) =>
  cells?.find((r) => r.category === c && r.daypart === d && r.day_type === t);
const moWd = cell('deep', 'MO', 'weekday');
check(
  'deep/MO/weekday in-hours: (5.92, 2.08) @ prior_version 0',
  moWd && near(moWd.alpha0, 5.92) && near(moWd.beta0, 2.08) && moWd.prior_version === 0,
  JSON.stringify(moWd),
);
const moWe = cell('deep', 'MO', 'weekend');
check(
  'deep/MO/weekend out-of-hours: (1.29, 0.71)',
  moWe && near(moWe.alpha0, 1.29) && near(moWe.beta0, 0.71),
  JSON.stringify(moWe),
);

const { data: cluster } = await supabase
  .from('cluster_assignments')
  .select('cluster_id, method')
  .eq('user_id', uid);
check(
  'seed cluster = rMEQ class (DM => 0, rmeq_seed)',
  cluster?.length === 1 && cluster[0].cluster_id === 0 && cluster[0].method === 'rmeq_seed',
  JSON.stringify(cluster),
);

const { error: rpcError } = await supabase.rpc('instantiate_user_priors', { p_user_id: uid });
// Specifically permission-denied (42501), not any transport error (adversarial n5).
check(
  'invariant 1: client cannot execute instantiate_user_priors (42501)',
  rpcError?.code === '42501',
  rpcError ? `code=${rpcError.code}` : 'rpc unexpectedly succeeded',
);

const { error: modelWriteError } = await supabase
  .from('beta_cells')
  .update({ succ: 99 })
  .eq('user_id', uid);
const { data: afterWrite } = await supabase
  .from('beta_cells')
  .select('succ')
  .eq('user_id', uid)
  .eq('succ', 99);
check(
  'invariant 1: client cannot write model state',
  modelWriteError != null || afterWrite?.length === 0,
);

await supabase.auth.signOut();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
