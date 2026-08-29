-- P9 — trust surfaces server contract (ADR-0013): belief_labels exists with RLS, a
-- `belief_label` event materialises one label row keyed by the op_id (replay = no-op), the
-- closed state_ref/label vocabularies are enforced at the event (the op is rejected, nothing
-- half-applied), clients read their own rows only and cannot write them.
begin;
select plan(23);

select has_table('public', 'belief_labels', 'belief_labels exists');
select has_index('public', 'belief_labels', 'belief_labels_undelivered_idx', 'undelivered labels index exists');
select has_function('public', 'tg_materialise_belief_label', 'tg_materialise_belief_label() exists');
select has_trigger('public', 'events', 'events_belief_label', 'events → belief_labels trigger exists');
select col_is_pk('public', 'belief_labels', 'id', 'id (= event op_id) is the primary key');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p9a@example.com', '', now(), now()),
       ('00000000-0000-4000-8000-000000000d02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p9b@example.com', '', now(), now());
insert into public.profiles (user_id, timezone) values
  ('00000000-0000-4000-8000-000000000d01', 'Europe/Kyiv'),
  ('00000000-0000-4000-8000-000000000d02', 'Europe/Kyiv');

-- ---------------------------------------------------------------------------
-- the replay RPC path: a belief_label op → events row → belief_labels row
-- ---------------------------------------------------------------------------
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-1","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-1","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:deep.MO.weekday","label":"correct"},"context":{"tz":"Europe/Kyiv"},"client_ts":"2026-08-28T09:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'applied', 'a belief_label op is applied');
select is((select count(*) from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000d01'), 1::bigint, 'one label row materialised');
select results_eq(
  $$select id, category, daypart, day_type, state_ref, label, labeled_at, source, delivered_at from public.belief_labels where id = 'dev-1'$$,
  $$values ('dev-1', 'deep', 'MO', 'weekday', 'beta:deep.MO.weekday', 'correct', '2026-08-28T09:00:00Z'::timestamptz, 'client', null::timestamptz)$$,
  'the row carries the parsed cell, the label, the client timestamp, undelivered');

-- replay of the same op: duplicate, still one row
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-1","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-1","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:deep.MO.weekday","label":"correct"},"context":{},"client_ts":"2026-08-28T09:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'duplicate', 'replaying the op is a duplicate');
select is((select count(*) from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000d01'), 1::bigint, 'still one label row after replay');

-- a second label on the same cell is a second row (history); "none" is a valid label
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-2","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-2","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:deep.MO.weekday","label":"none"},"context":{},"client_ts":"2026-08-28T10:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'applied', 'a clearing label (none) is applied');
select is((select count(*) from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000d01'), 2::bigint, 'two rows: the history is kept');

-- vocabulary: a bad state_ref or label rejects the op and leaves no event and no label
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-3","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-3","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:deep.XX.weekday","label":"correct"},"context":{},"client_ts":"2026-08-28T11:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'error', 'an unknown daypart in state_ref fails the op');
select is((select count(*) from public.events where op_id = 'dev-3'), 0::bigint, 'the malformed event was not appended (subtransaction rolled back)');
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-4","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-4","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:deep.MO.weekday","label":"maybe"},"context":{},"client_ts":"2026-08-28T11:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'error', 'an unknown label fails the op');
select is((select count(*) from public.belief_labels where user_id = '00000000-0000-4000-8000-000000000d01'), 2::bigint, 'no label row from the rejected ops');

-- a device clock ahead of real time: labeled_at is clamped to now()
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-6","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-6","user_id":"00000000-0000-4000-8000-000000000d01","type":"belief_label","task_id":null,"recommendation_id":null,"payload":{"state_ref":"beta:admin.AF.weekend","label":"correct"},"context":{},"client_ts":"2036-01-01T00:00:00Z","local_day":"2036-01-01"}}]'::jsonb)) r),
  'applied', 'a future-dated label is applied');
select ok((select labeled_at <= now() from public.belief_labels where id = 'dev-6'), 'labeled_at is clamped to now() for a clock ahead of real time');

-- other event types never touch the table
select is(
  (select r->>'outcome' from jsonb_array_elements(public.sync_replay('00000000-0000-4000-8000-000000000d01', '[{"op_id":"dev-5","op_type":"event_append","entity_id":null,"base_version":null,"payload":{"op_id":"dev-5","user_id":"00000000-0000-4000-8000-000000000d01","type":"weekly_review_completed","task_id":null,"recommendation_id":null,"payload":{"week":"2026-W35"},"context":{},"client_ts":"2026-08-28T11:00:00Z","local_day":"2026-08-28"}}]'::jsonb)) r),
  'applied', 'a weekly_review_completed event is a plain fact');
select is((select count(*) from public.belief_labels), 3::bigint, 'plain facts never materialise labels');

-- ---------------------------------------------------------------------------
-- RLS + grants from the client role
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}', true);
select is((select count(*) from public.belief_labels), 3::bigint, 'A reads own labels (toggle state across devices)');
select throws_ok($$insert into public.belief_labels (id, user_id, category, daypart, day_type, state_ref, label, labeled_at) values ('x', '00000000-0000-4000-8000-000000000d01', 'deep', 'MO', 'weekday', 'beta:deep.MO.weekday', 'correct', now())$$, '42501', null, 'clients cannot insert labels directly (the event is the only path)');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
select is((select count(*) from public.belief_labels), 0::bigint, 'B sees none of A''s labels');

select * from finish();
rollback;
