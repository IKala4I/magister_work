/**
 * Hardware-pass helper (ADR-0022 pass, 2026-09-08; the day-5 13-block recipe did this ad hoc):
 * set the device account's profile `timezone` on the server so the planning grid runs in that
 * zone (the client sends the device-local date; the server grid runs in the profile zone). The
 * next foreground pulls it (server_seq bumps by trigger). Pair with the device zone
 * (`settings put global auto_time_zone 0; cmd alarm set-timezone <zone>`) and a working window
 * for the day (`hw-set-working-hours.mjs`). Usage:
 *   node docs/verification/hw-set-profile-timezone.mjs America/Los_Angeles --user <uuid>
 *   node docs/verification/hw-set-profile-timezone.mjs Europe/Kiev --user <uuid>   # restore
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';
const ROOT = '/Users/vladyslav/Workspace/magister_work';
const argv = process.argv.slice(2);
const ui = argv.indexOf('--user');
if (ui < 0) throw new Error('--user <uuid> is required');
const U = argv.splice(ui, 2)[1];
if (!/^[0-9a-f-]{36}$/.test(U ?? '')) throw new Error('--user must be a uuid');
const zone = argv[0];
if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(zone ?? '')) throw new Error('zone must look like Area/City');
const rows = dbQuery(
  ROOT,
  `update public.profiles set timezone = '${zone}' where user_id='${U}' returning timezone, server_seq, updated_at`,
  { prefix: 'motion' },
);
if (rows.length === 0) throw new Error(`no profile row for ${U}`);
console.log(JSON.stringify(rows));
