-- P11 — training/registry/study server contract (ADR-0015): cluster_cells is service-only,
-- the artifacts bucket exists, the φ vocabulary is schema-pinned, instantiate_user_priors
-- follows the PROMOTED registry version (eval gate), enroll_participant writes File 06 §1.2
-- exactly, diagnose_user answers counts-only, and every whitelisted closed-vocab text column
-- is CHECK-constrained (NFR-S3 rule; mirrored by training/tests/test_whitelist.py).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ===========================================================================
-- §1 objects
-- ===========================================================================
select has_table('public', 'cluster_cells', 'cluster_cells exists');
select ok((select relrowsecurity from pg_class where oid = 'public.cluster_cells'::regclass),
  'cluster_cells has RLS enabled');
select is((select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'cluster_cells'),
  0::bigint, 'cluster_cells has NO policies (service-role only, like gcal_sync_state)');
select is((select count(*) from storage.buckets where id = 'models' and not public),
  1::bigint, 'private storage bucket models exists (ADR-0011: EU artifact home)');
select is((select count(*) from pg_constraint
    where conname = 'recommendations_context_bucket_check'),
  1::bigint, 'recommendations.context_bucket is pinned to the phi vocabulary');
select is((select count(*) from public.model_registry
    where kind = 'priors' and version = '0' and promoted),
  1::bigint, 'seed priors v0 carry a promoted registry row');
select has_function('public', 'enroll_participant', 'enroll_participant() exists');
select has_function('public', 'diagnose_user', 'diagnose_user() exists');
select is(has_function_privilege('authenticated',
    'public.enroll_participant(uuid, text, boolean, date)', 'execute'),
  false, 'clients cannot enroll participants');
select is(has_function_privilege('anon',
    'public.diagnose_user(text)', 'execute'),
  false, 'anon cannot diagnose users');

-- ===========================================================================
-- §2 NFR-S3 rule: every closed-vocab text column of the training/archive whitelist has a
-- CHECK constraint in the schema (the pair list is pinned to hourwell_training.whitelist
-- by training/tests/test_whitelist.py — keep one pair per line)
-- ===========================================================================
create temp table __wl (t text, col text);
insert into __wl (t, col) values
  ('profiles', 'chronotype_class'),
  ('beta_cells', 'category'),
  ('beta_cells', 'daypart'),
  ('beta_cells', 'day_type'),
  ('feedback_rewards', 'kind'),
  ('feedback_rewards', 'category'),
  ('recommendations', 'context_bucket'),
  ('recommendations', 'engine'),
  ('recommendations', 'status'),
  ('plans', 'horizon'),
  ('plans', 'engine'),
  ('plans', 'arm'),
  ('cluster_assignments', 'method'),
  ('study_assignments', 'sequence'),
  ('study_assignments', 'arm');
select ok((select bool_and(exists (
    select 1 from pg_constraint c
     where c.conrelid = format('public.%I', w.t)::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ ('\m' || w.col || '\M')))
  from __wl w),
  'every whitelisted closed-vocab text column is CHECK-constrained (NFR-S3)');

-- ===========================================================================
-- §3 the phi CHECK guards NEW rows (NOT VALID leaves history alone)
-- ===========================================================================
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000f101', 'p11x@test.local');
insert into public.profiles
  (user_id, working_hours, rmeq_score, chronotype_class, survey_skipped, onboarding_completed_at)
values ('00000000-0000-4000-8000-00000000f101',
        '{"mon":[540,1080],"tue":[540,1080],"wed":[540,1080],"thu":[540,1080],"fri":[540,1080]}',
        14, 'INT', false, now());
insert into public.tasks (id, user_id, title, category, est_minutes, value)
values ('10000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f101',
        'p11 task', 'deep', 60, 2);
insert into public.plans (id, user_id, plan_date, engine)
values ('20000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f101',
        current_date, 'learned');
select throws_ok(
  $$insert into public.recommendations
      (user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features,
       rationale_key, engine)
    values ('00000000-0000-4000-8000-00000000f101', '20000000-0000-4000-8000-00000000f101',
            '10000000-0000-4000-8000-00000000f101', now(), now() + interval '1 hour',
            'NOT.A.BUCKET', '[]', 'best_available', 'learned')$$,
  '23514', null, 'a new recommendation with an unknown bucket id is rejected');
select lives_ok(
  $$insert into public.recommendations
      (user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features,
       rationale_key, engine)
    values ('00000000-0000-4000-8000-00000000f101', '20000000-0000-4000-8000-00000000f101',
            '10000000-0000-4000-8000-00000000f101', now(), now() + interval '1 hour',
            'MO.wd.fresh', '[]', 'best_available', 'learned')$$,
  'a vocabulary bucket id is accepted');

-- ===========================================================================
-- §4 the eval gate: an UNPROMOTED prior refresh is inert; a promoted one takes over
-- (user X above onboarded BEFORE v99 existed: prior_version 0 on all 48 cells)
-- ===========================================================================
select results_eq(
  $$select count(*) from public.beta_cells
     where user_id = '00000000-0000-4000-8000-00000000f101' and prior_version = 0$$,
  $$values (48::bigint)$$,
  'baseline: the pre-refresh user sits on seed v0');

insert into public.prior_cells (version, chronotype_class, category, daypart, day_type, mu0, n0)
values (99, 'INT', 'deep', 'MO', 'weekday', 0.7, 8);
insert into public.model_registry (kind, version, artifact_uri, metrics, promoted)
values ('priors', '99', null, '{}'::jsonb, false);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000f102', 'p11y@test.local');
insert into public.profiles
  (user_id, working_hours, rmeq_score, chronotype_class, survey_skipped, onboarding_completed_at)
values ('00000000-0000-4000-8000-00000000f102',
        '{"mon":[540,1080],"tue":[540,1080],"wed":[540,1080],"thu":[540,1080],"fri":[540,1080]}',
        14, 'INT', false, now());
select results_eq(
  $$select count(*) filter (where prior_version = 0), count(*) filter (where prior_version = 99)
      from public.beta_cells where user_id = '00000000-0000-4000-8000-00000000f102'$$,
  $$values (48::bigint, 0::bigint)$$,
  'an unpromoted refresh never reaches a new user (ADR-0015 eval gate)');

update public.model_registry set promoted = true where kind = 'priors' and version = '99';
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000f103', 'p11z@test.local');
insert into public.profiles
  (user_id, working_hours, rmeq_score, chronotype_class, survey_skipped, onboarding_completed_at)
values ('00000000-0000-4000-8000-00000000f103',
        '{"mon":[540,1080],"tue":[540,1080],"wed":[540,1080],"thu":[540,1080],"fri":[540,1080]}',
        14, 'INT', false, now());
select results_eq(
  $$select count(*), min(prior_version), round(min(alpha0)::numeric, 5)
      from public.beta_cells where user_id = '00000000-0000-4000-8000-00000000f103'$$,
  $$values (1::bigint, 99, 5.60000::numeric)$$,
  'a promoted refresh takes over: v99 rows only (1 cell, in-hours: 8 * 0.7 = 5.6)');

-- ===========================================================================
-- §5 enroll_participant — File 06 §1.2: 4 phases x 14 days, arms from the sequence
-- ===========================================================================
select results_eq(
  $$select public.enroll_participant('00000000-0000-4000-8000-00000000f101'::uuid,
                                     'BABA', true, date '2026-10-05')$$,
  $$values (4)$$,
  'enrollment writes four phases');
select results_eq(
  $$select phase_no::int, arm, starts_on, ends_on
      from public.study_assignments
     where user_id = '00000000-0000-4000-8000-00000000f101' order by phase_no$$,
  $$values (1, 'B', date '2026-10-05', date '2026-10-18'),
           (2, 'A', date '2026-10-19', date '2026-11-01'),
           (3, 'B', date '2026-11-02', date '2026-11-15'),
           (4, 'A', date '2026-11-16', date '2026-11-29')$$,
  'BABA: contiguous 2-week phases with arms from the sequence');
select ok((select research_cohort and eu_eea_resident from public.profiles
    where user_id = '00000000-0000-4000-8000-00000000f101'),
  'enrollment stamps research_cohort and the G6 EU/EEA answer');
select throws_ok(
  $$select public.enroll_participant('00000000-0000-4000-8000-00000000f101'::uuid,
                                     'ABAB', false, date '2026-10-05')$$,
  'P0001', 'user 00000000-0000-4000-8000-00000000f101 is already enrolled',
  're-enrollment raises instead of rewriting dates');
select throws_ok(
  $$select public.enroll_participant('00000000-0000-4000-8000-00000000f102'::uuid,
                                     'AABB', true, date '2026-10-05')$$,
  'P0001', 'sequence must be ABAB or BABA, got AABB',
  'an off-design sequence is rejected');
select throws_ok(
  $$select public.enroll_participant('99999999-0000-4000-8000-000000000000'::uuid,
                                     'ABAB', true, date '2026-10-05')$$,
  'P0001', 'no profile for user 99999999-0000-4000-8000-000000000000 (onboarding must complete first)',
  'a user without a profile cannot be enrolled');

-- ===========================================================================
-- §6 diagnose_user — counts and timestamps only (privacy README §7)
-- ===========================================================================
select results_eq(
  $$select (public.diagnose_user('p11x@test.local') ->> 'tasks')::int,
           ((public.diagnose_user('p11x@test.local') -> 'study') ->> 'enrolled')::boolean,
           ((public.diagnose_user('p11x@test.local') -> 'profile') ->> 'research_cohort')::boolean$$,
  $$values (1, true, true)$$,
  'diagnose_user answers counts/flags for the matched user');
select ok((select public.diagnose_user('p11x@test.local') ? 'user_hash'),
  'diagnose_user identifies by hash, not id');
select ok((select not (public.diagnose_user('p11x@test.local'))::text ilike '%p11 task%'),
  'diagnose_user leaks no content column');
select throws_ok(
  $$select public.diagnose_user('nobody@test.local')$$,
  'P0001', 'no user with that email',
  'an unknown email raises (no silent nulls to probe)');

select * from finish();
rollback;
