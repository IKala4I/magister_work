/**
 * Hardware pass helper: edit the device account's working hours on the server so the next
 * foreground pulls them (server_seq bumps by trigger). Used on day 5 to give the Saturday a window
 * for the owner-attended UC-07 move check (the profile has no weekend hours and Settings has no
 * hours editor — ADR-0019 context). Usage:
 *   node docs/verification/hw-set-working-hours.mjs '{"sat":[540,1080]}'   # merge days in
 *   node docs/verification/hw-set-working-hours.mjs --remove sat            # drop a day
 *   … --user <uuid>   # the device account (default: the day-5 account, erased 2026-09-05 — pass
 *                     # the fresh one; build-6 re-check). The script refuses to run without a row.
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';
const ROOT = '/Users/vladyslav/Workspace/magister_work';
const argv = process.argv.slice(2);
const ui = argv.indexOf('--user');
const U = ui >= 0 ? argv.splice(ui, 2)[1] : '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
if (!/^[0-9a-f-]{36}$/.test(U ?? '')) throw new Error('--user must be a uuid');
const [a, b] = argv;
let expr;
if (a === '--remove') {
  if (!/^(mon|tue|wed|thu|fri|sat|sun)$/.test(b)) throw new Error('day');
  expr = `working_hours - '${b}'`;
} else {
  const patch = JSON.parse(a);
  for (const [k, v] of Object.entries(patch))
    if (!/^(mon|tue|wed|thu|fri|sat|sun)$/.test(k) || !Array.isArray(v) || v.length !== 2)
      throw new Error('shape');
  expr = `working_hours || '${JSON.stringify(patch)}'::jsonb`;
}
const rows = dbQuery(
  ROOT,
  `update public.profiles set working_hours = ${expr} where user_id='${U}' returning working_hours, server_seq, updated_at`,
  { prefix: 'day5' },
);
if (rows.length === 0) throw new Error(`no profile row for ${U}`);
console.log(JSON.stringify(rows));
