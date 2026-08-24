-- Tests for the P1 hardening migration (adversarial-review findings 1-11) plus the
-- coverage gaps the review listed: anon denial, erasure cascade, version bump,
-- server_seq monotonicity, ON CONFLICT replay, service-table write denial.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- fixtures -------------------------------------------------------------------
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000d1', 'd@test.local'),
       ('00000000-0000-0000-0000-0000000000e1', 'e@test.local');

insert into public.tasks (id, user_id, title, category, est_minutes, value)
values ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        'referenced task', 'deep', 60, 2),
       ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1',
        'lone task', 'admin', 30, 1),
       ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1',
        'task of E', 'deep', 60, 2);

insert into public.plans (id, user_id, plan_date, engine)
values ('20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        current_date, 'learned');

insert into public.recommendations
  (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features,
   rationale_key, engine, status)
values ('30000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        '20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1',
        now(), now() + interval '1 hour', 'MO.wd.fresh', '[1]'::jsonb,
        'test', 'learned', 'shown'),
       ('30000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1',
        '20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1',
        now() + interval '2 hours', now() + interval '3 hours', 'AF.wd.fresh', '[1]'::jsonb,
        'test', 'learned', 'displaced'),
       ('30000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1',
        '20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1',
        now() + interval '4 hours', now() + interval '5 hours', 'EV.wd.fresh', '[1]'::jsonb,
        'test', 'learned', 'accepted');
update public.recommendations set attributed_at = now()
  where id = '30000000-0000-0000-0000-0000000000d3';

insert into public.feedback_rewards
  (user_id, recommendation_id, kind, reward, reason, category, features)
values ('00000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1',
        'outcome', 0.0, 'lapsed', 'deep', '[1]'::jsonb);

-- model_registry carries the v0 priors row (finding 8) -------------------------
select results_eq(
  $$select count(*) from public.model_registry where kind='priors' and version='0' and promoted$$,
  $$values (1::bigint)$$,
  'prior seed v0 is registered in model_registry (File 04 §3.5)');

-- version bump + server_seq monotonicity (as superuser on D's lone task) -------
select ok(
  (select server_seq is not null from public.tasks
    where id = '10000000-0000-0000-0000-0000000000d2'),
  'server_seq is assigned on insert');
update public.tasks set title = 'renamed', version = 99
  where id = '10000000-0000-0000-0000-0000000000d2';
select results_eq(
  $$select version from public.tasks where id = '10000000-0000-0000-0000-0000000000d2'$$,
  $$values (2)$$,
  'version bump trigger overwrites client-supplied version (1 -> 2, not 99)');
select ok(
  (select t.server_seq > r.server_seq
     from public.tasks t, public.recommendations r
    where t.id = '10000000-0000-0000-0000-0000000000d2'
      and r.id = '30000000-0000-0000-0000-0000000000d3'),
  'server_seq strictly increases across writes (pull-cursor contract)');

-- act as user D ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select throws_ok(
  $$delete from public.tasks where id = '10000000-0000-0000-0000-0000000000d1'$$,
  '23503', null,
  'finding 1: a task referenced by recommendations cannot be hard-deleted by a client');

select lives_ok(
  $$delete from public.tasks where id = '10000000-0000-0000-0000-0000000000d2'$$,
  'a task nothing references may still be hard-deleted by its owner');

select throws_ok(
  $$update public.recommendations set status = 'completed'
    where id = '30000000-0000-0000-0000-0000000000d1'$$,
  'P0001', null,
  'finding 2: completed is server-side (sync-resolve) — client set rejected');

select throws_ok(
  $$update public.recommendations set status = 'accepted'
    where id = '30000000-0000-0000-0000-0000000000d2'$$,
  'P0001', null,
  'finding 2: clients cannot resurrect a displaced recommendation');

select throws_ok(
  $$update public.recommendations set status = 'moved'
    where id = '30000000-0000-0000-0000-0000000000d3'$$,
  'P0001', null,
  'finding 2: attributed recommendations are frozen for clients');

select lives_ok(
  $$update public.recommendations set status = 'accepted'
    where id = '30000000-0000-0000-0000-0000000000d1'$$,
  'plan-review transitions still work (shown -> accepted)');

select throws_ok(
  $$insert into public.events
      (user_id, op_id, type, client_ts, local_day, server_ts)
    values ('00000000-0000-0000-0000-0000000000d1', 'forge-ts', 'task_created',
            now(), current_date, now() - interval '30 days')$$,
  '42501', null,
  'finding 3: server_ts is not client-writable');

select lives_ok(
  $$insert into public.events (user_id, op_id, type, client_ts, local_day)
    values ('00000000-0000-0000-0000-0000000000d1', 'replay-1', 'task_created',
            now(), current_date)$$,
  'client can append an event without server-owned columns');

select lives_ok(
  $$insert into public.events (user_id, op_id, type, client_ts, local_day)
    values ('00000000-0000-0000-0000-0000000000d1', 'replay-1', 'task_created',
            now(), current_date)
    on conflict (user_id, op_id) do nothing$$,
  'NFR-R1: duplicate op replay via ON CONFLICT DO NOTHING is a clean no-op');

select results_eq(
  $$select count(*) from public.events where op_id = 'replay-1'$$,
  $$values (1::bigint)$$,
  'replayed op left exactly one row');

select throws_ok(
  $$insert into public.events (user_id, op_id, type, task_id, client_ts, local_day)
    values ('00000000-0000-0000-0000-0000000000d1', 'oracle-1', 'task_created',
            '10000000-0000-0000-0000-0000000000e1', now(), current_date)$$,
  '42501', null,
  'finding 7: events may not reference another user''s task');

select throws_ok(
  $$insert into public.events (user_id, op_id, type, payload, client_ts, local_day)
    values ('00000000-0000-0000-0000-0000000000d1', 'huge-1', 'task_created',
            to_jsonb(repeat('x', 70000)), now(), current_date)$$,
  '23514', null,
  'finding 11: oversized event payload is rejected');

select throws_ok(
  $$select setval('public.sync_seq', 1)$$,
  '42501', null,
  'finding 6: clients cannot rewind the global sync sequence');

select throws_ok(
  $$insert into public.feedback_rewards
      (user_id, recommendation_id, kind, reward, reason, category, features)
    values ('00000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1',
            'override_in', 0.7, 'override', 'deep', '[1]'::jsonb)$$,
  '42501', null,
  'clients cannot write reward tuples (client never computes rewards)');

select throws_ok(
  $$insert into public.plans (user_id, plan_date, engine)
    values ('00000000-0000-0000-0000-0000000000d1', current_date, 'learned')$$,
  '42501', null,
  'clients cannot author plans');

select throws_ok(
  $$select * from public.deletion_audit$$,
  '42501', null,
  'deletion_audit is invisible to clients');

-- anon: no access to anything -------------------------------------------------
set local role anon;
select throws_ok(
  $$select count(*) from public.tasks$$, '42501', null,
  'anon cannot read tasks');
select throws_ok(
  $$select count(*) from public.prior_cells$$, '42501', null,
  'anon cannot read even global reference data');

-- erasure cascade (FR-42): deleting the auth user empties every user-owned table
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
select results_eq(
  $$select (select count(*) from public.tasks    where user_id = '00000000-0000-0000-0000-0000000000d1')
        + (select count(*) from public.plans     where user_id = '00000000-0000-0000-0000-0000000000d1')
        + (select count(*) from public.recommendations where user_id = '00000000-0000-0000-0000-0000000000d1')
        + (select count(*) from public.events    where user_id = '00000000-0000-0000-0000-0000000000d1')
        + (select count(*) from public.feedback_rewards where user_id = '00000000-0000-0000-0000-0000000000d1')$$,
  $$values (0::bigint)$$,
  'FR-42: erasure cascades through every user-owned table despite NO ACTION FKs');

select * from finish();
rollback;
