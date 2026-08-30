/** `export-data` with injected deps: auth, the whitelist contract, title stripping, paging. */
import { assertEquals } from '@std/assert';
import {
  buildExport,
  type Deps,
  EXPORT_TABLES,
  handleExportData,
  MAX_ROWS_PER_TABLE,
  PAGE_SIZE,
  SERVER_ONLY_TABLES,
} from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-05T10:00:00Z');

/** The 18 tables that reference auth.users — the same list pgTAP p10_privacy_test.sql pins. */
const USER_OWNED_TABLES = [
  'profiles',
  'tasks',
  'calendar_events',
  'plans',
  'recommendations',
  'events',
  'feedback_rewards',
  'bandit_state',
  'beta_cells',
  'blend_state',
  'cluster_assignments',
  'study_assignments',
  'gcal_sync_state',
  'duration_estimates',
  'recsys_applied_tuples',
  'sync_ops',
  'sync_leases',
  'belief_labels',
];

type Rows = Record<string, Record<string, unknown>[]>;

function deps(rows: Rows, calls: string[] = []): Deps {
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    readPage: (table, userId, _order, from, to) => {
      calls.push(`${table}:${userId}:${from}-${to}`);
      const all = rows[table] ?? [];
      return Promise.resolve(all.slice(from, to + 1));
    },
  };
}

Deno.test('contract: exported ∪ server-only = every user-owned table, disjoint, no extras', () => {
  const exported = EXPORT_TABLES.map((t) => t.table);
  const all = [...exported, ...SERVER_ONLY_TABLES].sort();
  assertEquals(all, [...USER_OWNED_TABLES].sort());
  assertEquals(new Set(all).size, all.length);
});

Deno.test('contract: calendar titles never leave (specs/07 §4.1); nothing else is stripped', () => {
  const cal = EXPORT_TABLES.find((t) => t.table === 'calendar_events')!;
  assertEquals(cal.omit, ['title']);
  for (const t of EXPORT_TABLES) if (t.table !== 'calendar_events') assertEquals(t.omit, undefined);
});

Deno.test('401 without a valid token; nothing is read', async () => {
  const calls: string[] = [];
  const res = await handleExportData(
    new Request('https://x/export-data', { method: 'POST' }),
    deps({}, calls),
  );
  assertEquals(res.status, 401);
  assertEquals(calls, []);
});

Deno.test('the document: shape, grouping, counts, titles stripped, reads scoped to the verified user', async () => {
  const calls: string[] = [];
  const rows: Rows = {
    profiles: [{ user_id: USER, timezone: 'Europe/Kyiv', settings: { notifications: {} } }],
    tasks: [{ id: 't1', title: 'Write intro', category: 'deep' }],
    calendar_events: [{ id: 'c1', title: 'Dentist', start_at: 'x', busy: true }],
    plans: [{ id: 'p1' }],
    recommendations: [{ id: 'r1', plan_id: 'p1' }],
    events: [{ id: 1, type: 'focus_start' }, { id: 2, type: 'focus_end' }],
    feedback_rewards: [{ id: 'f1', reward: 1 }],
    belief_labels: [{ id: 'l1', label: 'correct' }],
    study_assignments: [{ phase_no: 1, arm: 'A' }],
    beta_cells: [{ category: 'deep', daypart: 'MO', day_type: 'weekday', succ: 2, alpha0: 3 }],
    bandit_state: [{ category: 'deep', d: 2 }],
    blend_state: [{ user_id: USER, w_energy: 0.7 }],
    duration_estimates: [{ category: 'deep', ewma_ratio: 1.1 }],
    cluster_assignments: [{ user_id: USER, cluster_id: 1 }],
  };
  const res = await handleExportData(
    new Request('https://x/export-data', {
      method: 'POST',
      headers: { authorization: 'Bearer good' },
    }),
    deps(rows, calls),
  );
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get('content-disposition'),
    'attachment; filename="hourwell-export-2026-09-05.json"',
  );
  const doc = await res.json();
  assertEquals(doc.format, 'hourwell-export');
  assertEquals(doc.version, 1);
  assertEquals(doc.exported_at, '2026-09-05T10:00:00.000Z');
  assertEquals(doc.user_id, USER);
  assertEquals(doc.profile.timezone, 'Europe/Kyiv');
  assertEquals(doc.tasks[0].title, 'Write intro'); // the user's own text IS theirs to take
  assertEquals(doc.calendar_events, [{ id: 'c1', start_at: 'x', busy: true }]);
  assertEquals(doc.events.length, 2);
  assertEquals(doc.learned_parameters.beta_cells[0].alpha0, 3);
  assertEquals(doc.learned_parameters.blend_state.w_energy, 0.7);
  assertEquals(doc.learned_parameters.cluster_assignment.cluster_id, 1);
  assertEquals(doc.counts.events, 2);
  assertEquals(doc.counts.calendar_events, 1);
  assertEquals(doc.truncated, []);
  // every whitelisted table was read exactly once (one page each), scoped to the verified uid
  assertEquals(calls.length, EXPORT_TABLES.length);
  for (const c of calls) assertEquals(c.includes(`:${USER}:`), true);
  // nothing server-only was asked for
  for (const t of SERVER_ONLY_TABLES) assertEquals(calls.some((c) => c.startsWith(`${t}:`)), false);
});

Deno.test('paging: a table larger than one page is read page by page until a short page', async () => {
  const calls: string[] = [];
  const events = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({ id: i + 1 }));
  const doc = await buildExport(deps({ events }, calls), USER);
  assertEquals(doc.events.length, PAGE_SIZE + 5);
  assertEquals(calls.filter((c) => c.startsWith('events:')), [
    `events:${USER}:0-${PAGE_SIZE - 1}`,
    `events:${USER}:${PAGE_SIZE}-${2 * PAGE_SIZE - 1}`,
  ]);
  assertEquals(doc.truncated, []);
});

Deno.test('paging: a table at the row ceiling is cut and flagged, the rest of the document is intact', async () => {
  const pages = MAX_ROWS_PER_TABLE / PAGE_SIZE;
  const d: Deps = {
    ...deps({ tasks: [{ id: 't1' }] }),
    readPage: (table, _u, _o, from, to) => {
      if (table === 'events') {
        return Promise.resolve(Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })));
      }
      return Promise.resolve(table === 'tasks' && from === 0 ? [{ id: 't1' }] : []);
    },
  };
  const doc = await buildExport(d, USER);
  assertEquals(doc.events.length, pages * PAGE_SIZE);
  assertEquals(doc.truncated, ['events']);
  assertEquals(doc.tasks, [{ id: 't1' }]);
});
