/**
 * Plan-budget sweep (hardware pass, 2026-09-02): where does the learned path start missing the
 * edge function's 1.9 s fallback budget, and is it the solver or the round trip? Two full-inbox
 * requests fell back on the device today (1/10 on a half day, 1/1 on a full day).
 *
 * Design: one throwaway anonymous user per inbox size; three INDEPENDENT instances per user on
 * three plan dates whose working hours give a 9 h, 4.5 h and 2 h window (no previous_assignments
 * cross a plan_date, `now` = real now so every tick is workable); learned responses report the
 * service's own solve_ms / build_ms / total_ms plus the function's service_ms / total_ms;
 * timeouts report the function side only. Users erase themselves. Prints a table and writes the
 * rows as JSON. Usage: node docs/verification/hw-plan-budget-sweep.mjs [repeats] [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
const REPEATS = Number(process.argv[2] ?? 2);
const OUT = process.argv[3] ?? null;
const SIZES = (process.env.SWEEP_SIZES ?? '4,8,12,14,16,20').split(',').map(Number);
const SPLITTABLE = process.env.SWEEP_SPLITTABLE === '1';
const DEADLINES = Number(process.env.SWEEP_DEADLINES ?? 0); // first K tasks get a deadline on the plan date's evening
// plan_date → working window that day (minutes from midnight); dates are after today so `now`
// (real) precedes every tick. 2026-09-03 Thu, 09-04 Fri, 09-05 Sat.
const HORIZONS = [
  { label: 'full 9h', planDate: '2026-09-03', key: 'thu', hours: [540, 1080] },
  { label: 'half 4.5h', planDate: '2026-09-04', key: 'fri', hours: [810, 1080] },
  { label: 'short 2h', planDate: '2026-09-05', key: 'sat', hours: [960, 1080] },
];
const CATS = ['admin', 'deep', 'learning', 'physical'];
const MINS = [30, 45, 60, 30, 90, 45];

const rows = [];
async function cell(n, repeat) {
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: a, error: ae } = await sb.auth.signInAnonymously();
  if (ae) throw ae;
  const uid = a.user.id;
  const working_hours = { mon: [540, 1080], tue: [540, 1080], wed: [540, 1080] };
  for (const h of HORIZONS) working_hours[h.key] = h.hours;
  const { error: pe } = await sb.from('profiles').insert({
    user_id: uid,
    timezone: 'Europe/Kyiv',
    working_hours,
    sleep_window: [1380, 420],
    rmeq_score: 24,
    chronotype_class: 'DM',
    survey_skipped: false,
    top_categories: ['deep'],
    onboarding_completed_at: new Date().toISOString(),
  });
  if (pe) throw pe;
  const tasks = Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(),
    user_id: uid,
    title: `sweep task ${i + 1}`,
    category: CATS[i % 4],
    est_minutes: MINS[i % 6],
    value: (i % 3) + 1,
    splittable: false,
    deadline: null,
    earliest_start: null,
    status: 'inbox',
  }));
  const { error: te } = await sb.from('tasks').insert(tasks);
  if (te) throw te;
  for (const h of HORIZONS) {
    const t0 = performance.now();
    const res = await sb.functions.invoke('plan-request', {
      body: { plan_date: h.planDate, now: new Date().toISOString(), trigger: 'manual' },
    });
    const client_ms = Math.round(performance.now() - t0);
    const row = {
      n,
      horizon: h.label,
      repeat,
      client_ms,
      splittable: SPLITTABLE,
      deadlines: DEADLINES,
    };
    if (res.error) Object.assign(row, { outcome: `error ${res.error.context?.status ?? ''}` });
    else if (res.data?.status !== 'planned') Object.assign(row, { outcome: res.data?.status });
    else {
      const p = res.data.plan;
      const ef = p.telemetry?.ef ?? {};
      const svc = p.telemetry?.service ?? null;
      Object.assign(row, {
        outcome: ef.reason,
        engine: p.engine,
        solver_status: p.solver_status,
        ef_total_ms: ef.total_ms,
        ef_service_ms: ef.service_ms,
        svc_total_ms: svc?.total_ms ?? null,
        solve_ms: svc?.solve_ms ?? null,
        build_ms: svc?.build_ms ?? null,
        literals: svc?.literals ?? null,
        degradation: svc?.degradation ?? null,
        solves: svc?.solves ?? null,
        recs: res.data.recommendations.length,
        unplaced: res.data.unplaced.length,
      });
    }
    rows.push(row);
    const f = (v) => (v === null || v === undefined ? '-' : String(v)).padStart(5);
    console.log(
      `n=${String(n).padStart(2)} ${h.label.padEnd(9)} r${repeat}  ${String(row.outcome ?? '').padEnd(16)} ${String(row.solver_status ?? '').padEnd(9)} ef ${f(row.ef_total_ms)} svc-call ${f(row.ef_service_ms)} svc ${f(row.svc_total_ms)} solve ${f(row.solve_ms)} build ${f(row.build_ms)} lit ${f(row.literals)} recs ${f(row.recs)}/${n} client ${f(client_ms)}`,
    );
  }
  const del = await sb.functions.invoke('delete-account', { body: { mode: 'self' } });
  if (del.error || del.data?.status !== 'deleted')
    console.log(
      `   !! erase failed for n=${n} r${repeat}: ${del.error?.message ?? JSON.stringify(del.data)}`,
    );
}
for (let r = 1; r <= REPEATS; r += 1) for (const n of SIZES) await cell(n, r);
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1));
const to = rows.filter((x) => String(x.outcome).startsWith('fallback'));
console.log(
  `\n${rows.length} requests, ${to.length} fell back: ${to.map((x) => `n=${x.n} ${x.horizon} r${x.repeat}`).join('; ') || 'none'}`,
);
