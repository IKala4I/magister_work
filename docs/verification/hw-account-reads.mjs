/**
 * Hardware-pass helper (build-6 re-check): one read of everything a device-account check needs —
 * the auth row, the profile's hours/timezone, and per-table counts (plans, recommendations, tasks,
 * events, notification_response facts). Aggregate and id-level only; no task text is printed.
 *   node docs/verification/hw-account-reads.mjs --latest        # the newest auth user
 *   node docs/verification/hw-account-reads.mjs --user <uuid>
 */
import { dbQuery } from '/Users/vladyslav/Workspace/magister_work/docs/verification/lib/db-query.mjs';

const ROOT = '/Users/vladyslav/Workspace/magister_work';
const argv = process.argv.slice(2);
let U;
if (argv[0] === '--latest') {
  const r = dbQuery(
    ROOT,
    `select id, created_at from auth.users order by created_at desc limit 1`,
    {
      prefix: 'b6-reads',
    },
  );
  U = r[0]?.id;
} else if (argv[0] === '--user') {
  U = argv[1];
}
if (!/^[0-9a-f-]{36}$/.test(U ?? '')) throw new Error('need --latest or --user <uuid>');
const rows = dbQuery(
  ROOT,
  `select
     (select created_at from auth.users where id = '${U}') as user_created_at,
     (select is_anonymous from auth.users where id = '${U}') as is_anonymous,
     (select timezone from public.profiles where user_id = '${U}') as timezone,
     (select working_hours from public.profiles where user_id = '${U}') as working_hours,
     (select onboarding_completed_at from public.profiles where user_id = '${U}') as onboarding_completed_at,
     (select count(*) from public.plans where user_id = '${U}') as plans,
     (select coalesce(json_agg(json_build_object('plan_date', plan_date, 'trigger', telemetry->'request'->>'trigger', 'engine', engine, 'generated_at', generated_at) order by generated_at), '[]'::json) from public.plans where user_id = '${U}') as plan_rows,
     (select count(*) from public.recommendations where user_id = '${U}') as recommendations,
     (select count(*) from public.tasks where user_id = '${U}' and deleted_at is null) as tasks,
     (select count(*) from public.events where user_id = '${U}') as events,
     (select coalesce(json_agg(type order by server_ts), '[]'::json) from public.events where user_id = '${U}') as event_types`,
  { prefix: 'b6-reads' },
);
console.log(JSON.stringify({ user_id: U, ...rows[0] }, null, 1));
