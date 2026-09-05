/**
 * Hardware pass helper: move the device account's evening ritual time on the server so the
 * next foreground pulls it and the scheduler fires a REAL ritual minutes later (one per calendar
 * day — the ≤ 5/day ledger and the ritual:<day> id allow no second one). Usage:
 *   node docs/verification/hw-set-ritual-time.mjs 09:12   # HH:MM local; restore with 20:00
 * Day-4 notes item 25. Writes profiles.settings.notifications.evening_ritual_time via the
 * linked db (server_seq bumps by trigger → sync_pull picks it up).
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';
const ROOT = '/Users/vladyslav/Workspace/magister_work',
  U = '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
const t = process.argv[2];
if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('HH:MM');
const rows = dbQuery(
  ROOT,
  `update public.profiles set settings = jsonb_set(settings, '{notifications,evening_ritual_time}', to_jsonb('${t}'::text)) where user_id='${U}' returning settings->'notifications'->>'evening_ritual_time' as ritual_time, server_seq, updated_at`,
  { prefix: 'day4' },
);
console.log(JSON.stringify(rows));
