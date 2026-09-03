/**
 * Sync-resolve hop timing from a Node client (hardware pass day 3, NFR-P1 estimate for the pre-plan
 * push): REST floor, lease acquire+release, sync_pull, then the whole function with 0 and 8 ops.
 * One throwaway anonymous user that erases itself. Usage: node docs/verification/hw-sync-hops.mjs
 */
// Time the sync-resolve hops from the Mac with a throwaway anonymous user: each RPC alone, then the function (0 ops, then 8 ops).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(
  readFileSync('/Users/vladyslav/Workspace/magister_work/.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: a, error: ae } = await sb.auth.signInAnonymously();
if (ae) throw ae;
const uid = a.user.id;
console.log('user', uid.slice(0, 8));
await sb.from('profiles').insert({
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
  top_categories: ['deep'],
  onboarding_completed_at: new Date().toISOString(),
});
const t = async (label, fn, n = 5) => {
  const xs = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    const r = await fn();
    xs.push(Math.round(performance.now() - s));
    if (r?.error) console.log(label, 'ERR', r.error.message);
  }
  xs.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(34)} p50 ${xs[Math.floor(n / 2)]} ms  min ${xs[0]}  max ${xs[n - 1]}`,
  );
};
await t('REST floor: select 1 task', () => sb.from('tasks').select('id').limit(1));
await t('rpc acquire+release lease (2 hops)', async () => {
  const r = await sb.rpc('acquire_sync_lease', { p_user_id: uid });
  if (r.error) return r;
  return sb.rpc('release_sync_lease', { p_user_id: uid, p_token: r.data });
});
await t('rpc sync_pull (1 hop, empty)', () => sb.rpc('sync_pull', { p_cursor: 0, p_limit: 200 }));
const ops = (k) =>
  Array.from({ length: k }, (_, i) => ({
    op_id: `${Date.now()}-${i}`,
    op_type: 'task_upsert',
    entity_id: crypto.randomUUID(),
    client_ts: new Date().toISOString(),
    base_version: null,
    payload: {
      title: `hop test ${i}`,
      category: 'admin',
      est_minutes: 30,
      value: 2,
      status: 'inbox',
      splittable: false,
    },
  }));
for (const reason of (
  process.env.SYNC_REASONS ?? 'pre_plan,manual,foreground,reconnect,periodic'
).split(',')) {
  await t(`function sync-resolve, 0 ops, reason=${reason}`, () =>
    sb.functions.invoke('sync-resolve', {
      body: { ops: [], cursor: 0, reason, device_id: 'hoptest', now: new Date().toISOString() },
    }),
  );
}
await t(
  'function sync-resolve, 8 task ops',
  () =>
    sb.functions.invoke('sync-resolve', {
      body: {
        ops: ops(8),
        cursor: 0,
        reason: 'pre_plan',
        device_id: 'hoptest',
        now: new Date().toISOString(),
      },
    }),
  3,
);
const del = await sb.functions.invoke('delete-account', { body: { mode: 'self' } });
console.log('erased:', del.error ? del.error.message : 'ok');
