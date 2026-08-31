-- P7 — feedback-loop server contract: the 23:55-local attribution boundary (DST-safe, in the
-- profile timezone), the status/attributed filters (displaced rows never attribute — File 05 §1),
-- service-only access to the helper, the duration_estimates RLS, the cron job and the no-op tick.
begin;
select plan(32);

select has_extension('pg_net', 'pg_net is installed (cron → edge function HTTP)');
select has_table('public', 'duration_estimates', 'duration_estimates exists');
select has_function('public', 'attribution_due', array['timestamp with time zone', 'integer'], 'attribution_due(p_now, p_limit) exists');
select has_function('public', 'attribution_sweep_tick', 'attribution_sweep_tick() exists');
select has_index('public', 'events', 'events_user_rec_idx', 'events (user_id, recommendation_id) index exists');
select has_index('public', 'events', 'events_user_task_day_idx', 'events (user_id, task_id, local_day) index exists');
select has_column('public', 'feedback_rewards', 'delivered_at', 'feedback_rewards.delivered_at exists (re-delivery marker)');
select has_index('public', 'feedback_rewards', 'feedback_rewards_undelivered_idx', 'undelivered tuples index exists');

-- two users; A lives in Europe/Kyiv (DST: +03 until 2026-10-25 04:00 local, +02 after)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000b01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p7a@example.com', '', now(), now()),
       ('00000000-0000-4000-8000-000000000b02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p7b@example.com', '', now(), now());
insert into public.profiles (user_id, timezone) values
  ('00000000-0000-4000-8000-000000000b01', 'Europe/Kyiv'),
  ('00000000-0000-4000-8000-000000000b02', 'America/Los_Angeles');
insert into public.tasks (id, user_id, title, category, est_minutes, value) values
  ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-000000000b01', 't', 'deep', 60, 2),
  ('00000000-0000-4000-8000-00000000bb02', '00000000-0000-4000-8000-000000000b02', 't', 'admin', 30, 1);
insert into public.plans (id, user_id, plan_date, horizon, engine, model_version, solver_status, telemetry) values
  ('00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-000000000b01', '2026-10-24', 'day', 'learned', 'recsys-p5.0', 'OPTIMAL', '{}'),
  ('00000000-0000-4000-8000-00000000bc02', '00000000-0000-4000-8000-000000000b02', '2026-10-24', 'day', 'learned', 'recsys-p5.0', 'OPTIMAL', '{}');

-- recommendations (features are placeholders; the mapping reads them, the SQL does not)
insert into public.recommendations (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features, rationale_key, engine, model_version, status, attributed_at)
values
  -- r1: plain DST day (+03): 14:00–15:00 local on 2026-10-24
  ('00000000-0000-4000-8000-00000000bd01', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 11:00+00', '2026-10-24 12:00+00', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown', null),
  -- r2: ends 01:30 local on the fall-back day 2026-10-25 (still +03 at that hour) — local day is the 25th
  ('00000000-0000-4000-8000-00000000bd02', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 21:30+00', '2026-10-24 22:30+00', 'NT.wd', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'accepted', null),
  -- r3: 10:00–11:00 local on 2026-10-25 after the change (+02)
  ('00000000-0000-4000-8000-00000000bd03', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-25 08:00+00', '2026-10-25 09:00+00', 'MO.we', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'moved', null),
  -- r4: spring-forward day 2026-03-29 (+02 → +03 at 03:00): 10:00–11:00 local = 07:00–08:00Z
  ('00000000-0000-4000-8000-00000000bd04', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-03-29 07:00+00', '2026-03-29 08:00+00', 'MO.we', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'pinned', null),
  -- r5: displaced — never attributes (no reward, File 05 §1)
  ('00000000-0000-4000-8000-00000000bd05', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 08:00+00', '2026-10-24 09:00+00', 'MO.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'displaced', null),
  -- r6: already attributed — never again
  ('00000000-0000-4000-8000-00000000bd06', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 06:00+00', '2026-10-24 07:00+00', 'MO.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown', '2026-10-24 21:00+00'),
  -- r7: expired by a re-plan — never attributes
  ('00000000-0000-4000-8000-00000000bd07', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 06:00+00', '2026-10-24 07:00+00', 'MO.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'expired', null),
  -- r9: 23:30–23:50 local (+03) on 2026-10-24 = 20:30–20:50Z — the slot end + 15 min grace must have passed
  ('00000000-0000-4000-8000-00000000bd09', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bc01', '00000000-0000-4000-8000-00000000bb01',
   '2026-10-24 20:30+00', '2026-10-24 20:50+00', 'NT.wd', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown', null),
  -- r8: user B in Los Angeles (−07 on 2026-10-24): 14:00–15:00 local = 21:00–22:00Z; due at 23:55 PDT = 06:55Z next day
  ('00000000-0000-4000-8000-00000000bd08', '00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-00000000bc02', '00000000-0000-4000-8000-00000000bb02',
   '2026-10-24 21:00+00', '2026-10-24 22:00+00', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown', null);

-- r1: due exactly at 23:55 local (+03) = 20:55Z on the 24th, not one second earlier
select is((select count(*) from public.attribution_due('2026-10-24 20:54:59+00') where id = '00000000-0000-4000-8000-00000000bd01'), 0::bigint, 'r1 not due at 23:54:59 local');
select is((select count(*) from public.attribution_due('2026-10-24 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd01'), 1::bigint, 'r1 due at 23:55:00 local (+03)');
select is((select local_day from public.attribution_due('2026-10-24 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd01'), '2026-10-24'::date, 'r1 local day is the 24th');
-- r2: ended 01:30 local on the 25th; the 25th closes at 23:55 EET (+02) = 21:55Z, NOT 20:55Z (the pre-change offset)
select is((select count(*) from public.attribution_due('2026-10-24 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd02'), 0::bigint, 'r2 (local day 25th) not due when the 24th closes');
select is((select count(*) from public.attribution_due('2026-10-25 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd02'), 0::bigint, 'r2 not due at 22:55 EET (the old +03 boundary)');
select is((select count(*) from public.attribution_due('2026-10-25 21:55:00+00') where id = '00000000-0000-4000-8000-00000000bd02'), 1::bigint, 'r2 due at 23:55 EET (+02) after the fall-back');
select is((select local_day from public.attribution_due('2026-10-25 21:55:00+00') where id = '00000000-0000-4000-8000-00000000bd02'), '2026-10-25'::date, 'r2 local day is the 25th (wall clock, not UTC date)');
-- r3: same post-change day
select is((select count(*) from public.attribution_due('2026-10-25 21:54:59+00') where id = '00000000-0000-4000-8000-00000000bd03'), 0::bigint, 'r3 not due one second before 23:55 EET');
select is((select count(*) from public.attribution_due('2026-10-25 21:55:00+00') where id = '00000000-0000-4000-8000-00000000bd03'), 1::bigint, 'r3 (moved) due at 23:55 EET');
-- r4: spring-forward day closes at 23:55 EEST (+03) = 20:55Z, not 21:55Z
select is((select count(*) from public.attribution_due('2026-03-29 20:54:59+00') where id = '00000000-0000-4000-8000-00000000bd04'), 0::bigint, 'r4 not due before 23:55 EEST');
select is((select count(*) from public.attribution_due('2026-03-29 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd04'), 1::bigint, 'r4 (pinned) due at 23:55 EEST (+03) on the spring-forward day');
-- filters
select is((select count(*) from public.attribution_due('2027-01-01 00:00+00') where id in ('00000000-0000-4000-8000-00000000bd05', '00000000-0000-4000-8000-00000000bd06', '00000000-0000-4000-8000-00000000bd07')), 0::bigint, 'displaced, attributed and expired rows are never due');
-- r8: another timezone in the same sweep
select is((select count(*) from public.attribution_due('2026-10-25 06:54:59+00') where id = '00000000-0000-4000-8000-00000000bd08'), 0::bigint, 'LA row not due before 23:55 PDT');
select is((select count(*) from public.attribution_due('2026-10-25 06:55:00+00') where id = '00000000-0000-4000-8000-00000000bd08'), 1::bigint, 'LA row due at 23:55 PDT (06:55Z)');
select is((select category from public.attribution_due('2026-10-25 06:55:00+00') where id = '00000000-0000-4000-8000-00000000bd08'), 'admin', 'the task category rides along for the tuple');

-- r9: the day closed at 20:55Z but slot_end + grace = 21:05Z — not due until then (adversarial #12)
select is((select count(*) from public.attribution_due('2026-10-24 20:55:00+00') where id = '00000000-0000-4000-8000-00000000bd09'), 0::bigint, 'a block ending 23:50 is not due at 23:55 (grace not over)');
select is((select count(*) from public.attribution_due('2026-10-24 21:05:00+00') where id = '00000000-0000-4000-8000-00000000bd09'), 1::bigint, 'it is due once slot_end + 15 min has passed');
-- an unusable timezone is rejected on write (adversarial #20)
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus' where user_id = '00000000-0000-4000-8000-000000000b02' $$,
  '22023', null, 'profiles.timezone must be a known IANA zone');

-- cron + tick
select is((select count(*) from cron.job where jobname = 'attribute-rewards-sweep' and schedule = '*/15 * * * *'), 1::bigint, 'attribute-rewards-sweep is scheduled every 15 minutes');
select matches(public.attribution_sweep_tick(), '^skipped', 'the tick is a no-op without Vault secrets');

-- duration_estimates: service writes, owner reads own, others nothing, clients never write
insert into public.duration_estimates (user_id, category, ewma_ratio, n) values ('00000000-0000-4000-8000-000000000b01', 'deep', 1.25, 3);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
select is((select ewma_ratio from public.duration_estimates where category = 'deep'), 1.25::double precision, 'owner reads own duration estimate');
select throws_ok(
  $$ insert into public.duration_estimates (user_id, category, ewma_ratio, n) values ('00000000-0000-4000-8000-000000000b01', 'admin', 1.0, 1) $$,
  '42501', null, 'clients cannot write duration estimates (service-authored)');
select throws_ok($$ select * from public.attribution_due() $$, '42501', null, 'clients cannot call attribution_due');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}', true);
select is((select count(*) from public.duration_estimates), 0::bigint, 'other user sees no duration estimates');

select * from finish();
rollback;
