-- P12 — least-privilege `recsys_service` role (migration 20260831150000): the role exists
-- with no login/superuser/bypassrls, holds EXACTLY the PostgresRepo grants, its six RLS
-- policies exist, and functionally it can read model state but not user content — and can
-- never DELETE anything. Runbook §18 carries the owner activation steps.
begin;
select plan(20);

-- role shape
select ok(exists (select 1 from pg_roles where rolname = 'recsys_service'),
  'recsys_service role exists');
select ok((select not rolcanlogin from pg_roles where rolname = 'recsys_service'),
  'recsys_service ships NOLOGIN (password is owner-set, never committed)');
select ok((select not rolsuper and not rolbypassrls and not rolcreaterole
             from pg_roles where rolname = 'recsys_service'),
  'recsys_service is not superuser, cannot bypass RLS, cannot create roles');

-- privileges are exactly repo.py's surface (no DELETE anywhere, no TRUNCATE, no REFERENCES)
select table_privs_are('public', 'beta_cells', 'recsys_service',
  array['SELECT', 'UPDATE'], 'beta_cells: select + update only');
select table_privs_are('public', 'bandit_state', 'recsys_service',
  array['SELECT', 'INSERT', 'UPDATE'], 'bandit_state: select/insert/update');
select table_privs_are('public', 'blend_state', 'recsys_service',
  array['SELECT', 'INSERT', 'UPDATE'], 'blend_state: select/insert/update');
select table_privs_are('public', 'recsys_applied_tuples', 'recsys_service',
  array['SELECT', 'INSERT'], 'recsys_applied_tuples: select + insert (ledger, no update)');
select table_privs_are('public', 'feedback_rewards', 'recsys_service',
  array['SELECT'], 'feedback_rewards: read-only (delivered_at is the edge function''s)');
select table_privs_are('public', 'belief_labels', 'recsys_service',
  array['SELECT', 'INSERT', 'UPDATE'], 'belief_labels: select/insert/update (upsert)');

-- user content and facts are fully denied
select table_privs_are('public', 'tasks', 'recsys_service',
  '{}'::text[], 'tasks: no privileges at all (titles never reach the service role)');
select table_privs_are('public', 'events', 'recsys_service',
  '{}'::text[], 'events: no privileges at all');
select table_privs_are('public', 'profiles', 'recsys_service',
  '{}'::text[], 'profiles: no privileges at all');
select table_privs_are('public', 'recommendations', 'recsys_service',
  '{}'::text[], 'recommendations: no privileges (propensities are written by the EF path)');

-- the six role-scoped policies exist (and only those)
select is(
  (select count(*) from pg_policies
     where schemaname = 'public' and 'recsys_service' = any(roles)),
  6::bigint, 'exactly six RLS policies are scoped to recsys_service');
select ok(exists (select 1 from pg_policies
     where schemaname = 'public' and tablename = 'blend_state'
       and policyname = 'recsys_service_blend_state'),
  'the recsys_service policy on blend_state exists by name');

-- functional: as recsys_service, model state is reachable, user content is not,
-- and DELETE is impossible even on granted tables. pgTAP lives in the `extensions`
-- schema, whose usage is granted to Supabase's roles but not to PUBLIC — grant it to the
-- test role for the duration of this (rolled-back) transaction only.
grant usage on schema extensions to recsys_service;
-- PG 16+: a CREATEROLE creator gets ADMIN on the new role but SET membership only via
-- createrole_self_grant — grant it explicitly so `set role` works everywhere (rolls back).
grant recsys_service to postgres;
set local role recsys_service;
select lives_ok('select count(*) from public.beta_cells',
  'recsys_service can read beta_cells');
select lives_ok('select count(*) from public.feedback_rewards where excluded = false',
  'recsys_service can read undelivered reward tuples');
select throws_ok('select count(*) from public.tasks', '42501',
  'permission denied for table tasks',
  'recsys_service cannot read tasks');
select throws_ok('select count(*) from public.events', '42501',
  'permission denied for table events',
  'recsys_service cannot read events');
select throws_ok('delete from public.beta_cells', '42501',
  'permission denied for table beta_cells',
  'recsys_service cannot delete model state (rebuilds recompute, never delete)');
reset role;

select * from finish();
rollback;
