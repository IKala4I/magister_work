-- P8 — sync server contract (File 05 §2; ADR-0012): replay ledger (duplicate op replay is a
-- no-op), base_version conflicts return the server row, ownership is enforced inside the RPC,
-- plan-review statuses are state-checked, the pull is RLS-filtered and cursor-ordered, the
-- per-user lease, atomic plan persistence, displaced_pending in the daily slice, the sweep tick.
begin;
select plan(85);

-- schema
select has_table('public', 'sync_ops', 'sync_ops ledger exists');
select has_table('public', 'sync_leases', 'sync_leases exists');
select has_column('public', 'calendar_events', 'deleted_at', 'calendar_events.deleted_at exists (cancelled meetings converge)');
select has_column('public', 'gcal_sync_state', 'refresh_token', 'gcal_sync_state.refresh_token exists (server-held OAuth)');
select has_column('public', 'gcal_sync_state', 'write_back', 'gcal_sync_state.write_back exists (FR-03 opt-in)');
select has_column('public', 'profiles', 'eu_eea_resident', 'profiles.eu_eea_resident exists (ADR-0011 Art. 27 trigger)');
select has_column('public', 'recommendations', 'gcal_event_id', 'recommendations.gcal_event_id exists (write-back mirror)');
select has_column('public', 'recommendations', 'gcal_synced_slot_start', 'recommendations.gcal_synced_slot_start exists');
select has_column('public', 'gcal_sync_state', 'confirmed_at', 'gcal_sync_state.confirmed_at exists (consent bound to the starting device — adversarial #10)');
select has_function('public', 'sync_replay', array['uuid', 'jsonb'], 'sync_replay(user, ops) exists');
select has_function('public', 'sync_pull', array['bigint', 'integer'], 'sync_pull(cursor, limit) exists');
select has_function('public', 'persist_plan', array['uuid', 'jsonb', 'jsonb', 'uuid[]'], 'persist_plan() exists');
select has_function('public', 'acquire_sync_lease', array['uuid', 'integer'], 'acquire_sync_lease() exists');
select has_function('public', 'release_sync_lease', array['uuid', 'uuid'], 'release_sync_lease() exists');
select has_function('public', 'gcal_sweep_tick', 'gcal_sweep_tick() exists');
select is((select count(*) from cron.job where jobname = 'gcal-sweep' and schedule = '*/5 * * * *'), 1::bigint, 'gcal-sweep is scheduled every 5 minutes');
select matches(public.gcal_sweep_tick(), '^skipped', 'the sweep tick is a no-op without connected calendars');

-- fixtures: A (Kyiv) with a task, a plan, two recommendations; B with a task and no profile
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p8a@example.com', '', now(), now()),
       ('00000000-0000-4000-8000-000000000c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p8b@example.com', '', now(), now());
insert into public.profiles (user_id, timezone) values ('00000000-0000-4000-8000-000000000c01', 'Europe/Kyiv');
insert into public.tasks (id, user_id, title, category, est_minutes, value) values
  ('00000000-0000-4000-8000-00000000cb01', '00000000-0000-4000-8000-000000000c01', 'a1', 'deep', 60, 2),
  ('00000000-0000-4000-8000-00000000cb02', '00000000-0000-4000-8000-000000000c02', 'b1', 'admin', 30, 1);
insert into public.plans (id, user_id, plan_date, horizon, engine, model_version, solver_status, telemetry) values
  ('00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-000000000c01', '2026-08-28', 'day', 'learned', 'recsys-p5.0', 'OPTIMAL', '{}');
insert into public.recommendations (id, user_id, plan_id, task_id, slot_start, slot_end, context_bucket, features, rationale_key, engine, model_version, status)
values
  ('00000000-0000-4000-8000-00000000cd01', '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000cb01',
   '2026-08-28 11:00+00', '2026-08-28 12:00+00', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'shown'),
  ('00000000-0000-4000-8000-00000000cd02', '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000cb01',
   '2026-08-28 13:00+00', '2026-08-28 14:00+00', 'AF.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'displaced_pending'),
  ('00000000-0000-4000-8000-00000000cd03', '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000cb01',
   '2026-08-28 08:00+00', '2026-08-28 09:00+00', 'MO.wd.fresh', '[0]', 'best_available', 'learned', 'recsys-p5.0', 'displaced');

-- ---------------------------------------------------------------------------
-- sync_replay: a first batch — create, fact, plan-review status
-- ---------------------------------------------------------------------------
create temp table batch1 as select $$[
  {"op_id": "dev-000000000001", "op_type": "task_upsert", "entity_id": "00000000-0000-4000-8000-00000000ce01", "base_version": null,
   "payload": {"id": "00000000-0000-4000-8000-00000000ce01", "user_id": "00000000-0000-4000-8000-000000000c01", "title": "new offline task",
               "category": "admin", "est_minutes": 45, "deadline": null, "value": 2, "splittable": false, "earliest_start": null,
               "recurrence": null, "status": "inbox", "done_at": null, "postpone_count": 0, "deleted_at": null, "version": 1,
               "created_at": 1756380000000, "updated_at": 1756380000000}},
  {"op_id": "dev-000000000002", "op_type": "event_append", "entity_id": "00000000-0000-4000-8000-00000000ce01", "base_version": null,
   "payload": {"op_id": "dev-000000000002", "user_id": "00000000-0000-4000-8000-000000000c01", "type": "task_created",
               "task_id": "00000000-0000-4000-8000-00000000ce01", "recommendation_id": null, "payload": {"source": "form"},
               "context": {"tz": "Europe/Kyiv"}, "client_ts": 1756380000000, "local_day": "2026-08-28"}},
  {"op_id": "dev-000000000003", "op_type": "recommendation_status", "entity_id": "00000000-0000-4000-8000-00000000cd01", "base_version": 1,
   "payload": {"id": "00000000-0000-4000-8000-00000000cd01", "status": "accepted", "version": 1}}
]$$::jsonb as ops;

create temp table res1 as select public.sync_replay('00000000-0000-4000-8000-000000000c01', (select ops from batch1)) as r;

select is((select jsonb_array_length(r) from res1), 3, 'batch 1: three results');
select is((select r->0->>'outcome' from res1), 'applied', 'batch 1: task create applied');
select is((select r->1->>'outcome' from res1), 'applied', 'batch 1: event appended (class 1)');
select is((select r->2->>'outcome' from res1), 'applied', 'batch 1: accepted applied (class 3)');
select is((select version from public.tasks where id = '00000000-0000-4000-8000-00000000ce01'), 1, 'created task has version 1');
select is((select count(*) from public.events where user_id = '00000000-0000-4000-8000-000000000c01' and op_id = 'dev-000000000002'), 1::bigint, 'event row exists once');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000cd01'), 'accepted', 'recommendation moved to accepted');
select is((select count(*) from public.sync_ops where user_id = '00000000-0000-4000-8000-000000000c01'), 3::bigint, 'three ledger rows');

-- replaying the SAME batch is a no-op (NFR-R1 acceptance)
create temp table res1b as select public.sync_replay('00000000-0000-4000-8000-000000000c01', (select ops from batch1)) as r;
select is((select r->0->>'outcome' from res1b), 'duplicate', 'replay: task op is a duplicate');
select is((select r->1->>'outcome' from res1b), 'duplicate', 'replay: event op is a duplicate');
select is((select r->2->>'outcome' from res1b), 'duplicate', 'replay: status op is a duplicate');
select is((select version from public.tasks where id = '00000000-0000-4000-8000-00000000ce01'), 1, 'replay changed nothing: version still 1');
select is((select count(*) from public.events where user_id = '00000000-0000-4000-8000-000000000c01'), 1::bigint, 'replay changed nothing: one event');
select is((select count(*) from public.sync_ops where user_id = '00000000-0000-4000-8000-000000000c01'), 3::bigint, 'replay changed nothing: ledger unchanged');

-- ---------------------------------------------------------------------------
-- class 2: base_version checks and the conflict + server row
-- ---------------------------------------------------------------------------
create temp table res2 as select public.sync_replay('00000000-0000-4000-8000-000000000c01', $$[
  {"op_id": "dev-000000000004", "op_type": "task_upsert", "entity_id": "00000000-0000-4000-8000-00000000ce01", "base_version": 1,
   "payload": {"id": "00000000-0000-4000-8000-00000000ce01", "user_id": "00000000-0000-4000-8000-000000000c01", "title": "edited once",
               "category": "admin", "est_minutes": 50, "deadline": 1756500000000, "value": 3, "splittable": true, "earliest_start": null,
               "recurrence": null, "status": "inbox", "done_at": null, "postpone_count": 1, "deleted_at": null, "version": 2,
               "created_at": 1756380000000, "updated_at": 1756381000000}},
  {"op_id": "dev-000000000005", "op_type": "task_upsert", "entity_id": "00000000-0000-4000-8000-00000000ce01", "base_version": 1,
   "payload": {"id": "00000000-0000-4000-8000-00000000ce01", "user_id": "00000000-0000-4000-8000-000000000c01", "title": "stale edit",
               "category": "admin", "est_minutes": 50, "deadline": null, "value": 3, "splittable": true, "earliest_start": null,
               "recurrence": null, "status": "inbox", "done_at": null, "postpone_count": 1, "deleted_at": null, "version": 2,
               "created_at": 1756380000000, "updated_at": 1756382000000}}
]$$::jsonb) as r;
select is((select r->0->>'outcome' from res2), 'applied', 'edit with the right base_version applies');
select is((select (r->0->>'version')::int from res2), 2, 'applied result carries the bumped version');
select is((select title from public.tasks where id = '00000000-0000-4000-8000-00000000ce01'), 'edited once', 'edit landed');
select is((select r->1->>'outcome' from res2), 'conflict', 'stale base_version → conflict');
select is((select (r->1->'row'->>'version')::int from res2), 2, 'conflict carries the server row (version 2)');
select is((select r->1->'row'->>'title' from res2), 'edited once', 'conflict carries the server row (title)');
select is((select count(*) from public.sync_ops where op_id = 'dev-000000000005'), 0::bigint, 'a conflict is not ledgered (the op will be replayed merged)');

create temp table res3 as select public.sync_replay('00000000-0000-4000-8000-000000000c01', $$[
  {"op_id": "dev-000000000006", "op_type": "task_delete", "entity_id": "00000000-0000-4000-8000-00000000ce01", "base_version": 2,
   "payload": {"id": "00000000-0000-4000-8000-00000000ce01", "user_id": "00000000-0000-4000-8000-000000000c01", "deleted_at": 1756383000000, "version": 3}}
]$$::jsonb) as r;
select is((select r->0->>'outcome' from res3), 'applied', 'tombstone applies with the right base_version');
select isnt((select deleted_at from public.tasks where id = '00000000-0000-4000-8000-00000000ce01'), null, 'task is soft-deleted');
select is((select version from public.tasks where id = '00000000-0000-4000-8000-00000000ce01'), 3, 'delete bumped the version');

-- ---------------------------------------------------------------------------
-- ownership and vocabulary are enforced inside the RPC (security definer ≠ RLS)
-- ---------------------------------------------------------------------------
create temp table res4 as select public.sync_replay('00000000-0000-4000-8000-000000000c01', $$[
  {"op_id": "dev-000000000007", "op_type": "task_upsert", "entity_id": "00000000-0000-4000-8000-00000000cb02", "base_version": 1,
   "payload": {"id": "00000000-0000-4000-8000-00000000cb02", "user_id": "00000000-0000-4000-8000-000000000c01", "title": "steal b1",
               "category": "admin", "est_minutes": 30, "deadline": null, "value": 1, "splittable": false, "earliest_start": null,
               "recurrence": null, "status": "inbox", "done_at": null, "postpone_count": 0, "deleted_at": null, "version": 2,
               "created_at": 1756380000000, "updated_at": 1756380000000}},
  {"op_id": "dev-000000000008", "op_type": "event_append", "entity_id": null, "base_version": null,
   "payload": {"op_id": "dev-000000000008", "user_id": "00000000-0000-4000-8000-000000000c01", "type": "task_completed",
               "task_id": "00000000-0000-4000-8000-00000000cb02", "recommendation_id": null, "payload": {}, "context": {},
               "client_ts": 1756380000000, "local_day": "2026-08-28"}},
  {"op_id": "dev-000000000009", "op_type": "task_upsert", "entity_id": "00000000-0000-4000-8000-00000000ce02", "base_version": null,
   "payload": {"id": "00000000-0000-4000-8000-00000000ce02", "user_id": "00000000-0000-4000-8000-000000000c02", "title": "forged owner",
               "category": "admin", "est_minutes": 30, "deadline": null, "value": 1, "splittable": false, "earliest_start": null,
               "recurrence": null, "status": "inbox", "done_at": null, "postpone_count": 0, "deleted_at": null, "version": 1,
               "created_at": 1756380000000, "updated_at": 1756380000000}},
  {"op_id": "dev-000000000010", "op_type": "recommendation_status", "entity_id": "00000000-0000-4000-8000-00000000cd01", "base_version": 2,
   "payload": {"id": "00000000-0000-4000-8000-00000000cd01", "status": "completed", "version": 2}},
  {"op_id": "dev-000000000011", "op_type": "recommendation_status", "entity_id": "00000000-0000-4000-8000-00000000cd02", "base_version": 1,
   "payload": {"id": "00000000-0000-4000-8000-00000000cd02", "status": "accepted", "version": 1}},
  {"op_id": "dev-000000000018", "op_type": "recommendation_status", "entity_id": "00000000-0000-4000-8000-00000000cd01", "base_version": 2,
   "payload": {"id": "00000000-0000-4000-8000-00000000cd01", "user_id": "00000000-0000-4000-8000-000000000c02", "status": "pinned", "version": 2}},
  {"op_id": "dev-000000000012", "op_type": "bogus", "entity_id": null, "base_version": null, "payload": {}},
  {"op_id": "dev-000000000013", "op_type": "task_upsert", "entity_id": null, "base_version": null}
]$$::jsonb) as r;
select is((select r->0->>'outcome' from res4), 'rejected', 'editing another user''s task is rejected');
select is((select title from public.tasks where id = '00000000-0000-4000-8000-00000000cb02'), 'b1', 'B''s task untouched');
select is((select r->1->>'outcome' from res4), 'rejected', 'an event referencing another user''s task is rejected (FK oracle closed)');
select is((select r->2->>'outcome' from res4), 'rejected', 'a payload with a foreign user_id is rejected');
select is((select count(*) from public.tasks where id = '00000000-0000-4000-8000-00000000ce02'), 0::bigint, 'forged-owner row not created');
select is((select r->3->>'outcome' from res4), 'rejected', 'completed is not a client-writable status (L11)');
select is((select r->4->>'outcome' from res4), 'superseded', 'a status op on a displaced_pending row is moot (server transition won)');
select is((select status from public.recommendations where id = '00000000-0000-4000-8000-00000000cd02'), 'displaced_pending', 'displaced_pending row untouched by the client op');
select is((select r->5->>'outcome' from res4), 'rejected', 'a status op with a foreign user_id is rejected (adversarial #9)');
select is((select r->6->>'outcome' from res4), 'rejected', 'unknown op_type is rejected');
select is((select r->7->>'outcome' from res4), 'rejected', 'malformed op (no payload) is rejected');
select is((select count(*) from public.sync_ops where op_id in ('dev-000000000007','dev-000000000008','dev-000000000009','dev-000000000010','dev-000000000012','dev-000000000013')), 0::bigint, 'rejected ops are not ledgered');
select is((select count(*) from public.sync_ops where op_id = 'dev-000000000011'), 1::bigint, 'superseded ops are ledgered (acked)');

-- ---------------------------------------------------------------------------
-- profile ops + an erroring op does not abort the batch
-- ---------------------------------------------------------------------------
create temp table res5 as select public.sync_replay('00000000-0000-4000-8000-000000000c02', $$[
  {"op_id": "dev-000000000014", "op_type": "profile_update", "entity_id": "00000000-0000-4000-8000-000000000c02", "base_version": null,
   "payload": {"user_id": "00000000-0000-4000-8000-000000000c02", "timezone": "Not/AZone", "locale": "en", "working_hours": {}, "sleep_window": [1380, 420],
               "rmeq_score": null, "chronotype_class": null, "survey_skipped": true, "top_categories": [], "onboarding_completed_at": null}},
  {"op_id": "dev-000000000015", "op_type": "profile_update", "entity_id": "00000000-0000-4000-8000-000000000c02", "base_version": null,
   "payload": {"user_id": "00000000-0000-4000-8000-000000000c02", "timezone": "Europe/Kyiv", "locale": "en", "working_hours": {"mon": [540, 1080]}, "sleep_window": [1380, 420],
               "rmeq_score": 15, "chronotype_class": "INT", "survey_skipped": false, "top_categories": ["deep"], "onboarding_completed_at": "2026-08-28T10:00:00Z"}},
  {"op_id": "dev-000000000016", "op_type": "profile_update", "entity_id": "00000000-0000-4000-8000-000000000c02", "base_version": null,
   "payload": {"user_id": "00000000-0000-4000-8000-000000000c02", "timezone": "Europe/Kyiv", "locale": "en", "working_hours": {}, "sleep_window": [1380, 420],
               "rmeq_score": 15, "chronotype_class": "INT", "survey_skipped": false, "top_categories": ["deep"], "onboarding_completed_at": "2026-08-28T10:00:00Z"}},
  {"op_id": "dev-000000000017", "op_type": "profile_update", "entity_id": "00000000-0000-4000-8000-000000000c02", "base_version": 1,
   "payload": {"user_id": "00000000-0000-4000-8000-000000000c02", "timezone": "Europe/Kyiv", "locale": "uk", "working_hours": {"mon": [540, 1080]}, "sleep_window": [1380, 420],
               "rmeq_score": 15, "chronotype_class": "INT", "survey_skipped": false, "top_categories": ["deep", "admin"], "onboarding_completed_at": "2026-08-28T10:00:00Z"}}
]$$::jsonb) as r;
select is((select r->0->>'outcome' from res5), 'error', 'an unknown timezone is an error outcome (22023), not a batch abort');
select is((select r->1->>'outcome' from res5), 'applied', 'the next op in the batch still applies (profile created)');
select is((select count(*) from public.beta_cells where user_id = '00000000-0000-4000-8000-000000000c02'), 48::bigint, 'profile insert through the RPC fires the P4 prior instantiation (48 cells)');
select is((select r->2->>'outcome' from res5), 'conflict', 'a second create for an existing profile is a conflict');
select is((select r->3->>'outcome' from res5), 'applied', 'profile edit with base_version 1 applies');
select is((select locale from public.profiles where user_id = '00000000-0000-4000-8000-000000000c02'), 'uk', 'profile edit landed');

-- ---------------------------------------------------------------------------
-- lease
-- ---------------------------------------------------------------------------
create temp table lease as select public.acquire_sync_lease('00000000-0000-4000-8000-000000000c01', 30) as token;
select isnt((select token from lease), null, 'lease acquired');
select is(public.acquire_sync_lease('00000000-0000-4000-8000-000000000c01', 30), null, 'a live lease cannot be acquired twice');
select is(public.release_sync_lease('00000000-0000-4000-8000-000000000c01', gen_random_uuid()), false, 'wrong token does not release');
select is(public.release_sync_lease('00000000-0000-4000-8000-000000000c01', (select token from lease)), true, 'right token releases');
update public.sync_leases set expires_at = now() - interval '1 second' where user_id = '00000000-0000-4000-8000-000000000c01';
insert into public.sync_leases (user_id, token, expires_at) values ('00000000-0000-4000-8000-000000000c01', gen_random_uuid(), now() - interval '1 second') on conflict (user_id) do update set expires_at = excluded.expires_at;
select isnt(public.acquire_sync_lease('00000000-0000-4000-8000-000000000c01', 30), null, 'an expired lease is re-acquirable (TTL bounds a crashed holder)');

-- ---------------------------------------------------------------------------
-- persist_plan: atomic
-- ---------------------------------------------------------------------------
create temp table persisted as select public.persist_plan('00000000-0000-4000-8000-000000000c01',
  '{"plan_date": "2026-08-28", "horizon": "day", "engine": "heuristic", "model_version": "heuristic-p6.0", "arm": "A", "solver_status": "HEURISTIC", "telemetry": {"ef": {"reason": "arm_a"}}, "generated_at": "2026-08-28T05:00:00Z"}'::jsonb,
  '[{"task_id": "00000000-0000-4000-8000-00000000cb01", "chunk_index": 1, "slot_start": "2026-08-28T07:00:00Z", "slot_end": "2026-08-28T07:30:00Z", "context_bucket": "MO.wd.fresh", "features": [1], "q_hat": null, "confidence": null, "rationale_key": "deadline", "rationale_params": {}, "is_experiment": false, "propensity": null},
    {"task_id": "00000000-0000-4000-8000-00000000cb01", "chunk_index": 0, "slot_start": "2026-08-28T06:00:00Z", "slot_end": "2026-08-28T06:30:00Z", "context_bucket": "MO.wd.fresh", "features": [1], "q_hat": null, "confidence": null, "rationale_key": "deadline", "rationale_params": {}, "is_experiment": true, "propensity": 0.5}]'::jsonb,
  array['00000000-0000-4000-8000-00000000cc01']::uuid[]) as r;
select is((select jsonb_array_length(r->'recommendations') from persisted), 2, 'persist_plan wrote both recommendations');
select is((select r->'recommendations'->0->>'chunk_index' from persisted), '0', 'recommendations come back in slot order');
select is((select (r->'recommendations'->0->>'propensity')::double precision from persisted), 0.5::double precision, 'propensity round-trips');
select is((select jsonb_array_length(r->'expired_recommendation_ids') from persisted), 0, 'no still-shown rows in the older plan (cd01 is accepted) → nothing expired');
select is((select count(*) from public.plans where user_id = '00000000-0000-4000-8000-000000000c01'), 2::bigint, 'plan row written');
select throws_ok($$select public.persist_plan('00000000-0000-4000-8000-000000000c01',
  '{"plan_date": "2026-08-29", "engine": "learned", "model_version": "x", "solver_status": "OPTIMAL"}'::jsonb,
  '[{"task_id": "00000000-0000-4000-8000-00000000cbff", "chunk_index": 0, "slot_start": "2026-08-29T06:00:00Z", "slot_end": "2026-08-29T06:30:00Z", "context_bucket": "MO.wd.fresh", "features": [1], "rationale_key": "x", "engine": "learned"}]'::jsonb,
  '{}'::uuid[])$$, '23503', null, 'a recommendation violating a FK fails the whole call');
select is((select count(*) from public.plans where user_id = '00000000-0000-4000-8000-000000000c01' and plan_date = '2026-08-29'), 0::bigint, 'the failed call left no plan row (atomic)');

-- ---------------------------------------------------------------------------
-- attribution_due: displaced_pending is finalised by the daily authority; displaced never
-- ---------------------------------------------------------------------------
select is((select count(*) from public.attribution_due('2026-08-28 20:56+00', 100) d where d.id = '00000000-0000-4000-8000-00000000cd02'), 1::bigint, 'displaced_pending is due at 23:56 Kyiv');
select is((select count(*) from public.attribution_due('2026-08-28 20:56+00', 100) d where d.id = '00000000-0000-4000-8000-00000000cd03'), 0::bigint, 'displaced is never due (no reward)');

-- ---------------------------------------------------------------------------
-- RLS + grants from the client role; sync_pull is invoker-filtered
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}', true);
select throws_ok($$select * from public.sync_ops$$, '42501', null, 'sync_ops is invisible to clients');
select throws_ok($$select * from public.sync_leases$$, '42501', null, 'sync_leases is invisible to clients');
select throws_ok($$select public.sync_replay('00000000-0000-4000-8000-000000000c01', '[]'::jsonb)$$, '42501', null, 'clients cannot call sync_replay');
select throws_ok($$select public.persist_plan('00000000-0000-4000-8000-000000000c01', '{}'::jsonb, '[]'::jsonb, '{}'::uuid[])$$, '42501', null, 'clients cannot call persist_plan');
select is((select count(*) from public.sync_pull(0, 500) where tbl = 'tasks'), 2::bigint, 'pull as A: A''s two tasks (a1 + the synced one), never B''s');
select is((select count(*) from public.sync_pull(0, 500) where tbl = 'recommendations'), 5::bigint, 'pull as A: five recommendations (3 fixtures + 2 persisted)');
select is((select count(*) from public.sync_pull(0, 500) where tbl = 'plans'), 2::bigint, 'pull as A: both plans');
select is((select count(*) from public.sync_pull(0, 500) where tbl = 'profiles'), 1::bigint, 'pull as A: own profile only');
select is((select count(*) from public.sync_pull((select max(server_seq) from public.sync_pull(0, 500)), 500)), 0::bigint, 'pull from the max cursor returns nothing');
select ok((select bool_and(server_seq > 0) from public.sync_pull(0, 500)), 'every pulled row carries a server_seq');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}', true);
select is((select count(*) from public.sync_pull(0, 500) where tbl in ('recommendations', 'plans')), 0::bigint, 'pull as B: none of A''s plan rows');

select * from finish();
rollback;
