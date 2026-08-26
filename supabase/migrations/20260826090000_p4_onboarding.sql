-- P4 — Onboarding: profile consistency guards + cold-start prior instantiation.
-- Spec anchors: File 04 §3.1 (rMEQ classes), §3.3 (n0 rules), §3.4 (seed cluster = rMEQ
-- class); specs/07 §3.6 (rungs), §4.1 (profiles/beta_cells/cluster_assignments);
-- spec-conflicts M5 (in-hours cell rule) + L8 (skip ⇒ halved n0 IS the wider-exploration
-- mechanism); ADR-0005 (P4 cold-start instantiation decisions).
--
-- The prior VALUES themselves were seeded in 20260824120300_seed_prior_cells_v0.sql and are
-- a day-zero bootstrap: version 0 of an object that empirical Bayes re-fits quarterly
-- (File 04 §3.5). This migration only copies them into per-user beta_cells with the
-- per-user n0 multipliers — it never invents numbers.
--
-- Invariants enforced here:
--   1 (client never touches model state): EXECUTE on the instantiation function is revoked
--     from authenticated/anon; it runs only via the profiles trigger or service_role.
--   5 (priors never overwrite evidence): every insert is ON CONFLICT DO NOTHING.

-- ---------------------------------------------------------------------------
-- profiles consistency guards (File 04 §3.1)
-- ---------------------------------------------------------------------------
-- The rMEQ→class cutoffs (22/18/12/8, R ∈ [4,25]) are enforced at the schema level so a
-- client bug can never store a class that contradicts its own score. A skipped survey has
-- no score and is always INT (File 04 §3.1 "Skipped survey ⇒ c0 = INT").
alter table public.profiles
  add constraint profiles_chronotype_matches_score check (
    chronotype_class is null
    or (rmeq_score is null and survey_skipped and chronotype_class = 'INT')
    or (rmeq_score is not null and not survey_skipped and chronotype_class = case
          when rmeq_score >= 22 then 'DM'
          when rmeq_score >= 18 then 'MM'
          when rmeq_score >= 12 then 'INT'
          when rmeq_score >= 8  then 'ME'
          else 'DE' end)
  ),
  add constraint profiles_completed_requires_class check (
    onboarding_completed_at is null or chronotype_class is not null
  );

-- ---------------------------------------------------------------------------
-- seed cluster mapping (File 04 §3.4: "cluster id := c0"; ids are ordinals in the
-- class order of the spec tables — see CHRONOTYPE_SEED_CLUSTER in packages/shared)
-- ---------------------------------------------------------------------------
create or replace function public.chronotype_seed_cluster(p_class text)
returns int
language sql
immutable
as $$
  select case p_class
    when 'DM' then 0
    when 'MM' then 1
    when 'INT' then 2
    when 'ME' then 3
    when 'DE' then 4
  end;
$$;

-- ---------------------------------------------------------------------------
-- instantiate_user_priors: prior_cells (latest version) → beta_cells for one user
-- ---------------------------------------------------------------------------
-- n0 semantics (File 04 §3.3 + seed-migration contract): the stored n0 already carries the
-- day-type base (8 weekday, 4 weekend = "n0 halved"); this function applies the per-user
-- multipliers ×0.5 outside declared working hours and ×0.5 if the survey was skipped.
--
-- In-hours rule (spec-conflicts M5, fixed by ADR-0005): a cell counts as inside working
-- hours iff a STRICT majority of that day-type's days (≥3 of 5 weekdays, 2 of 2 weekend
-- days) have ≥50% of the daypart's minutes overlapping that day's declared working hours.
-- Days with no/malformed working_hours entries contribute zero overlap (never an error:
-- a degraded profile yields weaker priors, not a failed onboarding).
--
-- Uses the highest prior_cells version present, so post-P11 empirical-Bayes refreshes
-- reach new users without touching this function; prior_version records which one.
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
  v_inserted integer;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then
    return 0;
  end if;

  v_class := coalesce(v_profile.chronotype_class, 'INT');
  v_skip_mult := case when v_profile.survey_skipped then 0.5 else 1.0 end;

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
      and pc.version = (select max(version) from public.prior_cells)
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
-- trigger: instantiate exactly when onboarding completes (first non-null
-- onboarding_completed_at, whether it arrives by INSERT or UPDATE)
-- ---------------------------------------------------------------------------
create or replace function public.on_onboarding_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.instantiate_user_priors(new.user_id);
  return new;
end;
$$;

create trigger profiles_onboarding_insert
  after insert on public.profiles
  for each row
  when (new.onboarding_completed_at is not null)
  execute function public.on_onboarding_completed();

create trigger profiles_onboarding_update
  after update of onboarding_completed_at on public.profiles
  for each row
  when (old.onboarding_completed_at is null and new.onboarding_completed_at is not null)
  execute function public.on_onboarding_completed();

-- ---------------------------------------------------------------------------
-- permissions (invariant 1: clients never touch model state; NFR-S1)
-- ---------------------------------------------------------------------------
revoke execute on function public.instantiate_user_priors(uuid) from public, anon, authenticated;
revoke execute on function public.on_onboarding_completed() from public, anon, authenticated;
grant execute on function public.instantiate_user_priors(uuid) to service_role;
grant execute on function public.chronotype_seed_cluster(text) to authenticated, service_role;
