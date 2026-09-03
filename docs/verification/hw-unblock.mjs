/**
 * Hardware pass (2026-09-02) — clears the plan-limit lockout on the OWNER'S TEST DEVICE
 * account by deleting the zero-recommendation plan rows day 1 left behind (the 20× cold-start
 * loop + evening opens, all `fallback:http` on the legacy-timezone 422 — day-2 notes items
 * 3/4; the rows are archived in `device-pass/android-20260902-1030/`). Refuses to touch
 * anything else: one user id, one plan_date, only rows with no recommendations. Dry run by
 * default; `--apply` deletes. Owner-run — the session's auto mode blocks hosted-DB deletes by
 * design.
 *   node docs/verification/hw-unblock.mjs            # counts only
 *   node docs/verification/hw-unblock.mjs --apply    # deletes, prints the count
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dbQuery } from './lib/db-query.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The Pixel 7a trial account (anonymous, onboarded 2026-09-01 17:37 UTC by the p4 flow).
const USER = '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
const PLAN_DATE = '2026-09-01';
const where = `p.user_id = '${USER}' and p.plan_date = '${PLAN_DATE}' and not exists (select 1 from public.recommendations r where r.plan_id = p.id)`;

const [{ n }] = dbQuery(repoRoot, `select count(*)::int as n from public.plans p where ${where};`, {
  prefix: 'hw-unblock',
});
console.log(`zero-recommendation plan rows for ${PLAN_DATE} on the device account: ${n}`);
if (!process.argv.includes('--apply')) {
  console.log('dry run — add --apply to delete them');
  process.exit(0);
}
const [{ deleted }] = dbQuery(
  repoRoot,
  `with d as (delete from public.plans p where ${where} returning 1) select count(*)::int as deleted from d;`,
  { prefix: 'hw-unblock' },
);
console.log(
  `deleted ${deleted} — the rolling 24 h plan count on the account is below the limit again`,
);
