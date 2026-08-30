-- P10 — privacy server contract (ADR-0014): FR-42 erasure is ONE auth.users delete that
-- cascades through every user-owned table (structural proof + a row in every table), the
-- deletion_audit row survives (no FK), the anonymous retention rule picks inactive anonymous
-- accounts only, and the profile_update replay merges `settings` (notification prefs).
begin;
select plan(36);

-- ---------------------------------------------------------------------------
-- objects
-- ---------------------------------------------------------------------------
select has_column('public', 'deletion_audit', 'reason', 'deletion_audit.reason exists');
select has_function('public', 'anonymous_purge_candidates', 'anonymous_purge_candidates() exists');
select has_function('public', 'retention_sweep_tick', 'retention_sweep_tick() exists');
select is((select count(*) from cron.job where jobname = 'retention-sweep'), 1::bigint,
  'the daily retention sweep is scheduled');

-- ---------------------------------------------------------------------------
-- structural: every FK from public.* to auth.users is ON DELETE CASCADE, and the set of
-- user-owned tables is exactly the FR-42 whitelist (a new table must land here AND in the
-- export-data / delete-account contracts)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public' and c.confdeltype <> 'c'),
  0::bigint, 'every FK to auth.users in public cascades on delete');
select set_eq(
  $$select t.relname::text from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'$$,
  $$values ('profiles'), ('tasks'), ('calendar_events'), ('plans'), ('recommendations'),
           ('events'), ('feedback_rewards'), ('bandit_state'), ('beta_cells'), ('blend_state'),
           ('cluster_assignments'), ('study_assignments'), ('gcal_sync_state'),
           ('duration_estimates'), ('recsys_applied_tuples'), ('sync_ops'), ('sync_leases'),
           ('belief_labels')$$,
  'the user-owned tables are exactly the 18 the export/erasure contracts name');

-- ---------------------------------------------------------------------------
-- fixtures: A gets a row in EVERY user-owned table; B is the bystander
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10a@example.com', '', now(), now()),
       ('00000000-0000-4000-8000-000000000e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10b@example.com', '', now(), now());
insert into public.profiles (user_id, timezone) values
  ('00000000-0000-4000-8000-000000000e01', 'Europe/Kyiv'),
  ('00000000-0000-4000-8000-000000000e02', 'Europe/Kyiv');
insert into public.tasks (id, user_id, title, category, est_minutes, value) values
  ('10000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e01', 'task of A', 'deep', 60, 2),
  ('10000000-0000-4000-8000-000000000e02', '00000000-0000-4000-8000-000000000e02', 'task of B', 'admin', 30, 1);
insert into public.calendar_events (user_id, source, external_id, start_at, end_at, title)
values ('00000000-0000-4000-8000-000000000e01', 'google', 'ext-1', now(), now() + interval '1 hour', 'meeting');
insert into public.plans (id, user_id, plan_date, engine)
values ('20000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e01', current_date, 'learned');
insert into public.recommendations
  (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features, rationale_key, engine, status)
values ('30000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e01',
        '20000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01',
        now(), now() + interval '1 hour', 'MO.wd.fresh', '[1,0]'::jsonb, 'test', 'learned', 'shown');
insert into public.events (user_id, op_id, type, task_id, recommendation_id, client_ts, local_day)
values ('00000000-0000-4000-8000-000000000e01', 'p10-ev-1', 'focus_start',
        '10000000-0000-4000-8000-000000000e01', '30000000-0000-4000-8000-000000000e01', now(), current_date);
insert into public.feedback_rewards (user_id, recommendation_id, kind, reward, reason, category, features)
values ('00000000-0000-4000-8000-000000000e01', '30000000-0000-4000-8000-000000000e01', 'outcome', 1.0, 'completed', 'deep', '[1,0]'::jsonb);
insert into public.bandit_state (user_id, category, d, a_matrix, b_vector)
values ('00000000-0000-4000-8000-000000000e01', 'deep', 2, '{1,0,0,1}', '{0,0}');
insert into public.beta_cells (user_id, category, daypart, day_type, succ, fail, alpha0, beta0, prior_version)
values ('00000000-0000-4000-8000-000000000e01', 'deep', 'MO', 'weekday', 2, 1, 3, 1, 0);
insert into public.blend_state (user_id) values ('00000000-0000-4000-8000-000000000e01');
insert into public.cluster_assignments (user_id, cluster_id, method)
values ('00000000-0000-4000-8000-000000000e01', 1, 'rmeq_seed');
insert into public.study_assignments (user_id, phase_no, sequence, arm, starts_on, ends_on)
values ('00000000-0000-4000-8000-000000000e01', 1, 'ABAB', 'A', current_date, current_date + 14);
insert into public.gcal_sync_state (user_id, refresh_token) values ('00000000-0000-4000-8000-000000000e01', 'rt');
insert into public.duration_estimates (user_id, category, ewma_ratio, n)
values ('00000000-0000-4000-8000-000000000e01', 'deep', 1.1, 3);
insert into public.recsys_applied_tuples (user_id, recommendation_id, kind, state_version)
values ('00000000-0000-4000-8000-000000000e01', '30000000-0000-4000-8000-000000000e01', 'outcome', 1);
insert into public.sync_ops (user_id, op_id, op_type, outcome)
values ('00000000-0000-4000-8000-000000000e01', 'p10-ev-1', 'event_append', 'applied');
insert into public.sync_leases (user_id, token, expires_at)
values ('00000000-0000-4000-8000-000000000e01', gen_random_uuid(), now() + interval '30 seconds');
insert into public.belief_labels (id, user_id, category, daypart, day_type, state_ref, label, labeled_at)
values ('p10-lbl-1', '00000000-0000-4000-8000-000000000e01', 'deep', 'MO', 'weekday', 'beta:deep.MO.weekday', 'correct', now());
insert into public.deletion_audit (user_hash, reason) values ('hash-of-a', 'user_request');

select is(
  (select count(*) from (
     select 1 where exists (select 1 from public.profiles where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.tasks where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.calendar_events where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.plans where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.recommendations where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.events where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.feedback_rewards where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.bandit_state where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.beta_cells where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.blend_state where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.cluster_assignments where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.study_assignments where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.gcal_sync_state where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.duration_estimates where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.recsys_applied_tuples where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.sync_ops where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.sync_leases where user_id = '00000000-0000-4000-8000-000000000e01') union all
     select 1 where exists (select 1 from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000e01')
  ) covered),
  18::bigint, 'the fixture put a row of A in every one of the 18 user-owned tables');

-- ---------------------------------------------------------------------------
-- the erasure: one delete on auth.users (what auth.admin.deleteUser does)
-- ---------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-8000-000000000e01';

select is((select count(*) from public.profiles where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'profiles cascaded');
select is((select count(*) from public.tasks where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'tasks cascaded');
select is((select count(*) from public.calendar_events where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'calendar_events cascaded');
select is((select count(*) from public.plans where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'plans cascaded');
select is((select count(*) from public.recommendations where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'recommendations cascaded');
select is((select count(*) from public.events where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'events cascaded');
select is((select count(*) from public.feedback_rewards where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'feedback_rewards cascaded');
select is((select count(*) from public.bandit_state where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'bandit_state cascaded');
select is((select count(*) from public.beta_cells where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'beta_cells cascaded');
select is((select count(*) from public.blend_state where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'blend_state cascaded');
select is((select count(*) from public.cluster_assignments where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'cluster_assignments cascaded');
select is((select count(*) from public.study_assignments where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'study_assignments cascaded');
select is((select count(*) from public.gcal_sync_state where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'gcal_sync_state cascaded (the refresh token is gone)');
select is((select count(*) from public.duration_estimates where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'duration_estimates cascaded');
select is((select count(*) from public.recsys_applied_tuples where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'recsys_applied_tuples cascaded');
select is((select count(*) from public.sync_ops where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'sync_ops cascaded');
select is((select count(*) from public.sync_leases where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'sync_leases cascaded');
select is((select count(*) from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000e01'), 0::bigint, 'belief_labels cascaded');
select is((select count(*) from public.tasks where user_id = '00000000-0000-4000-8000-000000000e02'), 1::bigint, 'the bystander keeps their task');
select is((select count(*) from public.profiles where user_id = '00000000-0000-4000-8000-000000000e02'), 1::bigint, 'the bystander keeps their profile');
select is((select count(*) from public.deletion_audit where user_hash = 'hash-of-a'), 1::bigint, 'the proof-of-erasure row survives the cascade');

-- ---------------------------------------------------------------------------
-- retention rule: anonymous AND inactive for p_days (sign-in, event) — nothing else
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, encrypted_password, created_at, updated_at, last_sign_in_at, is_anonymous)
values ('00000000-0000-4000-8000-000000000e03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now() - interval '40 days', now(), now() - interval '35 days', true),
       ('00000000-0000-4000-8000-000000000e04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now() - interval '40 days', now(), now() - interval '40 days', true),
       ('00000000-0000-4000-8000-000000000e05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now() - interval '40 days', now(), now() - interval '40 days', false);
update auth.users set email = 'p10e@example.com' where id = '00000000-0000-4000-8000-000000000e05';
-- D is anonymous and old but still active: an event two days ago
insert into public.events (user_id, op_id, type, client_ts, server_ts, local_day)
values ('00000000-0000-4000-8000-000000000e04', 'p10-ev-d', 'task_created', now() - interval '2 days', now() - interval '2 days', current_date - 2);

select set_eq(
  $$select user_id from public.anonymous_purge_candidates(now(), 30, 50)$$,
  $$values ('00000000-0000-4000-8000-000000000e03'::uuid)$$,
  'only the anonymous account with no sign-in and no event for 30 days is a candidate');
select is((select count(*) from public.anonymous_purge_candidates(now(), 50, 50)), 0::bigint,
  'a longer window excludes it again (the rule is inactivity, not age)');

-- ---------------------------------------------------------------------------
-- profile_update replay merges settings (both branches), ignores non-objects
-- ---------------------------------------------------------------------------
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000e02', '[{"op_id":"p10-p1","op_type":"profile_update","entity_id":"00000000-0000-4000-8000-000000000e02","base_version":1,"payload":{"user_id":"00000000-0000-4000-8000-000000000e02","timezone":"Europe/Kyiv","settings":{"notifications":{"muted_categories":["admin"],"evening_ritual_time":"21:30"}},"version":2,"updated_at":"2026-08-30T10:00:00Z"}}]'::jsonb)) r),
  'applied', 'a profile_update carrying settings is applied');
select is((select settings->'notifications'->'muted_categories' from public.profiles where user_id = '00000000-0000-4000-8000-000000000e02'),
  '["admin"]'::jsonb, 'settings landed on the row');
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000e02', '[{"op_id":"p10-p2","op_type":"profile_update","entity_id":"00000000-0000-4000-8000-000000000e02","base_version":2,"payload":{"user_id":"00000000-0000-4000-8000-000000000e02","timezone":"Europe/Kyiv","version":3,"updated_at":"2026-08-30T10:01:00Z"}}]'::jsonb)) r),
  'applied', 'a profile_update without settings is applied');
select is((select settings->'notifications'->>'evening_ritual_time' from public.profiles where user_id = '00000000-0000-4000-8000-000000000e02'),
  '21:30', 'a payload without settings keeps the stored settings');
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000e02', '[{"op_id":"p10-p3","op_type":"profile_update","entity_id":"00000000-0000-4000-8000-000000000e02","base_version":3,"payload":{"user_id":"00000000-0000-4000-8000-000000000e02","timezone":"Europe/Kyiv","settings":"junk","version":4,"updated_at":"2026-08-30T10:02:00Z"}}]'::jsonb)) r),
  'applied', 'a non-object settings value does not fail the op');
select is((select settings->'notifications'->>'evening_ritual_time' from public.profiles where user_id = '00000000-0000-4000-8000-000000000e02'),
  '21:30', 'a non-object settings value is ignored, the stored settings stay');

select * from finish();
rollback;
