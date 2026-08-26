-- P6 — plan-request persistence contract: service-authored plans/recommendations are readable
-- by their owner only; the supersede transition (shown → expired) is service-only; the P6
-- indexes exist.
begin;
select plan(9);

select has_index('public', 'plans', 'plans_user_date_idx', 'base plans (user_id, plan_date) index exists');
select has_index('public', 'plans', 'plans_user_generated_idx', 'plans (user_id, generated_at desc) index exists');

-- two users
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p6a@example.com', '', now(), now()),
       ('00000000-0000-4000-8000-000000000a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p6b@example.com', '', now(), now());

-- service-authored rows for user A (as the service role would write them)
insert into public.tasks (id, user_id, title, category, est_minutes, value)
values ('00000000-0000-4000-8000-00000000ab01', '00000000-0000-4000-8000-000000000a01', 't', 'admin', 30, 2);
insert into public.plans (id, user_id, plan_date, horizon, engine, model_version, arm, solver_status, telemetry)
values ('00000000-0000-4000-8000-00000000ac01', '00000000-0000-4000-8000-000000000a01', '2026-08-26', 'day', 'heuristic', 'heuristic-p6.0', 'A', 'HEURISTIC',
        '{"ef": {"reason": "arm_a", "experiment": {"task_id": "00000000-0000-4000-8000-00000000ab01", "bucket_id": "MO.wd.fresh", "top_m": ["MO.wd.fresh", "MD.wd"], "propensity": 0.5, "n_eligible": 1}}}'),
       ('00000000-0000-4000-8000-00000000ac02', '00000000-0000-4000-8000-000000000a01', '2026-08-26', 'day', 'learned', 'recsys-p5.0', null, 'OPTIMAL', '{"ef": {"reason": "learned"}}');
insert into public.recommendations (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features, q_hat, confidence, rationale_key, rationale_params, is_experiment, engine, model_version, propensity)
values ('00000000-0000-4000-8000-00000000ad01', '00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-00000000ac01', '00000000-0000-4000-8000-00000000ab01',
        '2026-08-26 06:00+00', '2026-08-26 06:30+00', 'MO.wd.fresh', '[1,0,1,0,0,0,0,0,0,0.5,0.5,0,0,0,0.5,0.22,0]', null, null, 'experiment', '{"category":"admin","daypart":"MO"}', true, 'heuristic', 'heuristic-p6.0', 0.5);

-- owner reads own plan + recommendation (RLS select policies)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}', true);
select is((select count(*) from public.plans), 2::bigint, 'owner sees both plans');
select is((select propensity from public.recommendations where id = '00000000-0000-4000-8000-00000000ad01'), 0.5::double precision, 'owner reads the exact propensity (M-01, double precision — L22)');
select is((select telemetry->'ef'->'experiment'->>'propensity' from public.plans where id = '00000000-0000-4000-8000-00000000ac01'), '0.5', 'A_m(x) telemetry is readable by the owner');

-- a client may not supersede (expired is a server-side status)
select throws_ok(
  $$ update public.recommendations set status = 'expired' where id = '00000000-0000-4000-8000-00000000ad01' $$,
  'P0001', 'status expired may not be set by clients', 'client cannot expire a recommendation');

-- the other user sees nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated"}', true);
select is((select count(*) from public.plans), 0::bigint, 'other user sees no plans');
select is((select count(*) from public.recommendations), 0::bigint, 'other user sees no recommendations');

-- the service role supersedes shown → expired
reset role;
update public.recommendations set status = 'expired' where id = '00000000-0000-4000-8000-00000000ad01' and status = 'shown';
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000ad01'), 'expired', 'service role expires a shown row');

select * from finish();
rollback;
