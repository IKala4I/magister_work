/**
 * P10 performance probe — NFR-P3 (core read/write API ≤ 300 ms p95, excluding the ML planning
 * endpoint) and NFR-P1 (plan ≤ 2.5 s p95 warm) measured FROM NODE ON THIS MACHINE against the
 * hosted project (EU) and the live RecSys service. These are wire numbers for the server half:
 * TLS handshake reuse, no radio wake-up, no JS bridge — a handset adds its own share
 * (device-checklist.md). Prints p50/p95 per endpoint; never a credential.
 *
 *   sync-resolve  empty push + pull (the P8 round trip, the "core write/read API")   × N
 *   insights      the P9 document (service hop + PAR)                                × N
 *   export-data   the FR-42 document (small user)                                    × N/2
 *   plan-request  learned path on a 5-task inbox (NFR-P1, warm)                       × 5
 *
 * Usage: node docs/verification/p10-perf.mjs [N=20]   (from apps/mobile so supabase-js resolves)
 * Leaves one anonymous test user behind (30-day inactivity purge, ADR-0014 §10).
 */
/* global fetch */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const N = Number(process.argv[2] ?? 20);
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
const uuid = () => globalThis.crypto.randomUUID();
const DEVICE = uuid();
let counter = 0;
const opId = () => `${DEVICE}-${String(++counter).padStart(12, '0')}`;
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};

const { data: auth, error } = await supabase.auth.signInAnonymously();
if (error) throw new Error(`sign-in: ${error.message}`);
const uid = auth.user.id;
const headers = {
  'content-type': 'application/json',
  apikey: ANON,
  authorization: `Bearer ${auth.session.access_token}`,
  'x-region': 'eu-west-1',
};
async function fn(name, body) {
  const t0 = performance.now();
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms: performance.now() - t0 };
}
const today = new Date();
const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][today.getDay()];
const { error: pe } = await supabase.from('profiles').insert({
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
if (pe) throw new Error(`profile: ${pe.message}`);
const nowIso = new Date().toISOString();
const taskOps = Array.from({ length: 5 }, (_, i) => {
  const id = uuid();
  return {
    op_id: opId(),
    op_type: 'task_upsert',
    entity_id: id,
    base_version: null,
    payload: {
      id,
      user_id: uid,
      title: `Task ${i}`,
      category: ['deep', 'admin', 'learning', 'deep', 'physical'][i],
      est_minutes: 45 + i * 15,
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
      created_at: nowIso,
      updated_at: nowIso,
    },
  };
});
const seeded = await fn('sync-resolve', {
  ops: taskOps,
  cursor: 0,
  reason: 'write',
  device_id: DEVICE,
  now: nowIso,
});
if (seeded.status !== 200)
  throw new Error(`seed: ${seeded.status} ${JSON.stringify(seeded.data).slice(0, 200)}`);
let cursor = seeded.data.cursor ?? 0;

async function rest(method, pathAndQuery, body) {
  const t0 = performance.now();
  const res = await fetch(`${URL_}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...headers, prefer: 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await res.text();
  return { status: res.status === 204 ? 200 : res.status, ms: performance.now() - t0 };
}
async function floor() {
  const t0 = performance.now();
  const res = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: ANON } });
  await res.text();
  return { status: res.status, ms: performance.now() - t0 };
}

const rows = [];
async function series(name, n, call, budgetMs) {
  const ms = [];
  let bad = 0;
  for (let i = 0; i < n; i += 1) {
    const r = await call();
    if (r.status !== 200) bad += 1;
    ms.push(r.ms);
  }
  const p50 = q(ms, 0.5);
  const p95 = q(ms, 0.95);
  rows.push({
    endpoint: name,
    n,
    p50: Math.round(p50),
    p95: Math.round(p95),
    max: Math.round(Math.max(...ms)),
    non200: bad,
    budget: budgetMs,
    ok: p95 <= budgetMs,
  });
}
await series('floor: GET /auth/v1/health', N, floor, 300);
await series(
  'rest read: GET tasks?select=id&limit=1',
  N,
  () => rest('GET', 'tasks?select=id&limit=1'),
  300,
);
await series(
  'rest write: PATCH profiles.locale',
  N,
  () => rest('PATCH', `profiles?user_id=eq.${uid}`, { locale: 'en' }),
  300,
);
await series(
  'sync-resolve (empty push + pull)',
  N,
  () =>
    fn('sync-resolve', {
      ops: [],
      cursor,
      reason: 'poll',
      device_id: DEVICE,
      now: new Date().toISOString(),
    }),
  300,
);
await series('insights', N, () => fn('insights', { action: 'get' }), 300);
await series('export-data', Math.max(3, Math.floor(N / 2)), () => fn('export-data', {}), 300);
const planDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await series(
  'plan-request (learned, 5 tasks, warm)',
  5,
  () =>
    fn('plan-request', { plan_date: planDate, trigger: 'manual', now: new Date().toISOString() }),
  2500,
);

console.log(
  `\nP10 perf probe — Node on this machine → hosted project (eu-west-1), ${new Date().toISOString()}`,
);
console.log('| endpoint | n | p50 ms | p95 ms | max ms | non-200 | budget ms | within |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.endpoint} | ${r.n} | ${r.p50} | ${r.p95} | ${r.max} | ${r.non200} | ${r.budget} | ${r.ok ? '✅' : '❌'} |`,
  );
console.log(
  '\nWire numbers from a Mac; a handset adds radio wake-up, TLS and the JS bridge (device-checklist.md).',
);
