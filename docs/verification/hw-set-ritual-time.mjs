/**
 * Hardware pass helper: move the device account's evening ritual time on the server so the
 * next foreground pulls it and the scheduler fires a REAL ritual minutes later (one per calendar
 * day — the ≤ 5/day ledger and the ritual:<day> id allow no second one). Usage:
 *   node docs/verification/hw-set-ritual-time.mjs 09:12 [--user <uuid>]   # HH:MM local; restore with 20:00
 * Day-4 notes item 25. Writes profiles.settings.notifications.evening_ritual_time via the
 * linked db (server_seq bumps by trigger → sync_pull picks it up).
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';
const ROOT = '/Users/vladyslav/Workspace/magister_work';
// --user = the device account (default: the day-5 account, erased 2026-09-05)
const argv = process.argv.slice(2);
const ui = argv.indexOf('--user');
const U = ui >= 0 ? argv.splice(ui, 2)[1] : '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
if (!/^[0-9a-f-]{36}$/.test(U ?? '')) throw new Error('--user must be a uuid');
const t = argv[0];
if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('HH:MM');
const rows = dbQuery(
  ROOT,
  `update public.profiles set settings = jsonb_set(jsonb_set(coalesce(settings, '{}'::jsonb), '{notifications}', coalesce(settings->'notifications', '{}'::jsonb)), '{notifications,evening_ritual_time}', to_jsonb('${t}'::text)) where user_id='${U}' returning settings->'notifications'->>'evening_ritual_time' as ritual_time, server_seq, updated_at`,
  { prefix: 'day4' },
);
if (rows.length === 0) throw new Error(`no profile row for ${U}`);
console.log(JSON.stringify(rows));
