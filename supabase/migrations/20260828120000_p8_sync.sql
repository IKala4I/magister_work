-- P8 — sync server side (File 05 §2; specs/07 §4 conventions; ADR-0012).
--
-- (1) sync_ops: the replay ledger — PK (user_id, op_id) makes "duplicate op replay is a no-op"
--     a constraint, not a convention (NFR-R1). Service-only.
-- (2) sync_leases: per-user lease serialising op replay + reward mapping between sync-resolve and
--     the daily attribution sweep (ADR-0012 §7). TTL-bounded so a crashed holder cannot wedge a
--     user. Service-only.
-- (3) sync_replay(): one transaction per batch, one subtransaction per op; the three conflict
--     classes of File 05 §2 (append-only events; base_version checks with conflict + server row;
--     state-checked recommendation statuses). Security definer, filtered by p_user_id everywhere.
-- (4) sync_pull(): the pull half — every mirrored table with server_seq > cursor as one ordered
--     stream, security INVOKER so RLS is the filter (the pull cannot leak another user's row).
-- (5) persist_plan(): plan + recommendations + supersede in one transaction (ADR-0008 §4 revisit).
-- (6) calendar_events.deleted_at (cancelled meetings converge like deleted tasks),
--     gcal_sync_state columns for the server-held OAuth state (never on the device),
--     profiles.eu_eea_resident (ADR-0011; asked by P11's enrollment).
-- (7) attribution_due() includes displaced_pending: the daily authority finalises a pending
--     displacement (completed + conflict_flag with an excluded tuple, or displaced with no tuple).
-- (8) gcal_sweep_tick(): every 5 min → gcal-webhook {mode: sweep} (UC-09 ≤ 5 min bound without
--     relying on Google push); no-op without connected calendars or Vault secrets.

-- ---------------------------------------------------------------------------
-- (1) sync_ops ledger
-- ---------------------------------------------------------------------------
create table public.sync_ops (
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null check (char_length(op_id) <= 128),
  op_type text not null,
  entity_id text,
  outcome text not null check (outcome in ('applied', 'duplicate', 'superseded')),
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
comment on table public.sync_ops is
  'P8 replay ledger (File 05 §2, NFR-R1): an op id seen once is never applied twice. Written only by sync_replay(); no client access.';
alter table public.sync_ops enable row level security;
revoke all on public.sync_ops from anon, authenticated;

-- ---------------------------------------------------------------------------
-- (2) per-user lease
-- ---------------------------------------------------------------------------
create table public.sync_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);
alter table public.sync_leases enable row level security;
revoke all on public.sync_leases from anon, authenticated;

create or replace function public.acquire_sync_lease(p_user_id uuid, p_ttl_seconds int default 30)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_got uuid;
begin
  insert into public.sync_leases (user_id, token, expires_at)
  values (p_user_id, v_token, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (user_id) do update
    set token = excluded.token, expires_at = excluded.expires_at
    where public.sync_leases.expires_at < now()
  returning token into v_got;
  return v_got; -- null when another holder's lease is still live
end $$;

create or replace function public.release_sync_lease(p_user_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.sync_leases where user_id = p_user_id and token = p_token;
  return found;
end $$;

revoke all on function public.acquire_sync_lease(uuid, int) from public, anon, authenticated;
revoke all on function public.release_sync_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_sync_lease(uuid, int) to service_role;
grant execute on function public.release_sync_lease(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (6) schema additions
-- ---------------------------------------------------------------------------
alter table public.calendar_events add column deleted_at timestamptz;
comment on column public.calendar_events.deleted_at is
  'P8: a cancelled/removed external event is tombstoned so offline mirrors converge (same reasoning as tasks.deleted_at). Busy reads filter deleted_at is null.';
create index calendar_events_user_seq_idx on public.calendar_events (user_id, server_seq);
create index plans_user_seq_idx on public.plans (user_id, server_seq);
create index recommendations_user_seq_idx on public.recommendations (user_id, server_seq);

alter table public.gcal_sync_state
  add column refresh_token text,
  add column access_token text,
  add column access_token_expires_at timestamptz,
  add column calendar_id text not null default 'primary',
  add column channel_token text,
  add column oauth_state text,
  add column oauth_state_expires_at timestamptz,
  add column scope text not null default 'read' check (scope in ('read', 'write')),
  add column write_back boolean not null default false,
  add column write_back_calendar_id text,
  add column last_synced_at timestamptz,
  add column last_error text,
  add column connected_at timestamptz;
comment on table public.gcal_sync_state is
  'P8 (FR-03/UC-09): server-held Google Calendar OAuth state — refresh token, push channel, sync token, write-back flag. Server-only (no grants, no policies): the refresh token never reaches the device (ADR-0012 §10).';

-- FR-03 write-back mirror: the Google event id created for an open block and the slot start it
-- was last written with (patch only when the placement moved; delete when the block closed).
-- Server-only columns (the client's UPDATE grant is status+version; SELECT is fine).
alter table public.recommendations
  add column gcal_event_id text,
  add column gcal_synced_slot_start timestamptz;

alter table public.profiles add column eu_eea_resident boolean;
comment on column public.profiles.eu_eea_resident is
  'ADR-0011 decision 1: Art. 27 trigger. NULL = not asked; P11 study-mode enrollment asks yes/no. Never inferred from IP or locale.';

-- The touch trigger overwrote updated_at on every update. For the File 05 §2 field-level merge
-- ("user-owned fields LWW") both sides must carry the EDIT time, not the apply time — otherwise a
-- device's second offline edit always loses to its own first edit's server apply time. Touch only
-- when the writer did not set updated_at itself (PostgREST/bridge writers keep the old behaviour).
create or replace function public.tg_touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (3) sync_replay and its per-op helpers
-- ---------------------------------------------------------------------------

-- epoch-ms number or ISO string → timestamptz (client payloads use epoch ms; profile payloads ISO)
create or replace function public.sync_ts(p jsonb)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p)
    when 'number' then to_timestamp((p::text)::double precision / 1000.0)
    when 'string' then (p #>> '{}')::timestamptz
    else null
  end
$$;

create or replace function public.sync_is_uuid(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- class 1: append-only facts
create or replace function public.sync_apply_event(p_user_id uuid, p_op_id text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task uuid;
  v_rec uuid;
  v_type text := p->>'type';
  v_client_ts timestamptz := public.sync_ts(p->'client_ts');
  v_local_day text := p->>'local_day';
begin
  if p->>'user_id' is not null and (not public.sync_is_uuid(p->>'user_id') or (p->>'user_id')::uuid <> p_user_id) then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'foreign user_id');
  end if;
  if v_type is null or char_length(v_type) > 64 or v_client_ts is null
     or v_local_day is null or v_local_day !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'malformed event');
  end if;
  if nullif(p->>'task_id', '') is not null then
    if not public.sync_is_uuid(p->>'task_id') then
      return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'bad task_id');
    end if;
    v_task := (p->>'task_id')::uuid;
    if not exists (select 1 from public.tasks t where t.id = v_task and t.user_id = p_user_id) then
      return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'task not owned or unknown');
    end if;
  end if;
  if nullif(p->>'recommendation_id', '') is not null then
    if not public.sync_is_uuid(p->>'recommendation_id') then
      return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'bad recommendation_id');
    end if;
    v_rec := (p->>'recommendation_id')::uuid;
    if not exists (select 1 from public.recommendations r where r.id = v_rec and r.user_id = p_user_id) then
      return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'recommendation not owned or unknown');
    end if;
  end if;
  insert into public.events (user_id, op_id, type, task_id, recommendation_id, payload, context, client_ts, local_day)
  values (p_user_id, p_op_id, v_type, v_task, v_rec,
          coalesce(p->'payload', '{}'::jsonb), coalesce(p->'context', '{}'::jsonb),
          v_client_ts, v_local_day::date)
  on conflict (user_id, op_id) do nothing;
  if found then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied');
  end if;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'duplicate');
end $$;

-- class 2: tasks (full-row upsert or tombstone) with the base_version check
create or replace function public.sync_apply_task(p_user_id uuid, p_op_id text, p_base int, p jsonb, p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  cur public.tasks%rowtype;
  nxt public.tasks%rowtype;
begin
  if not public.sync_is_uuid(p->>'id') then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'bad id');
  end if;
  v_id := (p->>'id')::uuid;
  if p->>'user_id' is not null and (not public.sync_is_uuid(p->>'user_id') or (p->>'user_id')::uuid <> p_user_id) then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'foreign user_id');
  end if;
  select * into cur from public.tasks t where t.id = v_id;
  if found and cur.user_id <> p_user_id then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'not owned');
  end if;

  if not found then
    if p_delete then
      -- nothing to delete on the server: the row never synced (its create op failed or is pending)
      return jsonb_build_object('op_id', p_op_id, 'outcome', 'superseded', 'detail', 'unknown row');
    end if;
    -- create (base_version null) — or an update whose create never landed: the payload is the
    -- full row, so inserting it is the self-healing choice (ADR-0012 §3)
    insert into public.tasks (id, user_id, title, category, est_minutes, deadline, value, splittable,
                              earliest_start, recurrence, status, done_at, postpone_count, deleted_at,
                              version, created_at, updated_at)
    values (v_id, p_user_id, p->>'title', p->>'category', (p->>'est_minutes')::int,
            public.sync_ts(p->'deadline'), (p->>'value')::smallint,
            coalesce((p->>'splittable')::boolean, false), public.sync_ts(p->'earliest_start'),
            case when jsonb_typeof(p->'recurrence') = 'null' then null else p->'recurrence' end,
            coalesce(p->>'status', 'inbox'), public.sync_ts(p->'done_at'),
            coalesce((p->>'postpone_count')::int, 0), public.sync_ts(p->'deleted_at'),
            coalesce((p->>'version')::int, 1),
            coalesce(public.sync_ts(p->'created_at'), now()),
            coalesce(public.sync_ts(p->'updated_at'), now()))
    returning * into nxt;
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                              'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
  end if;

  if p_base is null or cur.version <> p_base then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'conflict', 'row', to_jsonb(cur));
  end if;

  if p_delete then
    update public.tasks set deleted_at = coalesce(public.sync_ts(p->'deleted_at'), now()),
                            updated_at = coalesce(public.sync_ts(p->'updated_at'), public.sync_ts(p->'deleted_at'), now())
    where id = v_id returning * into nxt;
  else
    update public.tasks set
      title = p->>'title',
      category = p->>'category',
      est_minutes = (p->>'est_minutes')::int,
      deadline = public.sync_ts(p->'deadline'),
      value = (p->>'value')::smallint,
      splittable = coalesce((p->>'splittable')::boolean, false),
      earliest_start = public.sync_ts(p->'earliest_start'),
      recurrence = case when jsonb_typeof(p->'recurrence') = 'null' then null else p->'recurrence' end,
      status = coalesce(p->>'status', status),
      done_at = public.sync_ts(p->'done_at'),
      postpone_count = coalesce((p->>'postpone_count')::int, postpone_count),
      deleted_at = public.sync_ts(p->'deleted_at'),
      updated_at = coalesce(public.sync_ts(p->'updated_at'), now())
    where id = v_id returning * into nxt;
  end if;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                            'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
end $$;

-- class 2: the profile row (user-owned settings)
create or replace function public.sync_apply_profile(p_user_id uuid, p_op_id text, p_base int, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur public.profiles%rowtype;
  nxt public.profiles%rowtype;
  v_top text[];
begin
  if p->>'user_id' is not null and (not public.sync_is_uuid(p->>'user_id') or (p->>'user_id')::uuid <> p_user_id) then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'foreign user_id');
  end if;
  if jsonb_typeof(p->'top_categories') = 'array' then
    select coalesce(array_agg(x), '{}') into v_top from jsonb_array_elements_text(p->'top_categories') x;
  else
    v_top := '{}';
  end if;
  select * into cur from public.profiles pr where pr.user_id = p_user_id;
  if not found then
    insert into public.profiles (user_id, timezone, locale, working_hours, sleep_window, rmeq_score,
                                 chronotype_class, survey_skipped, top_categories, onboarding_completed_at,
                                 updated_at)
    values (p_user_id, coalesce(p->>'timezone', 'UTC'), coalesce(p->>'locale', 'en'),
            coalesce(p->'working_hours', '{}'::jsonb), coalesce(p->'sleep_window', '{}'::jsonb),
            (p->>'rmeq_score')::smallint, p->>'chronotype_class',
            coalesce((p->>'survey_skipped')::boolean, false), v_top,
            public.sync_ts(p->'onboarding_completed_at'),
            coalesce(public.sync_ts(p->'updated_at'), now()))
    returning * into nxt;
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                              'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
  end if;
  if p_base is null or cur.version <> p_base then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'conflict', 'row', to_jsonb(cur));
  end if;
  update public.profiles set
    timezone = coalesce(p->>'timezone', timezone),
    locale = coalesce(p->>'locale', locale),
    working_hours = coalesce(p->'working_hours', working_hours),
    sleep_window = coalesce(p->'sleep_window', sleep_window),
    rmeq_score = (p->>'rmeq_score')::smallint,
    chronotype_class = p->>'chronotype_class',
    survey_skipped = coalesce((p->>'survey_skipped')::boolean, survey_skipped),
    top_categories = v_top,
    onboarding_completed_at = coalesce(public.sync_ts(p->'onboarding_completed_at'), onboarding_completed_at),
    updated_at = coalesce(public.sync_ts(p->'updated_at'), now())
  where user_id = p_user_id returning * into nxt;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                            'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
end $$;

-- class 3: plan-review statuses are state-checked (L11), never version-checked
create or replace function public.sync_apply_rec_status(p_user_id uuid, p_op_id text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text := p->>'status';
  cur public.recommendations%rowtype;
  nxt public.recommendations%rowtype;
begin
  if not public.sync_is_uuid(p->>'id') then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'bad id');
  end if;
  if v_status is null or v_status not in ('accepted', 'pinned', 'moved', 'rejected') then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'status not client-writable');
  end if;
  v_id := (p->>'id')::uuid;
  select * into cur from public.recommendations r where r.id = v_id and r.user_id = p_user_id;
  if not found then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'recommendation not owned or unknown');
  end if;
  if cur.status not in ('shown', 'accepted', 'pinned', 'moved', 'rejected') or cur.attributed_at is not null then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'superseded', 'detail', 'server status ' || cur.status);
  end if;
  if cur.status = v_status then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', cur.version,
                              'server_seq', cur.server_seq, 'updated_at', cur.updated_at);
  end if;
  update public.recommendations set status = v_status where id = v_id returning * into nxt;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                            'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
end $$;

create or replace function public.sync_replay(p_user_id uuid, p_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  op jsonb;
  results jsonb := '[]'::jsonb;
  r jsonb;
  v_op_id text;
  v_type text;
  v_entity text;
  v_base int;
  v_payload jsonb;
begin
  if p_user_id is null then
    raise exception 'sync_replay: user required' using errcode = '22023';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'sync_replay: ops must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ops) > 500 then
    raise exception 'sync_replay: at most 500 ops per batch' using errcode = '22023';
  end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    v_op_id := op->>'op_id';
    v_type := op->>'op_type';
    v_entity := op->>'entity_id';
    v_payload := op->'payload';
    begin
      v_base := (op->>'base_version')::int;
      if v_op_id is null or char_length(v_op_id) > 128 or v_type is null
         or v_payload is null or jsonb_typeof(v_payload) <> 'object' then
        r := jsonb_build_object('op_id', coalesce(v_op_id, ''), 'outcome', 'rejected', 'detail', 'malformed op');
      elsif exists (select 1 from public.sync_ops s where s.user_id = p_user_id and s.op_id = v_op_id) then
        r := jsonb_build_object('op_id', v_op_id, 'outcome', 'duplicate');
      else
        r := case v_type
          when 'event_append' then public.sync_apply_event(p_user_id, v_op_id, v_payload)
          when 'task_upsert' then public.sync_apply_task(p_user_id, v_op_id, v_base, v_payload, false)
          when 'task_delete' then public.sync_apply_task(p_user_id, v_op_id, v_base, v_payload, true)
          when 'profile_update' then public.sync_apply_profile(p_user_id, v_op_id, v_base, v_payload)
          when 'recommendation_status' then public.sync_apply_rec_status(p_user_id, v_op_id, v_payload)
          else jsonb_build_object('op_id', v_op_id, 'outcome', 'rejected', 'detail', 'unknown op_type ' || v_type)
        end;
        if r->>'outcome' in ('applied', 'duplicate', 'superseded') then
          insert into public.sync_ops (user_id, op_id, op_type, entity_id, outcome)
          values (p_user_id, v_op_id, v_type, v_entity, r->>'outcome')
          on conflict do nothing;
        end if;
      end if;
    exception when others then
      -- the subtransaction rolled this op back; the batch continues (ADR-0012 §2)
      r := jsonb_build_object('op_id', coalesce(v_op_id, ''), 'outcome', 'error',
                              'detail', left(sqlerrm, 200), 'code', sqlstate);
    end;
    results := results || jsonb_build_array(r);
  end loop;
  return results;
end $$;
comment on function public.sync_replay(uuid, jsonb) is
  'P8 push half (File 05 §2): replays a client op batch in order — events append-only (class 1), tasks/profile with base_version checks returning conflict + server row (class 2), plan-review statuses state-checked (class 3). Duplicate op_ids are no-ops via sync_ops. Service-only; the user id comes from the verified JWT.';

revoke all on function public.sync_ts(jsonb) from public, anon, authenticated;
revoke all on function public.sync_is_uuid(text) from public, anon, authenticated;
revoke all on function public.sync_apply_event(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_apply_task(uuid, text, int, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.sync_apply_profile(uuid, text, int, jsonb) from public, anon, authenticated;
revoke all on function public.sync_apply_rec_status(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_replay(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_replay(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- (4) sync_pull — security INVOKER: RLS is the filter
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull(p_cursor bigint default 0, p_limit int default 500)
returns table (server_seq bigint, tbl text, payload jsonb)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from (
    select p.server_seq, 'profiles'::text as tbl, to_jsonb(p) as payload
      from public.profiles p where p.server_seq > p_cursor
    union all
    select t.server_seq, 'tasks', to_jsonb(t)
      from public.tasks t where t.server_seq > p_cursor
    union all
    select pl.server_seq, 'plans', to_jsonb(pl)
      from public.plans pl where pl.server_seq > p_cursor
    union all
    select r.server_seq, 'recommendations', to_jsonb(r)
      from public.recommendations r where r.server_seq > p_cursor
    union all
    select c.server_seq, 'calendar_events', to_jsonb(c)
      from public.calendar_events c where c.server_seq > p_cursor
  ) s
  order by s.server_seq
  limit least(greatest(p_limit, 1), 1000)
$$;
comment on function public.sync_pull(bigint, int) is
  'P8 pull half (File 05 §2 "changes since cursor"): one server_seq-ordered stream over the mirrored tables under the caller''s RLS. Cursor = max server_seq seen.';
revoke all on function public.sync_pull(bigint, int) from public, anon;
grant execute on function public.sync_pull(bigint, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (5) persist_plan — one transaction for plan + recommendations + supersede
-- ---------------------------------------------------------------------------
create or replace function public.persist_plan(p_user_id uuid, p_plan jsonb, p_recs jsonb, p_supersede uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.plans%rowtype;
  v_recs jsonb;
  v_expired jsonb;
begin
  insert into public.plans (user_id, plan_date, horizon, engine, model_version, arm, solver_status, telemetry, generated_at)
  values (p_user_id, (p_plan->>'plan_date')::date, coalesce(p_plan->>'horizon', 'day'), p_plan->>'engine',
          p_plan->>'model_version', p_plan->>'arm', p_plan->>'solver_status',
          coalesce(p_plan->'telemetry', '{}'::jsonb),
          coalesce(public.sync_ts(p_plan->'generated_at'), now()))
  returning * into v_plan;

  with ins as (
    insert into public.recommendations (user_id, plan_id, task_id, chunk_index, slot_start, slot_end,
      context_bucket, features, q_hat, confidence, rationale_key, rationale_params, is_experiment,
      engine, model_version, propensity)
    select p_user_id, v_plan.id, (a->>'task_id')::uuid, coalesce((a->>'chunk_index')::smallint, 0),
           (a->>'slot_start')::timestamptz, (a->>'slot_end')::timestamptz, a->>'context_bucket',
           coalesce(a->'features', '[]'::jsonb), (a->>'q_hat')::real, (a->>'confidence')::real,
           a->>'rationale_key', coalesce(a->'rationale_params', '{}'::jsonb),
           coalesce((a->>'is_experiment')::boolean, false), v_plan.engine, v_plan.model_version,
           (a->>'propensity')::double precision
    from jsonb_array_elements(coalesce(p_recs, '[]'::jsonb)) a
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins) order by ins.slot_start, ins.chunk_index), '[]'::jsonb)
    into v_recs from ins;

  with exp as (
    update public.recommendations r set status = 'expired'
    where r.user_id = p_user_id
      and r.plan_id = any(coalesce(p_supersede, '{}'::uuid[]))
      and r.plan_id <> v_plan.id
      and r.status = 'shown'
    returning r.id
  )
  select coalesce(jsonb_agg(exp.id), '[]'::jsonb) into v_expired from exp;

  return jsonb_build_object('plan', to_jsonb(v_plan), 'recommendations', v_recs,
                            'expired_recommendation_ids', v_expired);
end $$;
comment on function public.persist_plan(uuid, jsonb, jsonb, uuid[]) is
  'P8 (ADR-0008 §4 revisit): plan row + recommendation rows + supersede of still-shown rows of earlier plans, atomically. Service-only (plan-request).';
revoke all on function public.persist_plan(uuid, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.persist_plan(uuid, jsonb, jsonb, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- (7) attribution_due: pending displacements are finalised by the daily authority
-- ---------------------------------------------------------------------------
create or replace function public.attribution_due(p_now timestamptz default now(), p_limit int default 500)
returns table (
  id uuid,
  user_id uuid,
  task_id uuid,
  category text,
  slot_start timestamptz,
  slot_end timestamptz,
  context_bucket text,
  features jsonb,
  status text,
  conflict_flag boolean,
  timezone text,
  local_day date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.user_id, r.task_id, t.category, r.slot_start, r.slot_end, r.context_bucket,
         r.features, r.status, r.conflict_flag, p.timezone,
         (timezone(p.timezone, r.slot_end))::date as local_day
  from public.recommendations r
  join public.profiles p on p.user_id = r.user_id
  join public.tasks t on t.id = r.task_id
  join pg_catalog.pg_timezone_names z on z.name = p.timezone
  where r.attributed_at is null
    and r.status in ('shown', 'accepted', 'pinned', 'moved', 'displaced_pending')
    and r.slot_end + interval '15 minutes' <= p_now
    and timezone(p.timezone, p_now)
        >= date_trunc('day', timezone(p.timezone, r.slot_end)) + interval '23 hours 55 minutes'
  order by r.user_id, r.slot_end
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- (8) the calendar sweep tick — every 5 min, no-op without connections or secrets
-- ---------------------------------------------------------------------------
create or replace function public.gcal_sweep_tick()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_key text;
  v_anon text;
begin
  if not exists (select 1 from public.gcal_sync_state g where g.refresh_token is not null) then
    return 'skipped: no connected calendars';
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'hourwell_functions_url' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'hourwell_service_key' limit 1;
    select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'hourwell_anon_key' limit 1;
  exception when undefined_table or insufficient_privilege then
    return 'skipped: vault unavailable';
  end;
  if v_url is null or v_key is null or v_anon is null then
    return 'skipped: vault secrets hourwell_functions_url / hourwell_service_key / hourwell_anon_key not all set';
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/gcal-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-service-key', v_key
    ),
    body := jsonb_build_object('mode', 'sweep'),
    timeout_milliseconds := 60000
  );
  return 'posted';
end $$;
comment on function public.gcal_sweep_tick() is
  'UC-09 ≤ 5 min: every 5 min POST {"mode":"sweep"} to gcal-webhook (channel renewal + fallback poll + write-back). Same Vault secrets as the attribution tick; no-op without connected calendars.';
revoke all on function public.gcal_sweep_tick() from public, anon, authenticated;

select cron.schedule('gcal-sweep', '*/5 * * * *', $$select public.gcal_sweep_tick()$$);
