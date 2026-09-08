-- Post-P12 (2026-09-08): persist_plan's supersede keeps facts and history — a row of the older
-- plan is expired only when it is still `shown`, still ahead, and carries no fact. Fixtures: one
-- user, one older plan with four still-shown rows (an ended slot with a lapse fact, an ended
-- slot without facts, a future slot with a skip fact, a future slot without facts) and one
-- accepted row; the new plan supersedes it.
begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp@example.com', '', now(), now());
insert into public.profiles (user_id, timezone) values ('00000000-0000-4000-8000-000000000e01', 'Europe/Kyiv');
insert into public.tasks (id, user_id, title, category, est_minutes, value) values
  ('00000000-0000-4000-8000-00000000eb01', '00000000-0000-4000-8000-000000000e01', 'e1', 'deep', 60, 2);
insert into public.plans (id, user_id, plan_date, horizon, engine, model_version, solver_status, telemetry) values
  ('00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-000000000e01', current_date, 'day', 'learned', 'recsys-p5.0', 'OPTIMAL', '{}');
insert into public.recommendations (id, user_id, plan_id, task_id, chunk_index, slot_start, slot_end, context_bucket, features, rationale_key, engine, model_version, status)
values
  -- ended, lapse observed by the device (the fact the 23:55 job attributes)
  ('00000000-0000-4000-8000-00000000ed01', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-00000000eb01', 0,
   now() - interval '3 hours', now() - interval '2 hours', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown'),
  -- ended, no fact yet (history: the daily job lapses it)
  ('00000000-0000-4000-8000-00000000ed02', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-00000000eb01', 1,
   now() - interval '2 hours', now() - interval '1 hour', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown'),
  -- ahead, a skip fact pushed by the pre-plan sync (no reward pass yet)
  ('00000000-0000-4000-8000-00000000ed03', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-00000000eb01', 2,
   now() + interval '1 hour', now() + interval '2 hours', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown'),
  -- ahead, no fact — the only row a supersede may expire
  ('00000000-0000-4000-8000-00000000ed04', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-00000000eb01', 3,
   now() + interval '3 hours', now() + interval '4 hours', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown'),
  -- accepted: never a supersede candidate (P8 rule, unchanged)
  ('00000000-0000-4000-8000-00000000ed05', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-00000000ec01', '00000000-0000-4000-8000-00000000eb01', 4,
   now() + interval '5 hours', now() + interval '6 hours', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'accepted');
insert into public.events (user_id, op_id, type, task_id, recommendation_id, payload, client_ts, local_day) values
  ('00000000-0000-4000-8000-000000000e01', 'dev-pp-000000000001', 'recommendation_shown', '00000000-0000-4000-8000-00000000eb01', '00000000-0000-4000-8000-00000000ed04', '{}', now() - interval '4 hours', current_date),
  ('00000000-0000-4000-8000-000000000e01', 'dev-pp-000000000002', 'lapse_observed', '00000000-0000-4000-8000-00000000eb01', '00000000-0000-4000-8000-00000000ed01', '{"hours_after_slot_end": 1.5}', now() - interval '30 minutes', current_date),
  ('00000000-0000-4000-8000-000000000e01', 'dev-pp-000000000003', 'block_skipped', '00000000-0000-4000-8000-00000000eb01', '00000000-0000-4000-8000-00000000ed03', '{}', now() - interval '10 minutes', current_date);

create temp table pp as select public.persist_plan('00000000-0000-4000-8000-000000000e01',
  jsonb_build_object('plan_date', current_date, 'horizon', 'day', 'engine', 'learned', 'model_version', 'recsys-p5.0', 'arm', 'B', 'solver_status', 'OPTIMAL', 'telemetry', '{}'::jsonb, 'generated_at', now()),
  jsonb_build_array(jsonb_build_object('task_id', '00000000-0000-4000-8000-00000000eb01', 'chunk_index', 0, 'slot_start', now() + interval '2 hours', 'slot_end', now() + interval '3 hours', 'context_bucket', 'AF.wd.fresh', 'features', '[1]'::jsonb, 'q_hat', 0.5, 'confidence', 0.5, 'rationale_key', 'best_available', 'is_experiment', false, 'propensity', 0.5)),
  array['00000000-0000-4000-8000-00000000ec01']::uuid[]) as r;

select is((select jsonb_array_length(r->'expired_recommendation_ids') from pp), 1, 'exactly one row of the older plan is expired');
select is((select r->'expired_recommendation_ids'->>0 from pp), '00000000-0000-4000-8000-00000000ed04', 'the expired row is the future one without facts');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000ed01'), 'shown', 'an ended slot with a lapse fact is kept for the 23:55 authority');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000ed02'), 'shown', 'an ended slot without facts is kept (history, lapsed by the daily job)');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000ed03'), 'shown', 'a future slot with a skip fact is kept (attributed from the fact)');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000ed05'), 'accepted', 'an accepted row is untouched (P8 rule)');
select is((select count(*) from public.recommendations where user_id = '00000000-0000-4000-8000-000000000e01' and status = 'expired'), 1::bigint, 'no other row was expired');

select * from finish();
rollback;
