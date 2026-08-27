-- P7 — feedback loop server side (specs/07 §3.4–3.5; File 05 §1; Appendix A "attribution cron",
-- "duration estimator").
--
-- (1) pg_net: the every-15-min pg_cron sweep reaches the `attribute-rewards` edge function over
--     HTTP (Appendix A: "23:55 local on UTC pg_cron — every-15-min sweep over timezones").
-- (2) duration_estimates: UC-06 A2 "actual duration updates the task-type duration estimator" —
--     EWMA of focused/estimated minutes per (user, category), α = 0.3 (Appendix A, fixed P7 by
--     ADR-0010). Written by the edge function (service role) from focus facts; read by
--     plan-request for BOTH engines (symmetric across arms, spec-conflicts H1).
-- (3) attribution_due(): the day boundary lives in SQL so the DST behaviour is pgTAP-tested —
--     a recommendation is due once the user's local clock (profile timezone) has passed 23:55 of
--     the slot's local day and the row is still unattributed in {shown, accepted, pinned, moved}
--     (M-02 displaced statuses never appear: no reward, File 05 §1). Idempotency is the
--     feedback_rewards (recommendation_id, kind) key, so a late or repeated sweep is harmless.
-- (4) attribution_sweep_tick(): reads the functions URL + the shared backend key from Vault and
--     posts {"mode":"daily"}; with no secrets configured it does nothing (safe default in CI and
--     before the owner sets them). Scheduled every 15 minutes.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- (2) duration_estimates
-- ---------------------------------------------------------------------------
create table public.duration_estimates (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('deep','admin','physical','learning')),
  ewma_ratio double precision not null check (ewma_ratio > 0),
  n int not null default 0 check (n >= 0),
  last_session_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
comment on table public.duration_estimates is
  'UC-06 A2 duration estimator: EWMA (α = 0.3) of focused_minutes / est_minutes over FINISHED focus sessions, per (user, category). Written by attribute-rewards (service role); plan-request scales est_minutes by clip(ewma, 0.5, 2) once n ≥ 3, for both engines.';
alter table public.duration_estimates enable row level security;
revoke all on public.duration_estimates from anon, authenticated;
grant select on public.duration_estimates to authenticated;
create policy duration_estimates_select on public.duration_estimates for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- feedback_rewards: delivery marker — a tuple is the durable substrate (specs/07 §3.5.5) and is
-- POSTed to /feedback afterwards; if the service is down (or, today, not yet hosted — ADR-0009)
-- the row stays undelivered and every sweep re-sends it. The service's (recommendation_id, kind)
-- id-set makes re-delivery a no-op, so learning signal is never lost, only late.
-- ---------------------------------------------------------------------------
alter table public.feedback_rewards add column delivered_at timestamptz;
alter table public.feedback_rewards add column source text not null default 'instant'
  check (source in ('instant', 'daily', 'correction'));
create index feedback_rewards_undelivered_idx on public.feedback_rewards (user_id)
  where delivered_at is null;
comment on column public.feedback_rewards.delivered_at is
  'Set when /feedback acknowledged the tuple (state_version returned). NULL = pending re-delivery by the next attribute-rewards sweep.';

-- ---------------------------------------------------------------------------
-- events: the reward mapping looks facts up by recommendation and by (task, local day)
-- ---------------------------------------------------------------------------
create index events_user_rec_idx on public.events (user_id, recommendation_id)
  where recommendation_id is not null;
create index events_user_task_day_idx on public.events (user_id, task_id, local_day)
  where task_id is not null;

-- ---------------------------------------------------------------------------
-- (3) attribution_due — recommendations whose local day has closed (23:55 local)
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
  where r.attributed_at is null
    and r.status in ('shown', 'accepted', 'pinned', 'moved')
    and timezone(p.timezone, p_now)
        >= date_trunc('day', timezone(p.timezone, r.slot_end)) + interval '23 hours 55 minutes'
  order by r.user_id, r.slot_end
  limit p_limit
$$;
comment on function public.attribution_due(timestamptz, int) is
  'File 05 §1 23:55-local authority: unattributed {shown, accepted, pinned, moved} recommendations whose slot day has closed in the profile timezone. Service-only.';
revoke all on function public.attribution_due(timestamptz, int) from public, anon, authenticated;
grant execute on function public.attribution_due(timestamptz, int) to service_role;

-- ---------------------------------------------------------------------------
-- (4) the cron tick — Vault-held URL + key; no-op until both exist
-- ---------------------------------------------------------------------------
create or replace function public.attribution_sweep_tick()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_key text;
  v_anon text;
  v_headers jsonb;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'hourwell_functions_url' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'hourwell_service_key' limit 1;
    select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'hourwell_anon_key' limit 1;
  exception when undefined_table or insufficient_privilege then
    return 'skipped: vault unavailable';
  end;
  if v_url is null or v_key is null then
    return 'skipped: vault secrets hourwell_functions_url / hourwell_service_key not set';
  end if;
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-service-key', v_key);
  if v_anon is not null then
    v_headers := v_headers || jsonb_build_object('apikey', v_anon);
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/attribute-rewards',
    headers := v_headers,
    body := jsonb_build_object('mode', 'daily'),
    timeout_milliseconds := 60000
  );
  return 'posted';
end $$;
comment on function public.attribution_sweep_tick() is
  'Appendix A attribution cron: every 15 min, POST {"mode":"daily"} to the attribute-rewards edge function. Secrets live in Vault (owner sets them once); without them the tick is a no-op.';
revoke all on function public.attribution_sweep_tick() from public, anon, authenticated;

select cron.schedule('attribute-rewards-sweep', '*/15 * * * *', $$select public.attribution_sweep_tick()$$);
