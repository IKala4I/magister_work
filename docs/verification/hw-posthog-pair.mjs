/**
 * Hardware-pass helper: pair the owner's PostHog export of `plan_requested` rows with the
 * server's `plans` rows for one day (the device-side NFR-P1 decomposition, day-3 notes item 1;
 * re-done for day 4 → shared here, never per-day scratch code again) and summarise the
 * `sync_completed` export by reason (the pre-plan sync share).
 *
 *   node docs/verification/hw-posthog-pair.mjs <day YYYY-MM-DD> <plan.csv> <sync.csv> <outDir>
 *
 * Pairing rule: a client row measures [timestamp − duration_ms, timestamp] on the PHONE clock
 * (the PostHog timestamp is taken after the SQLite mirror; the phone clock ran ≈ 0.7 s ahead of
 * the server on 4 Sep — day-4 notes item 20), so a plan is paired when `plans.generated_at`
 * falls in that interval widened by ±2 s, nearest to the interval midpoint, one-to-one.
 * Percentiles: linear interpolation (numpy default), as in the day-3 tables.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';

const ROOT = '/Users/vladyslav/Workspace/magister_work';
const U = '334512a3-f28c-4ac0-96d8-17d9b1bae52c';
const [day, planCsv, syncCsv, outDir] = process.argv.slice(2);
if (!day || !planCsv || !syncCsv || !outDir) throw new Error('usage: day plan.csv sync.csv outDir');

function parseCsv(text) {
  const rows = [];
  let row = [],
    field = '',
    q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const prop = (r, k) => r[`*.properties.${k}`];
const ts = (r) => new Date(r['*.timestamp'].replace(' ', 'T'));
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo));
};
const hms = (d) => d.toISOString().slice(11, 23);

const planRows = parseCsv(readFileSync(planCsv, 'utf8'))
  .filter((r) => r['*.event'] === 'plan_requested' && r['*.timestamp'].startsWith(day))
  .sort((a, b) => ts(a) - ts(b));
const syncRows = parseCsv(readFileSync(syncCsv, 'utf8'))
  .filter((r) => r['*.event'] === 'sync_completed' && r['*.timestamp'].startsWith(day))
  .sort((a, b) => ts(a) - ts(b));

const plans = dbQuery(
  ROOT,
  `select p.id, p.generated_at, p.engine, p.solver_status, p.telemetry->'request'->>'trigger' as trigger,
  (p.telemetry->'ef'->>'total_ms')::int as ef_total_ms, (p.telemetry->'ef'->>'service_ms')::int as ef_service_ms,
  p.telemetry->'ef'->>'reason' as reason, (p.telemetry->'service'->>'solve_ms')::int as solve_ms,
  (select count(*) from public.recommendations r where r.plan_id=p.id)::int as recs
  from public.plans p where p.user_id='${U}' and p.generated_at >= '${day} 00:00+03' and p.generated_at < '${day} 00:00+03'::timestamptz + interval '1 day' order by p.generated_at`,
  { prefix: 'pair' },
).map((p) => ({ ...p, gen: new Date(p.generated_at.replace(' ', 'T').replace(/\+00$/, 'Z')) }));

const free = new Set(plans.map((p) => p.id));
const paired = [];
const unpairedClient = [];
for (const r of planRows) {
  const end = ts(r),
    dur = Number(prop(r, 'duration_ms')),
    start = new Date(end - dur),
    mid = new Date((+start + +end) / 2);
  const cands = plans
    .filter((p) => free.has(p.id) && p.gen >= start - 2000 && p.gen <= +end + 2000)
    .sort((a, b) => Math.abs(a.gen - mid) - Math.abs(b.gen - mid));
  if (!cands.length) {
    unpairedClient.push({
      client_end_utc: hms(end),
      client_ms: dur,
      trigger: prop(r, 'trigger'),
      outcome: prop(r, 'outcome'),
    });
    continue;
  }
  const p = cands[0];
  free.delete(p.id);
  paired.push({
    client_end_utc: hms(end),
    client_ms: dur,
    trigger: prop(r, 'trigger'),
    outcome: prop(r, 'outcome'),
    engine: prop(r, 'engine'),
    plan_generated_utc: hms(p.gen),
    ef_total_ms: p.ef_total_ms,
    ef_service_ms: p.ef_service_ms,
    solve_ms: p.solve_ms,
    reason: p.reason,
    solver_status: p.solver_status,
    recs: p.recs,
    tail_ms: dur - p.ef_total_ms,
    plan_id: p.id,
  });
}
const unpairedServer = plans
  .filter((p) => free.has(p.id))
  .map((p) => ({ generated_at: p.generated_at, trigger: p.trigger, ef_total_ms: p.ef_total_ms }));

// series = runs of paired rows ≤ 60 s apart
const series = [];
for (const x of paired) {
  const t = new Date(`${day}T${x.client_end_utc}Z`);
  const last = series.at(-1);
  if (last && t - last.lastT <= 60000) {
    last.rows.push(x);
    last.lastT = t;
  } else series.push({ rows: [x], lastT: t });
}
const stat = (rows) => {
  const c = rows.map((x) => x.client_ms),
    f = rows.map((x) => x.ef_total_ms),
    tl = rows.map((x) => x.tail_ms);
  return {
    n: rows.length,
    client_p50: pct(c, 0.5),
    client_p95: pct(c, 0.95),
    client_max: Math.max(...c),
    fn_p50: pct(f, 0.5),
    fn_p95: pct(f, 0.95),
    tail_p50: pct(tl, 0.5),
    tail_p95: pct(tl, 0.95),
    fallbacks: rows.filter((x) => x.outcome !== 'learned').length,
  };
};
const lines = [
  `plan_requested rows ${planRows.length} | plans on the server ${day} ${plans.length} | paired ${paired.length} | unpaired client ${unpairedClient.length} | unpaired server ${unpairedServer.length}`,
  '',
];
for (const s of series) {
  const st = stat(s.rows);
  lines.push(
    `SERIES from ${s.rows[0].client_end_utc} (${s.rows[0].trigger}): n=${st.n} | client p50 ${st.client_p50} p95 ${st.client_p95} max ${st.client_max} | function p50 ${st.fn_p50} p95 ${st.fn_p95} | client−function p50 ${st.tail_p50} p95 ${st.tail_p95} | fallbacks ${st.fallbacks}/${st.n}`,
  );
  for (const x of s.rows)
    lines.push(
      `   end ${x.client_end_utc} client ${String(x.client_ms).padStart(5)}  fn ${String(x.ef_total_ms).padStart(5)}  svc ${String(x.ef_service_ms ?? '-').padStart(5)}  solve ${String(x.solve_ms ?? '-').padStart(4)}  tail ${String(x.tail_ms).padStart(5)}  ${x.trigger.padEnd(15)} ${x.outcome.padEnd(8)} ${x.reason}  recs ${x.recs}`,
    );
  lines.push('');
}
if (unpairedClient.length) lines.push('UNPAIRED CLIENT ROWS: ' + JSON.stringify(unpairedClient));
if (unpairedServer.length) lines.push('UNPAIRED SERVER PLANS: ' + JSON.stringify(unpairedServer));

// sync summary by reason + pre-plan syncs inside a plan interval
const byReason = {};
for (const r of syncRows) (byReason[prop(r, 'reason')] ??= []).push(Number(prop(r, 'duration_ms')));
lines.push(
  '',
  `sync_completed rows ${syncRows.length} (${hms(ts(syncRows[0]))}–${hms(ts(syncRows.at(-1)))})`,
);
for (const [k, v] of Object.entries(byReason))
  lines.push(
    `   ${k.padEnd(12)} n ${String(v.length).padStart(3)}  p50 ${pct(v, 0.5)}  p95 ${pct(v, 0.95)}  max ${Math.max(...v)}`,
  );
const prePlan = syncRows.filter((r) => prop(r, 'reason') === 'pre_plan');
const inside = prePlan.filter((r) =>
  planRows.some((p) => {
    const end = ts(p),
      start = new Date(end - Number(prop(p, 'duration_ms')));
    return ts(r) >= start - 1000 && ts(r) <= +end + 1000;
  }),
);
lines.push(
  `   pre_plan syncs inside a plan_requested interval: ${inside.length}/${prePlan.length}; requests with a pre-plan sync: ${inside.length}/${planRows.length}`,
);
lines.push(
  '   pre_plan rows: ' +
    prePlan
      .map(
        (r) =>
          `${hms(ts(r))} ${prop(r, 'duration_ms')}ms pushed ${prop(r, 'pushed')} pulled ${prop(r, 'pulled')} ${prop(r, 'outcome')}`,
      )
      .join(' | '),
);

const text = lines.join('\n');
writeFileSync(join(outDir, `nfr-p1-${day}-pairing.txt`), text + '\n');
writeFileSync(
  join(outDir, `nfr-p1-${day}-client-decomposition.json`),
  JSON.stringify(
    {
      source: `PostHog exports ${basename(planCsv)} / ${basename(syncCsv)} paired with plans.generated_at`,
      paired,
      unpaired_client: unpairedClient,
      unpaired_server: unpairedServer,
      sync_by_reason: Object.fromEntries(
        Object.entries(byReason).map(([k, v]) => [
          k,
          { n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95), max: Math.max(...v) },
        ]),
      ),
    },
    null,
    1,
  ),
);
copyFileSync(planCsv, join(outDir, `posthog-plan_requested-${day}.csv`));
copyFileSync(syncCsv, join(outDir, `posthog-sync_completed-${day}.csv`));
console.log(text);
