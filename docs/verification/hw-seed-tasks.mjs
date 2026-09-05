/**
 * Hardware-pass helper (build-6 re-check): put N inbox tasks on the device account SERVER-SIDE so
 * the next foreground pulls them (the `tasks_seq` trigger stamps server_seq, so the pull sees them
 * like any other write). Used to fill a fresh anonymous account for a ≥ 10-block plan without
 * typing into the quick-add over adb. Tasks are user data, not facts — nothing is attributed.
 *   node docs/verification/hw-seed-tasks.mjs --user <uuid> [count=12]
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';

const ROOT = '/Users/vladyslav/Workspace/magister_work';
const argv = process.argv.slice(2);
const ui = argv.indexOf('--user');
if (ui < 0) throw new Error('--user <uuid> is required');
const U = argv.splice(ui, 2)[1];
if (!/^[0-9a-f-]{36}$/.test(U ?? '')) throw new Error('--user must be a uuid');
const N = Number(argv[0] ?? 12);
if (!Number.isInteger(N) || N < 1 || N > 40) throw new Error('count must be 1..40');
const CATS = ['admin', 'deep', 'learning', 'physical'];
const values = Array.from({ length: N }, (_, i) => {
  const cat = CATS[i % CATS.length];
  const minutes = [30, 45, 60][i % 3];
  return `('${U}', 'b6 task ${String(i + 1).padStart(2, '0')} ${cat}', '${cat}', ${minutes}, 2, false, 'inbox')`;
}).join(',\n');
const rows = dbQuery(
  ROOT,
  `insert into public.tasks (user_id, title, category, est_minutes, value, splittable, status) values
${values}
returning id, server_seq`,
  { prefix: 'b6-seed' },
);
console.log(
  JSON.stringify({
    inserted: rows.length,
    first_seq: rows[0]?.server_seq,
    last_seq: rows.at(-1)?.server_seq,
  }),
);
