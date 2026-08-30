/**
 * P10 live smoke — FR-42 export + erasure end-to-end against the LINKED hosted project
 * (ADR-0014 §7–§9; needs the P10 migration applied and the `export-data` / `delete-account`
 * functions deployed):
 *   anonymous sign-in → onboarded profile through RLS (priors instantiated) → one task and one
 *   `notification_response` fact through sync-resolve → `export-data`: 401 without a token; 200
 *   with the document (format/version, the profile, the task with its title, the fact, 48 Beta
 *   cells with their priors, no calendar `title` key anywhere, counts, a download filename) →
 *   `delete-account`: 401 without a token, 401 for operator/retention without the backend key,
 *   200 `deleted` with an audit reference for the user → the same JWT is dead (export → 401) →
 *   service-side: the audit row is completed with reason user_request and NOTHING of the user
 *   remains in any user-owned table (the pgTAP cascade proof, observed live).
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY from the repo .env; prints PASS/FAIL lines and
 * timings only — never credentials. Leaves nothing behind (the user erases themselves).
 * A missing `deletion_audit.reason` column is a FAIL with the reason, never a skip.
 *
 * Usage: node docs/verification/p10-live-smoke.mjs   (from apps/mobile so supabase-js resolves)
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
  const file = join(tmpdir(), `p10-smoke-${uuid()}.sql`);
  writeFileSync(file, query);
  const out = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const json = out.slice(out.indexOf('{'));
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : (parsed.rows ?? parsed.result ?? parsed);
  } catch (err) {
    console.log(`  (sql parse failed: ${err.message}; raw: ${out.slice(0, 200)})`);
    return [];
  }
}

// --- the P10 migration must be on the project ----------------------------------------------------
const col = sql(
  `select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'deletion_audit' and column_name = 'reason'`,
)[0];
check('P10 migration applied (deletion_audit.reason exists)', col?.n === 1, JSON.stringify(col));
const cron = sql(`select count(*)::int as n from cron.job where jobname = 'retention-sweep'`)[0];
check('retention-sweep cron job scheduled', cron?.n === 1, JSON.stringify(cron));

// --- a user with data ----------------------------------------------------------------------------
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
async function fn(name, body, withAuth = true, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: withAuth
      ? { ...headers, ...extraHeaders }
      : { 'content-type': 'application/json', apikey: ANON, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => null);
  return {
    status: res.status,
    data,
    ms,
    region: res.headers.get('x-sb-edge-region'),
    disposition: res.headers.get('content-disposition'),
  };
}

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
  top_categories: ['deep'],
  onboarding_completed_at: new Date().toISOString(),
  settings: { notifications: { muted_categories: ['admin'], evening_ritual_time: '21:00' } },
});
check(
  'profile insert through RLS (priors instantiated by trigger)',
  !profileError,
  profileError?.message,
);

const nowIso = new Date().toISOString();
const taskId = uuid();
const taskOpId = opId();
const factOpId = opId();
const sync = await fn('sync-resolve', {
  ops: [
    {
      op_id: taskOpId,
      op_type: 'task_upsert',
      entity_id: taskId,
      base_version: null,
      payload: {
        id: taskId,
        user_id: uid,
        title: 'Write the thesis intro',
        category: 'deep',
        est_minutes: 90,
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
    },
    {
      op_id: factOpId,
      op_type: 'event_append',
      entity_id: null,
      base_version: null,
      payload: {
        op_id: factOpId,
        user_id: uid,
        type: 'notification_response',
        task_id: null,
        recommendation_id: null,
        payload: {
          kind: 'evening_ritual',
          action: 'accept',
          variant: 'daily',
          scheduled_for: nowIso,
          latency_ms: 4200,
        },
        context: { tz: 'Europe/Kyiv' },
        client_ts: nowIso,
        local_day: nowIso.slice(0, 10),
      },
    },
  ],
  cursor: 0,
  reason: 'write',
  device_id: DEVICE,
  now: nowIso,
});
const acks = sync.data?.acks ?? [];
check(
  'a task and a notification_response fact replay through sync-resolve',
  sync.status === 200 && acks.length === 2 && acks.every((a) => a.outcome === 'applied'),
  `${sync.status} ${JSON.stringify(acks).slice(0, 200)}`,
);

// --- export ---------------------------------------------------------------------------------------
const exportNoToken = await fn('export-data', {}, false);
check(
  'export-data without a session → 401',
  exportNoToken.status === 401,
  String(exportNoToken.status),
);
const exp = await fn('export-data', {});
check(
  `export-data → 200 (${exp.ms} ms, region ${exp.region})`,
  exp.status === 200 && exp.region === 'eu-west-1',
  `${exp.status} ${JSON.stringify(exp.data).slice(0, 200)}`,
);
const doc = exp.data ?? {};
check(
  'document format/version',
  doc.format === 'hourwell-export' && doc.version === 1,
  JSON.stringify([doc.format, doc.version]),
);
check(
  'download filename header',
  /^attachment; filename="hourwell-export-\d{4}-\d{2}-\d{2}\.json"$/.test(exp.disposition ?? ''),
  String(exp.disposition),
);
check(
  'the profile with its notification settings',
  doc.profile?.timezone === 'Europe/Kyiv' &&
    doc.profile?.settings?.notifications?.evening_ritual_time === '21:00',
  JSON.stringify(doc.profile?.settings),
);
check(
  "the task with its title (the user's own text)",
  doc.tasks?.length === 1 && doc.tasks[0].title === 'Write the thesis intro',
  JSON.stringify(doc.tasks?.[0]).slice(0, 120),
);
check(
  'the notification_response fact',
  (doc.events ?? []).some(
    (e) => e.type === 'notification_response' && e.payload?.action === 'accept',
  ),
  JSON.stringify(doc.counts),
);
check(
  '48 Beta cells with their priors (learned parameters)',
  doc.learned_parameters?.beta_cells?.length === 48 &&
    typeof doc.learned_parameters.beta_cells[0].alpha0 === 'number',
  String(doc.learned_parameters?.beta_cells?.length),
);
check(
  'blend state present, cluster assignment present',
  doc.learned_parameters?.blend_state?.w_energy !== undefined &&
    doc.learned_parameters?.cluster_assignment?.cluster_id !== undefined,
  JSON.stringify(doc.learned_parameters?.blend_state),
);
const calendarTitles = JSON.stringify(doc.calendar_events ?? []).includes('"title"');
check(
  'no calendar title key anywhere in the export',
  !calendarTitles && Array.isArray(doc.calendar_events),
);
check(
  'counts cover every exported table',
  doc.counts &&
    Object.keys(doc.counts).length === 14 &&
    doc.counts.tasks === 1 &&
    Array.isArray(doc.truncated) &&
    doc.truncated.length === 0,
  JSON.stringify(doc.counts),
);
check(
  'no server-only ledger in the document',
  !('sync_ops' in doc) &&
    !('gcal_sync_state' in doc) &&
    !('recsys_applied_tuples' in doc) &&
    !('sync_leases' in doc),
);

// --- erasure --------------------------------------------------------------------------------------
const delNoToken = await fn('delete-account', { mode: 'self' }, false);
check(
  'delete-account without a session → 401',
  delNoToken.status === 401,
  String(delNoToken.status),
);
const opNoKey = await fn('delete-account', { mode: 'operator', user_id: uid });
check(
  'operator mode without the backend key → 401',
  opNoKey.status === 401,
  String(opNoKey.status),
);
const retNoKey = await fn('delete-account', { mode: 'retention' }, false, {
  'x-service-key': 'wrong',
});
check('retention mode with a wrong key → 401', retNoKey.status === 401, String(retNoKey.status));
const before = sql(
  `select (select count(*)::int from public.profiles where user_id = '${uid}') as profiles, (select count(*)::int from public.tasks where user_id = '${uid}') as tasks, (select count(*)::int from public.events where user_id = '${uid}') as events, (select count(*)::int from public.beta_cells where user_id = '${uid}') as cells`,
)[0];
check(
  "service-side: the user's rows exist before erasure",
  before?.profiles === 1 && before?.tasks === 1 && before?.events === 1 && before?.cells === 48,
  JSON.stringify(before),
);
const del = await fn('delete-account', { mode: 'self' });
check(
  `delete-account self → 200 deleted (${del.ms} ms)`,
  del.status === 200 &&
    del.data?.status === 'deleted' &&
    typeof del.data.reference === 'string' &&
    typeof del.data.completed_at === 'string',
  `${del.status} ${JSON.stringify(del.data)}`,
);
const reference = del.data?.reference;
const dead = await fn('export-data', {});
check('the session is dead afterwards (export → 401)', dead.status === 401, String(dead.status));
const after = sql(
  `select (select count(*)::int from public.profiles where user_id = '${uid}') as profiles, (select count(*)::int from public.tasks where user_id = '${uid}') as tasks, (select count(*)::int from public.events where user_id = '${uid}') as events, (select count(*)::int from public.beta_cells where user_id = '${uid}') as cells, (select count(*)::int from public.bandit_state where user_id = '${uid}') as bandit, (select count(*)::int from public.sync_ops where user_id = '${uid}') as sync_ops, (select count(*)::int from auth.users where id = '${uid}') as auth_users`,
)[0];
check(
  'service-side: nothing of the user remains (profile, tasks, events, cells, bandit, sync_ops, auth.users)',
  after && Object.values(after).every((v) => v === 0),
  JSON.stringify(after),
);
const audit = sql(
  `select reason, completed_at is not null as completed, requested_at <= completed_at as ordered from public.deletion_audit where id = '${reference}'`,
)[0];
check(
  'the proof-of-erasure row: reason user_request, completed after requested',
  audit?.reason === 'user_request' && audit?.completed === true && audit?.ordered === true,
  JSON.stringify(audit),
);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
