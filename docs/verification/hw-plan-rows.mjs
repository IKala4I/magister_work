/**
 * Hardware-pass helper (iPhone pass, 2026-09-07): the server side of a device re-plan series —
 * every `plans` row of one account with the edge function's P6 keys (reason, service_ms,
 * total_ms, budget_ms, service_status) and p50/p95 over the manual re-plans. Aggregate and
 * id-level only; no task text. The client-side `plan_requested.duration_ms` stays in PostHog
 * (owner export, `hw-posthog-pair.mjs`).
 *   node docs/verification/hw-plan-rows.mjs --user <uuid> [--since <ISO>]
 */
import {
  dbQuery,
  rowsOf,
} from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';

const ROOT = '/Users/vladyslav/Workspace/magister_work';
const argv = process.argv.slice(2);
const user = argv[argv.indexOf('--user') + 1];
const sinceIdx = argv.indexOf('--since');
const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;
if (!user) throw new Error('usage: --user <uuid> [--since <ISO>]');
const sql = `select generated_at, plan_date, telemetry->'request'->>'trigger' as trigger, engine,
  telemetry->'ef'->>'reason' as reason, (telemetry->'ef'->>'service_ms')::int as service_ms, (telemetry->'ef'->>'total_ms')::int as total_ms,
  (telemetry->'ef'->>'budget_ms')::int as budget_ms, telemetry->'ef'->>'service_status' as service_status,
  (select count(*) from recommendations r where r.plan_id = p.id) as recs
  from plans p where user_id = '${user}'${since ? ` and generated_at >= '${since}'` : ''}
  order by generated_at`;
const rows = rowsOf(await dbQuery(ROOT, sql, { prefix: 'hw-plan-rows' }));
for (const r of rows) {
  console.log(
    `${r.generated_at}  ${String(r.trigger).padEnd(10)} ${String(r.engine).padEnd(8)} ${String(r.reason).padEnd(16)} service ${String(r.service_ms).padStart(5)}  total ${String(r.total_ms).padStart(5)}  budget ${r.budget_ms}  status ${r.service_status}  recs ${r.recs}`,
  );
}
const manual = rows.filter((r) => r.trigger === 'manual' && r.total_ms != null);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null;
};
if (manual.length) {
  const tot = manual.map((r) => r.total_ms);
  const svc = manual.filter((r) => r.service_ms != null).map((r) => r.service_ms);
  console.log(
    `manual n=${manual.length}: ef total p50 ${pct(tot, 50)} / p95 ${pct(tot, 95)} / max ${Math.max(...tot)} ms; service p50 ${pct(svc, 50)} / p95 ${pct(svc, 95)} ms; reasons ${JSON.stringify(Object.fromEntries(manual.reduce((m, r) => m.set(r.reason, (m.get(r.reason) ?? 0) + 1), new Map())))}`,
  );
}
