/**
 * Hardware pass helper: edit the device account's working hours on the server so the next
 * foreground pulls them (server_seq bumps by trigger). Used on day 5 to give the Saturday a window
 * for the owner-attended UC-07 move check (the profile has no weekend hours and Settings has no
 * hours editor — ADR-0019 context). Usage:
 *   node docs/verification/hw-set-working-hours.mjs '{"sat":[540,1080]}'   # merge days in
 *   node docs/verification/hw-set-working-hours.mjs --remove sat            # drop a day
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';
const ROOT = '/Users/vladyslav/Workspace/magister_work',
  U = '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
const [a, b] = process.argv.slice(2);
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
console.log(JSON.stringify(rows));
