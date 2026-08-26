-- P5 — recsys_applied_tuples: exists, RLS on with no client access, PK, erasure cascade.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('public', 'recsys_applied_tuples', 'service id-set table exists');
select col_is_pk('public', 'recsys_applied_tuples',
  array['user_id', 'recommendation_id', 'kind'], 'composite PK (user, rec, kind)');
select ok((select relrowsecurity from pg_class where oid = 'public.recsys_applied_tuples'::regclass),
  'RLS enabled');
select is((select count(*)::int from pg_policies where tablename = 'recsys_applied_tuples'), 0,
  'no client policies at all');

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f5', 'f5@test.local');
insert into public.recsys_applied_tuples (user_id, recommendation_id, kind, state_version)
values ('00000000-0000-0000-0000-0000000000f5', '30000000-0000-0000-0000-0000000000f5', 'outcome', 1);

select throws_ok(
  $$ insert into public.recsys_applied_tuples (user_id, recommendation_id, kind, state_version)
     values ('00000000-0000-0000-0000-0000000000f5', '30000000-0000-0000-0000-0000000000f5', 'outcome', 2) $$,
  '23505', null, 'duplicate (user, rec, kind) rejected — the id-set is a set');
select throws_ok(
  $$ insert into public.recsys_applied_tuples (user_id, recommendation_id, kind, state_version)
     values ('00000000-0000-0000-0000-0000000000f5', '30000000-0000-0000-0000-0000000000f6', 'displaced', 1) $$,
  '23514', null, 'kind is the closed feedback_rewards vocabulary');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.recsys_applied_tuples $$,
  '42501', null, 'authenticated cannot read the service table even for its own rows');
set role anon;
select throws_ok(
  $$ select * from public.recsys_applied_tuples $$,
  '42501', null, 'anon cannot read the service table');
reset role;

delete from auth.users where id = '00000000-0000-0000-0000-0000000000f5';
select is((select count(*)::int from public.recsys_applied_tuples
           where user_id = '00000000-0000-0000-0000-0000000000f5'), 0,
  'erasure cascades from auth.users (FR-42)');

select * from finish();
rollback;
