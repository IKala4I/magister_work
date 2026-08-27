-- P7 adversarial follow-ups (#12, #20):
-- (1) attribution_due(): a slot is due only once its end + the ±15 min PAR grace has passed —
--     a 23:30–23:59 block used to be attributed at the 00:00 tick while its focus_end (23:58)
--     may not have synced yet; and a profile with an unusable timezone must not stall the sweep
--     for everyone (pg_timezone_names join instead of an exception).
-- (2) profiles.timezone is validated on write (IANA name known to this Postgres).
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
    and r.status in ('shown', 'accepted', 'pinned', 'moved')
    and r.slot_end + interval '15 minutes' <= p_now
    and timezone(p.timezone, p_now)
        >= date_trunc('day', timezone(p.timezone, r.slot_end)) + interval '23 hours 55 minutes'
  order by r.user_id, r.slot_end
  limit p_limit
$$;

create or replace function public.tg_validate_timezone() returns trigger
language plpgsql as $$
begin
  if new.timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists profiles_timezone_valid on public.profiles;
create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.tg_validate_timezone();
