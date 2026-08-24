-- RLS bypass + append-only + column-guard tests (NFR-S1; specs/07 §4.4 catalog).
-- Runs via `supabase test db` against the local stack with migrations applied.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- fixtures (as postgres superuser)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000a', 'user-a@test.local'),
       ('00000000-0000-0000-0000-00000000000b', 'user-b@test.local');

insert into public.tasks (id, user_id, title, category, est_minutes, value)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
        'task of A', 'deep', 60, 2),
       ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
        'task of B', 'admin', 30, 1);

insert into public.plans (id, user_id, plan_date, engine)
values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
        current_date, 'learned');

insert into public.recommendations
  (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features,
   rationale_key, engine, status)
values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
        '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a',
        now(), now() + interval '1 hour', 'MO.wd.fresh', '[1,0]'::jsonb,
        'test', 'learned', 'shown');

insert into public.events (user_id, op_id, type, client_ts, local_day)
values ('00000000-0000-0000-0000-00000000000b', 'op-b-1', 'task_created', now(), current_date);

-- ---------------------------------------------------------------------------
-- act as user A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$select count(*) from public.tasks$$, $$values (1::bigint)$$,
  'RLS: A sees exactly their own task, never B''s');

select results_eq(
  $$select count(*) from public.tasks where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (0::bigint)$$,
  'RLS bypass attempt: filtering for B''s rows returns zero, not an error');

select throws_ok(
  $$insert into public.tasks (user_id, title, category, est_minutes, value)
    values ('00000000-0000-0000-0000-00000000000b', 'forged', 'deep', 30, 1)$$,
  '42501', null,
  'RLS: A cannot insert a task owned by B');

select results_eq(
  $$select count(*) from public.events$$, $$values (0::bigint)$$,
  'RLS: A sees none of B''s events');

select lives_ok(
  $$insert into public.events (user_id, op_id, type, client_ts, local_day)
    values ('00000000-0000-0000-0000-00000000000a', 'op-a-1', 'task_created', now(), current_date)$$,
  'events: A can append their own event');

select throws_ok(
  $$update public.events set type = 'tampered' where op_id = 'op-a-1'$$,
  '42501', null,
  'events are append-only: clients cannot UPDATE');

select throws_ok(
  $$delete from public.events where op_id = 'op-a-1'$$,
  '42501', null,
  'events are append-only: clients cannot DELETE');

select lives_ok(
  $$update public.recommendations set status = 'accepted'
    where id = '30000000-0000-0000-0000-00000000000a'$$,
  'recommendations: client may move own rec through a user-side status');

select throws_ok(
  $$update public.recommendations set status = 'displaced'
    where id = '30000000-0000-0000-0000-00000000000a'$$,
  'P0001', 'status displaced may not be set by clients',
  'recommendations: server-owned statuses are rejected by the guard trigger');

select throws_ok(
  $$update public.recommendations set slot_start = now()
    where id = '30000000-0000-0000-0000-00000000000a'$$,
  '42501', null,
  'recommendations: clients cannot rewrite placements (column grant)');

select throws_ok(
  $$select * from public.gcal_sync_state$$,
  '42501', null,
  'gcal_sync_state is invisible to clients');

select results_eq(
  $$select count(*) from public.prior_cells where version = 0$$,
  $$values (240::bigint)$$,
  'prior_cells: global reference data is readable (240 v0 cells)');

select throws_ok(
  $$insert into public.prior_cells (version, chronotype_class, category, daypart, day_type, mu0, n0)
    values (99, 'DM', 'deep', 'EM', 'weekday', 0.5, 8)$$,
  '42501', null,
  'prior_cells: clients cannot write reference data');

-- duplicate op replay is a no-op at the constraint level (unique user_id+op_id)
select throws_ok(
  $$insert into public.events (user_id, op_id, type, client_ts, local_day)
    values ('00000000-0000-0000-0000-00000000000a', 'op-a-1', 'task_created', now(), current_date)$$,
  '23505', null,
  'events: duplicate op_id replay is rejected by the unique constraint');

-- ---------------------------------------------------------------------------
-- act as user B: cannot touch A's recommendation at all
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select results_eq(
  $$select count(*) from public.recommendations$$, $$values (0::bigint)$$,
  'RLS: B sees no recommendations of A');

select lives_ok(
  $$update public.recommendations set status = 'accepted'
    where id = '30000000-0000-0000-0000-00000000000a'$$,
  'RLS: B''s update of A''s rec silently matches zero rows');

reset role;
select results_eq(
  $$select status from public.recommendations where id = '30000000-0000-0000-0000-00000000000a'$$,
  $$values ('accepted'::text)$$,
  'A''s own earlier update stuck; B''s cross-user update changed nothing');

select * from finish();
rollback;
