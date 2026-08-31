-- P11 — training pipeline, model registry gate, study mode (ADR-0015; File 04 §3.4–3.5,
-- File 06 §1.2; NFR-S3; privacy README §7).
--
-- 1  cluster_cells         per-cluster EB cell aggregates for the fold-in refresh (service-only)
-- 2  storage bucket        'models' — private; artifact_uri targets (ADR-0011: EU storage)
-- 3  context_bucket CHECK  recommendations.context_bucket pinned to the 14 φ ids (NFR-S3 rule:
--                          every whitelisted text column is schema-CHECKed; NOT VALID so rows
--                          predating the vocabulary freeze never block the push — new rows only)
-- 4  registry gate         instantiate_user_priors reads the highest PROMOTED priors version
--                          (ADR-0005 §6 note, decided by ADR-0015 §7); seed v0 gets its
--                          promoted model_registry row so behaviour is unchanged today
-- 5  enroll_participant    study mode (File 06 §1.2 ABAB/BABA; G6 EU/EEA answer) — service-only
-- 6  diagnose_user         counts/timestamps only (privacy README §7 item 1) — service-only

-- ---------------------------------------------------------------------------
-- (1) cluster_cells — versioned per-cluster (α₀-source) aggregates (File 04 §3.4 "that
-- cluster's cell aggregates become the new (α₀, β₀) only for still-unvisited cells").
-- Written by the nightly pipeline (service role); never read by clients. RLS on, no
-- policies: like gcal_sync_state, only the service role passes (NFR-S1).
-- ---------------------------------------------------------------------------
create table public.cluster_cells (
  version int not null,
  cluster_id int not null,
  category text not null check (category in ('deep','admin','physical','learning')),
  daypart text not null check (daypart in ('EM','MO','MD','AF','EV','NT')),
  day_type text not null check (day_type in ('weekday','weekend')),
  mu0 real not null check (mu0 > 0 and mu0 < 1),
  n0 real not null check (n0 > 0),
  created_at timestamptz not null default now(),
  primary key (version, cluster_id, category, daypart, day_type)
);
comment on table public.cluster_cells is
  'P11 (ADR-0015 §5): per-cluster empirical-Bayes cell aggregates, versioned with the ALS run that produced them. Applied to a user''s UNVISITED beta_cells only, on a cluster switch (invariant 5).';
alter table public.cluster_cells enable row level security;

-- ---------------------------------------------------------------------------
-- (2) private artifacts bucket (ADR-0011 option A / ADR-0015 §14). No storage.objects
-- policies: only the service role (VM pipeline) reads or writes it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('models', 'models', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- (3) φ vocabulary pinned in schema (specs/07 §3.2.5: |C| = 14; spec-conflicts M3).
-- NOT VALID: guards every new row; historical rows are re-checked by the export code.
-- ---------------------------------------------------------------------------
alter table public.recommendations
  add constraint recommendations_context_bucket_check check (context_bucket in (
    'EM.wd','MO.wd.fresh','MO.wd.fatigued','MD.wd','AF.wd.fresh','AF.wd.fatigued',
    'EV.wd','NT.wd','EM.we','MO.we','MD.we','AF.we','EV.we','NT.we'
  )) not valid;

-- ---------------------------------------------------------------------------
-- (4a) the seed priors are version 0, promoted (they served every plan so far — NFR-O1).
-- ---------------------------------------------------------------------------
insert into public.model_registry (kind, version, artifact_uri, metrics, promoted)
values ('priors', '0', null,
        '{"source": "File 04 §3.2–3.3 seed tables (migration 20260824120300)"}'::jsonb, true)
on conflict (kind, version) do nothing;

-- ---------------------------------------------------------------------------
-- (4b) instantiate_user_priors — unchanged except the version selection: the highest
-- prior_cells version with a PROMOTED model_registry row (kind = 'priors'), falling back to
-- the highest version present (a dev DB without registry rows keeps working). An unpromoted
-- empirical-Bayes refresh is thereby inert for new users (ADR-0015 §7 eval gate).
-- ---------------------------------------------------------------------------
create or replace function public.instantiate_user_priors(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_class text;
  v_skip_mult double precision;
  v_version int;
  v_inserted integer;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then
    return 0;
  end if;

  v_class := coalesce(v_profile.chronotype_class, 'INT');
  v_skip_mult := case when v_profile.survey_skipped then 0.5 else 1.0 end;

  -- ADR-0015 §7: highest PROMOTED priors version; fall back to the highest present.
  select max(pc.version) into v_version
    from public.prior_cells pc
    join public.model_registry mr
      on mr.kind = 'priors' and mr.promoted and mr.version = pc.version::text;
  if v_version is null then
    select max(version) into v_version from public.prior_cells;
  end if;

  with daypart(daypart, d_start, d_end) as (
    -- File 04 §3.2 daypart boundaries, minutes from local midnight
    values ('EM', 360, 540), ('MO', 540, 720), ('MD', 720, 840),
           ('AF', 840, 1020), ('EV', 1020, 1200), ('NT', 1200, 1440)
  ),
  day(day_key, day_type) as (
    values ('mon', 'weekday'), ('tue', 'weekday'), ('wed', 'weekday'),
           ('thu', 'weekday'), ('fri', 'weekday'),
           ('sat', 'weekend'), ('sun', 'weekend')
  ),
  wh as (
    select d.day_key, d.day_type,
           case when jsonb_typeof(v_profile.working_hours -> d.day_key) = 'array'
                 and jsonb_array_length(v_profile.working_hours -> d.day_key) = 2
                 and jsonb_typeof(v_profile.working_hours -> d.day_key -> 0) = 'number'
                 and jsonb_typeof(v_profile.working_hours -> d.day_key -> 1) = 'number'
             then (v_profile.working_hours -> d.day_key ->> 0)::numeric
           end as ws,
           case when jsonb_typeof(v_profile.working_hours -> d.day_key) = 'array'
                 and jsonb_array_length(v_profile.working_hours -> d.day_key) = 2
                 and jsonb_typeof(v_profile.working_hours -> d.day_key -> 0) = 'number'
                 and jsonb_typeof(v_profile.working_hours -> d.day_key -> 1) = 'number'
             then (v_profile.working_hours -> d.day_key ->> 1)::numeric
           end as we
    from day d
  ),
  day_flags as (
    select dp.daypart, w.day_type,
           (w.ws is not null and w.we is not null
             and w.ws >= 0 and w.we <= 1440 and w.ws < w.we
             and 2 * greatest(0::numeric, least(dp.d_end, w.we) - greatest(dp.d_start, w.ws))
                 >= (dp.d_end - dp.d_start)) as qualifies
    from daypart dp
    cross join wh w
  ),
  cell_hours as (
    select daypart, day_type,
           (2 * count(*) filter (where qualifies) > count(*)) as in_hours
    from day_flags
    group by daypart, day_type
  ),
  ins as (
    insert into public.beta_cells
      (user_id, category, daypart, day_type, succ, fail, alpha0, beta0, prior_version)
    select p_user_id, pc.category, pc.daypart, pc.day_type, 0, 0,
           (pc.n0 * case when ch.in_hours then 1.0 else 0.5 end * v_skip_mult) * pc.mu0,
           (pc.n0 * case when ch.in_hours then 1.0 else 0.5 end * v_skip_mult) * (1.0 - pc.mu0),
           pc.version
    from public.prior_cells pc
    join cell_hours ch on ch.daypart = pc.daypart and ch.day_type = pc.day_type
    where pc.chronotype_class = v_class
      and pc.version = v_version
    on conflict (user_id, category, daypart, day_type) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  insert into public.cluster_assignments (user_id, cluster_id, method)
  values (p_user_id, public.chronotype_seed_cluster(v_class), 'rmeq_seed')
  on conflict (user_id) do nothing;

  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- (5) enroll_participant — File 06 §1.2: four phases × 2 weeks, sequence ABAB | BABA
-- (blocked randomization happens OUTSIDE, training/scripts/randomize_sequences.py — this
-- function records one participant's already-drawn sequence). Phase 1 starts AFTER the
-- run-in week (the operator passes the date). Records the G6 Art. 27 trigger answer
-- (profiles.eu_eea_resident) and flips research_cohort. Re-enrollment is an operator
-- error, not an upsert: it raises. Service/operator only.
-- ---------------------------------------------------------------------------
create or replace function public.enroll_participant(
  p_user_id uuid,
  p_sequence text,
  p_eu_eea boolean,
  p_phase1_start date
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phase int;
begin
  if p_sequence not in ('ABAB', 'BABA') then
    raise exception 'sequence must be ABAB or BABA, got %', p_sequence;
  end if;
  if p_eu_eea is null then
    raise exception 'the EU/EEA-residence answer is required (privacy README G6)';
  end if;
  if p_phase1_start is null then
    raise exception 'phase-1 start date is required (day after the run-in week ends)';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'no profile for user % (onboarding must complete first)', p_user_id;
  end if;
  if exists (select 1 from public.study_assignments where user_id = p_user_id) then
    raise exception 'user % is already enrolled', p_user_id;
  end if;

  update public.profiles
     set research_cohort = true,
         eu_eea_resident = p_eu_eea
   where user_id = p_user_id;

  for v_phase in 1..4 loop
    insert into public.study_assignments (user_id, phase_no, sequence, arm, starts_on, ends_on)
    values (
      p_user_id,
      v_phase,
      p_sequence,
      substr(p_sequence, v_phase, 1),
      p_phase1_start + (v_phase - 1) * 14,
      p_phase1_start + (v_phase - 1) * 14 + 13
    );
  end loop;

  return 4;
end;
$$;
revoke execute on function public.enroll_participant(uuid, text, boolean, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (6) diagnose_user — the purpose-built support path (privacy README §7 item 1): counts and
-- timestamps only, never a content column. Raises on zero or ambiguous matches so the
-- operator can never browse by prefix.
-- ---------------------------------------------------------------------------
create or replace function public.diagnose_user(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_n int;
begin
  select count(*) into v_n from auth.users where email = p_email;
  if v_n = 0 then
    raise exception 'no user with that email';
  elsif v_n > 1 then
    raise exception 'ambiguous email (% matches)', v_n;
  end if;
  select id into v_uid from auth.users where email = p_email;

  return jsonb_build_object(
    'user_hash', encode(sha256(v_uid::text::bytea), 'hex'),
    'profile', (select jsonb_build_object(
        'exists', count(*) = 1,
        'onboarding_completed', bool_or(onboarding_completed_at is not null),
        'research_cohort', bool_or(research_cohort),
        'eu_eea_resident', bool_or(eu_eea_resident))
      from public.profiles where user_id = v_uid),
    'tasks', (select count(*) from public.tasks where user_id = v_uid),
    'events', (select jsonb_build_object('n', count(*), 'last', max(server_ts))
      from public.events where user_id = v_uid),
    'plans', (select jsonb_build_object('n', count(*), 'last', max(generated_at))
      from public.plans where user_id = v_uid),
    'recommendations', (select count(*) from public.recommendations where user_id = v_uid),
    'feedback_rewards', (select jsonb_build_object(
        'n', count(*), 'excluded', count(*) filter (where excluded), 'last', max(attributed_at))
      from public.feedback_rewards where user_id = v_uid),
    'beta_cells', (select count(*) from public.beta_cells where user_id = v_uid),
    'belief_labels', (select count(*) from public.belief_labels where user_id = v_uid),
    'duration_estimates', (select count(*) from public.duration_estimates where user_id = v_uid),
    'sync_ops', (select jsonb_build_object('n', count(*), 'last', max(applied_at))
      from public.sync_ops where user_id = v_uid),
    'cluster', (select jsonb_build_object('cluster_id', cluster_id, 'method', method)
      from public.cluster_assignments where user_id = v_uid),
    'study', (select jsonb_build_object('enrolled', count(*) > 0,
        'sequence', min(sequence), 'first_phase', min(starts_on), 'last_phase', max(ends_on))
      from public.study_assignments where user_id = v_uid)
  );
end;
$$;
revoke execute on function public.diagnose_user(text)
  from public, anon, authenticated;
