-- Schema-shape tests: M-01, M-02, and seeded prior values vs hand-computed expectations
-- (File 04 §3.2-3.3; specs/07 §4.2-4.3).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- M-01
select has_column('public', 'recommendations', 'propensity', 'M-01: propensity column exists');
select col_type_is('public', 'recommendations', 'propensity', 'double precision',
  'M-01: propensity is double precision (P6: 1/3 must round-trip — spec-conflicts L22)');

-- M-02
select has_column('public', 'recommendations', 'conflict_flag', 'M-02: conflict_flag exists');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@test.local');
insert into public.tasks (id, user_id, title, category, est_minutes, value)
values ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1',
        't', 'deep', 60, 2);
insert into public.plans (id, user_id, plan_date, engine)
values ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1',
        current_date, 'heuristic');

select lives_ok(
  $$insert into public.recommendations
      (user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features,
       rationale_key, engine, status)
    values ('00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1',
            '10000000-0000-0000-0000-0000000000c1', now(), now() + interval '1 hour',
            'AF.wd.fresh', '[1]'::jsonb, 'test', 'heuristic', 'displaced_pending')$$,
  'M-02: displaced_pending is a valid status after the migration');

-- priors: byte-exact hand-computed expectations (see feat(priors) commit)
select results_eq(
  $$select count(*) from public.prior_cells where version = 0$$,
  $$values (240::bigint)$$,
  'priors: 5 classes x 4 categories x 6 dayparts x 2 day-types = 240 cells');

select ok(
  (select abs(mu0 - 0.78) < 1e-6 from public.prior_cells
    where version=0 and chronotype_class='DM' and category='deep'
      and daypart='EM' and day_type='weekday'),
  'priors: deep anchor passes through the identity transform (DM/EM = .78)');

select ok(
  (select abs(mu0 - 0.694157) < 1e-3 from public.prior_cells
    where version=0 and chronotype_class='DM' and category='admin'
      and daypart='EM' and day_type='weekday'),
  'priors: admin transform sigma(0.45*logit(.78)+0.25) = .6941');

select ok(
  (select abs(mu0 - 0.672365) < 1e-3 from public.prior_cells
    where version=0 and chronotype_class='INT' and category='physical'
      and daypart='AF' and day_type='weekday'),
  'priors: physical gets the +0.35 AF body-temperature bonus = .6724');

select ok(
  (select abs(mu0 - 0.665) < 1e-6 from public.prior_cells
    where version=0 and chronotype_class='DM' and category='deep'
      and daypart='EM' and day_type='weekend'),
  'priors: weekend blend 0.5*.78 + 0.5*.55 = .665');

select results_eq(
  $$select distinct n0 from public.prior_cells where version=0 and day_type='weekday'$$,
  $$values (8.0::real)$$,
  'priors: weekday base n0 = 8');

select results_eq(
  $$select distinct n0 from public.prior_cells where version=0 and day_type='weekend'$$,
  $$values (4.0::real)$$,
  'priors: weekend n0 halved to 4');

select * from finish();
rollback;
