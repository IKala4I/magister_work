-- 0001_base — full base schema per specs/07 §4.1 (M-01 and M-02 are applied by later
-- migrations, NOT here). RLS on every table (NFR-S1); erasure by cascade (FR-42);
-- statuses are text + named CHECK so M-02 can extend them.

-- pg_cron scaffolding (jobs are scheduled in P6/P7)
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- helpers: global sync sequence + shared triggers
-- ---------------------------------------------------------------------------
create sequence public.sync_seq;

create function public.tg_set_server_seq() returns trigger
language plpgsql as $$
begin
  new.server_seq := nextval('public.sync_seq');
  return new;
end $$;

create function public.tg_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.tg_bump_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  working_hours jsonb not null default '{}'::jsonb,
  sleep_window jsonb not null default '{}'::jsonb,
  rmeq_score smallint check (rmeq_score between 4 and 25),
  chronotype_class text check (chronotype_class in ('DM','MM','INT','ME','DE')),
  survey_skipped boolean not null default false,
  top_categories text[] not null default '{}',
  onboarding_completed_at timestamptz,
  research_cohort boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  server_seq bigint
);

-- ---------------------------------------------------------------------------
-- tasks (FR-10; recurrence schema-ready for FR-12; soft delete for offline sync)
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null check (category in ('deep','admin','physical','learning')),
  est_minutes int not null check (est_minutes > 0),
  deadline timestamptz,
  value smallint not null check (value between 1 and 3),
  splittable boolean not null default false,
  earliest_start timestamptz,
  recurrence jsonb,
  status text not null default 'inbox'
    constraint tasks_status_check check (status in ('inbox','scheduled','done','archived')),
  done_at timestamptz,
  postpone_count int not null default 0,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_seq bigint
);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_deadline_idx on public.tasks (user_id, deadline);
create index tasks_user_seq_idx on public.tasks (user_id, server_seq);

-- ---------------------------------------------------------------------------
-- calendar_events (FR-03/UC-09; title is display-only and never exported — specs/07 §7)
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'google',
  external_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  title text,
  busy boolean not null default true,
  updated_at timestamptz not null default now(),
  server_seq bigint,
  unique (user_id, source, external_id)
);
create index calendar_events_user_start_idx on public.calendar_events (user_id, start_at);

-- ---------------------------------------------------------------------------
-- plans (one row per generation run; NFR-O1 + File 04 §1.5 telemetry home)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  horizon text not null default 'day' check (horizon in ('day','week')),
  engine text not null check (engine in ('learned','heuristic')),
  model_version text,
  arm text check (arm in ('A','B')),
  solver_status text,
  telemetry jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  server_seq bigint
);
create index plans_user_date_idx on public.plans (user_id, plan_date);

-- ---------------------------------------------------------------------------
-- recommendations (core row — BASE shape: no propensity (M-01), no displaced
-- statuses / conflict_flag (M-02))
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  chunk_index smallint not null default 0,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  context_bucket text not null,
  features jsonb not null,
  q_hat real,
  confidence real,
  rationale_key text not null,
  rationale_params jsonb not null default '{}'::jsonb,
  is_experiment boolean not null default false,
  engine text not null check (engine in ('learned','heuristic')),
  model_version text,
  status text not null default 'shown'
    constraint recommendations_status_check check (status in
      ('shown','accepted','pinned','moved','rejected','completed','lapsed','expired')),
  attributed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_seq bigint
);
create index recommendations_user_slot_idx on public.recommendations (user_id, slot_start);
create index recommendations_user_status_idx on public.recommendations (user_id, status);
create index recommendations_unattributed_idx on public.recommendations (user_id, slot_end)
  where attributed_at is null;

-- clients may only move a recommendation through user-side statuses; the guard
-- complements column-level grants (specs/07 §4.4)
create function public.tg_guard_recommendation_status() returns trigger
language plpgsql security invoker as $$
begin
  if current_user = 'authenticated'
     and new.status not in ('accepted','pinned','moved','rejected','completed','lapsed') then
    raise exception 'status % may not be set by clients', new.status;
  end if;
  return new;
end $$;
create trigger recommendations_status_guard
  before update of status on public.recommendations
  for each row when (new.status is distinct from old.status)
  execute function public.tg_guard_recommendation_status();

-- ---------------------------------------------------------------------------
-- events — append-only behavioral log (File 05; NFR-O1); duplicate op replay is a no-op
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null,
  type text not null,
  task_id uuid references public.tasks(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  local_day date not null,
  unique (user_id, op_id)
);
create index events_user_day_idx on public.events (user_id, local_day);

-- ---------------------------------------------------------------------------
-- feedback_rewards — stored reward tuples (specs/07 §3.4; the rebuild substrate)
-- ---------------------------------------------------------------------------
create table public.feedback_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  kind text not null check (kind in ('outcome','override_out','override_in')),
  reward real not null check (reward >= 0 and reward <= 1),
  reason text not null,
  category text not null check (category in ('deep','admin','physical','learning')),
  features jsonb not null,
  excluded boolean not null default false,
  excluded_reason text,
  attributed_at timestamptz not null default now(),
  corrected_at timestamptz,
  unique (recommendation_id, kind)
);
create index feedback_rewards_user_idx on public.feedback_rewards (user_id, attributed_at);

-- ---------------------------------------------------------------------------
-- per-user model state, normalized (specs/07 §4.1: bandit_state + beta_cells + blend_state)
-- ---------------------------------------------------------------------------
create table public.bandit_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('deep','admin','physical','learning')),
  d smallint not null,
  a_matrix double precision[] not null,
  b_vector double precision[] not null,
  state_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table public.beta_cells (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('deep','admin','physical','learning')),
  daypart text not null check (daypart in ('EM','MO','MD','AF','EV','NT')),
  day_type text not null check (day_type in ('weekday','weekend')),
  succ real not null default 0,
  fail real not null default 0,
  last_event_at timestamptz,
  alpha0 real not null,
  beta0 real not null,
  prior_version int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, daypart, day_type)
);

create table public.blend_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  w_energy real not null default 0.7,
  w_bandit real not null default 0.3,
  state_version int not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- global reference tables
-- ---------------------------------------------------------------------------
create table public.prior_cells (
  version int not null,
  chronotype_class text not null check (chronotype_class in ('DM','MM','INT','ME','DE')),
  category text not null check (category in ('deep','admin','physical','learning')),
  daypart text not null check (daypart in ('EM','MO','MD','AF','EV','NT')),
  day_type text not null check (day_type in ('weekday','weekend')),
  mu0 real not null check (mu0 > 0 and mu0 < 1),
  n0 real not null check (n0 > 0),
  primary key (version, chronotype_class, category, daypart, day_type)
);

create table public.model_registry (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('priors','als','blend','ranker')),
  version text not null,
  artifact_uri text,
  metrics jsonb not null default '{}'::jsonb,
  promoted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create table public.cluster_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cluster_id int not null,
  method text not null check (method in ('rmeq_seed','als_foldin')),
  assigned_at timestamptz not null default now()
);

create table public.study_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_no smallint not null,
  sequence text not null check (sequence in ('ABAB','BABA')),
  arm text not null check (arm in ('A','B')),
  starts_on date not null,
  ends_on date not null,
  primary key (user_id, phase_no)
);

create table public.gcal_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id text,
  resource_id text,
  sync_token text,
  channel_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- proof-of-erasure survives the cascade: no user FK by design (specs/07 §4.1)
create table public.deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_hash text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- shared triggers wiring
-- ---------------------------------------------------------------------------
create trigger profiles_seq before insert or update on public.profiles
  for each row execute function public.tg_set_server_seq();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();
create trigger profiles_version before update on public.profiles
  for each row execute function public.tg_bump_version();

create trigger tasks_seq before insert or update on public.tasks
  for each row execute function public.tg_set_server_seq();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.tg_touch_updated_at();
create trigger tasks_version before update on public.tasks
  for each row execute function public.tg_bump_version();

create trigger calendar_events_seq before insert or update on public.calendar_events
  for each row execute function public.tg_set_server_seq();
create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function public.tg_touch_updated_at();

create trigger plans_seq before insert on public.plans
  for each row execute function public.tg_set_server_seq();

create trigger recommendations_seq before insert or update on public.recommendations
  for each row execute function public.tg_set_server_seq();
create trigger recommendations_touch before update on public.recommendations
  for each row execute function public.tg_touch_updated_at();
create trigger recommendations_version before update on public.recommendations
  for each row execute function public.tg_bump_version();

-- ---------------------------------------------------------------------------
-- Row-Level Security (NFR-S1: every table) + grants (specs/07 §4.4 catalog).
-- Supabase default-grants ALL to anon/authenticated; revoke down to the catalog.
-- service_role bypasses RLS and keeps full grants.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.calendar_events enable row level security;
alter table public.plans enable row level security;
alter table public.recommendations enable row level security;
alter table public.events enable row level security;
alter table public.feedback_rewards enable row level security;
alter table public.bandit_state enable row level security;
alter table public.beta_cells enable row level security;
alter table public.blend_state enable row level security;
alter table public.prior_cells enable row level security;
alter table public.model_registry enable row level security;
alter table public.cluster_assignments enable row level security;
alter table public.study_assignments enable row level security;
alter table public.gcal_sync_state enable row level security;
alter table public.deletion_audit enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- profiles: own row, no delete (account deletion is a service concern)
revoke all on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;
create policy profiles_select on public.profiles for select
  using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles for insert
  with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- tasks: full CRUD on own rows
revoke all on public.tasks from authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
create policy tasks_all on public.tasks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- calendar_events: read own; written by the webhook (service role)
revoke all on public.calendar_events from authenticated;
grant select on public.calendar_events to authenticated;
create policy calendar_events_select on public.calendar_events for select
  using ((select auth.uid()) = user_id);

-- plans: read own; written by plan-request (service role)
revoke all on public.plans from authenticated;
grant select on public.plans to authenticated;
create policy plans_select on public.plans for select
  using ((select auth.uid()) = user_id);

-- recommendations: read own; clients may update ONLY status+version (column grant
-- + status whitelist trigger); rows are service-authored
revoke all on public.recommendations from authenticated;
grant select on public.recommendations to authenticated;
grant update (status, version) on public.recommendations to authenticated;
create policy recommendations_select on public.recommendations for select
  using ((select auth.uid()) = user_id);
create policy recommendations_update on public.recommendations for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- events: append-only for clients — select + insert own, no update/delete policies or grants
revoke all on public.events from authenticated;
grant select, insert on public.events to authenticated;
create policy events_select on public.events for select
  using ((select auth.uid()) = user_id);
create policy events_insert on public.events for insert
  with check ((select auth.uid()) = user_id);

-- feedback_rewards: read own; written only by the service side
revoke all on public.feedback_rewards from authenticated;
grant select on public.feedback_rewards to authenticated;
create policy feedback_rewards_select on public.feedback_rewards for select
  using ((select auth.uid()) = user_id);

-- model state: read own; written only by the RecSys service
revoke all on public.bandit_state from authenticated;
grant select on public.bandit_state to authenticated;
create policy bandit_state_select on public.bandit_state for select
  using ((select auth.uid()) = user_id);

revoke all on public.beta_cells from authenticated;
grant select on public.beta_cells to authenticated;
create policy beta_cells_select on public.beta_cells for select
  using ((select auth.uid()) = user_id);

revoke all on public.blend_state from authenticated;
grant select on public.blend_state to authenticated;
create policy blend_state_select on public.blend_state for select
  using ((select auth.uid()) = user_id);

-- global read-only reference data
revoke all on public.prior_cells from authenticated;
grant select on public.prior_cells to authenticated;
create policy prior_cells_select on public.prior_cells for select
  to authenticated using (true);

revoke all on public.model_registry from authenticated;
grant select on public.model_registry to authenticated;
create policy model_registry_select on public.model_registry for select
  to authenticated using (true);

-- assignments: read own; written by training/admin (service role)
revoke all on public.cluster_assignments from authenticated;
grant select on public.cluster_assignments to authenticated;
create policy cluster_assignments_select on public.cluster_assignments for select
  using ((select auth.uid()) = user_id);

revoke all on public.study_assignments from authenticated;
grant select on public.study_assignments to authenticated;
create policy study_assignments_select on public.study_assignments for select
  using ((select auth.uid()) = user_id);

-- server-only tables: no client access at all (RLS enabled, zero policies, zero grants)
revoke all on public.gcal_sync_state from authenticated;
revoke all on public.deletion_audit from authenticated;
