// Live reproduction (hardware pass 2026-09-02): does the deployed service reject the legacy
// timezone id an Android device reports ('Europe/Kiev') while accepting 'Europe/Kyiv'?
// Two throwaway anonymous users, one plan request each, both erased via delete-account.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = Object.fromEntries(
  readFileSync(join(REPO, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const today = new Date();
const planDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][today.getDay()];
async function runFor(timezone) {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: a, error: ae } = await sb.auth.signInAnonymously();
  if (ae) throw ae;
  const uid = a.user.id;
  const { error: pe } = await sb.from('profiles').insert({
    user_id: uid,
    timezone,
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
  if (pe) throw pe;
  const { error: te } = await sb.from('tasks').insert([
    {
      id: crypto.randomUUID(),
      user_id: uid,
      title: 'tz repro',
      category: 'admin',
      est_minutes: 30,
      value: 2,
      splittable: false,
      deadline: null,
      earliest_start: null,
      status: 'inbox',
    },
  ]);
  if (te) throw te;
  const t0 = performance.now();
  const res = await sb.functions.invoke('plan-request', {
    body: { plan_date: planDate, now: new Date().toISOString(), trigger: 'manual' },
  });
  const ms = Math.round(performance.now() - t0);
  let line;
  if (res.error) line = `ERROR ${res.error.message} status=${res.error.context?.status}`;
  else if (res.data?.status !== 'planned') line = `status=${res.data?.status}`;
  else {
    const ef = res.data.plan.telemetry?.ef ?? {};
    line = `engine=${res.data.plan.engine} model=${res.data.plan.model_version} reason=${ef.reason} service_status=${ef.service_status} service_ms=${ef.service_ms} ef.total_ms=${ef.total_ms} blocks=${res.data.recommendations.length}`;
  }
  console.log(`tz=${timezone.padEnd(12)} client_ms=${ms}  ${line}`);
  const del = await sb.functions.invoke('delete-account', { body: { mode: 'self' } });
  console.log(
    `   erased: ${del.error ? 'FAILED ' + del.error.message : (del.data?.status ?? JSON.stringify(del.data))}`,
  );
}
await runFor('Europe/Kiev');
await runFor('Europe/Kyiv');
