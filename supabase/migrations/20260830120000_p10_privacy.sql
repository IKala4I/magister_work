-- P10 — privacy + notifications server contract (ADR-0014).
--   (1) deletion_audit.reason: who asked for the erasure (FR-42 self-service, an operator acting
--       on a request, or the anonymous-account retention sweep).
--   (2) anonymous_purge_candidates(): the retention rule of specs/07 §7 / Appendix A read as
--       30 days of INACTIVITY (no sign-in, no event) for anonymous accounts — service-only.
--   (3) retention_sweep_tick(): daily pg_cron tick → delete-account {mode: retention} with the
--       Vault-held key (same pattern as attribution_sweep_tick; a no-op without the secrets).
--   (4) sync_apply_profile(): the profile_update replay now carries `settings` (notification
--       prefs incl. per-category mute, specs/07 §4.1) — the P8 body dropped the column.

-- ---------------------------------------------------------------------------
-- (1) deletion_audit.reason
-- ---------------------------------------------------------------------------
alter table public.deletion_audit
  add column reason text not null default 'user_request'
    check (reason in ('user_request', 'anonymous_retention', 'operator'));
comment on column public.deletion_audit.reason is
  'user_request = FR-42 self-service from Settings; operator = privacy README §7 path on a request; anonymous_retention = the 30-day inactivity purge (ADR-0014 §10).';
comment on table public.deletion_audit is
  'GDPR proof-of-erasure (UC-10): user_hash = SHA-256 of the auth uid (no FK — survives the cascade), requested/completed timestamps, reason. Written by the delete-account edge function only.';

-- ---------------------------------------------------------------------------
-- (2) anonymous_purge_candidates — inactive anonymous accounts (ADR-0014 §10)
-- ---------------------------------------------------------------------------
create or replace function public.anonymous_purge_candidates(
  p_now timestamptz default now(),
  p_days int default 30,
  p_limit int default 50
)
returns table (user_id uuid, last_seen_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select u.id,
         greatest(u.created_at,
                  coalesce(u.last_sign_in_at, u.created_at),
                  coalesce(e.last_event, u.created_at)) as last_seen_at
  from auth.users u
  left join lateral (
    select max(ev.server_ts) as last_event from public.events ev where ev.user_id = u.id
  ) e on true
  where u.is_anonymous = true
    and greatest(u.created_at,
                 coalesce(u.last_sign_in_at, u.created_at),
                 coalesce(e.last_event, u.created_at)) < p_now - make_interval(days => p_days)
  order by 2
  limit p_limit
$$;
comment on function public.anonymous_purge_candidates(timestamptz, int, int) is
  'Appendix A "anonymous 30 d" (ADR-0014 §10): anonymous accounts with no sign-in and no event for p_days. Consumed by delete-account {mode: retention}; service-only.';
revoke all on function public.anonymous_purge_candidates(timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.anonymous_purge_candidates(timestamptz, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- (3) the retention cron tick — Vault-held URL + key; no-op until both exist
-- ---------------------------------------------------------------------------
create or replace function public.retention_sweep_tick()
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
    url := rtrim(v_url, '/') || '/delete-account',
    headers := v_headers,
    body := jsonb_build_object('mode', 'retention'),
    timeout_milliseconds := 60000
  );
  return 'posted';
end $$;
comment on function public.retention_sweep_tick() is
  'ADR-0014 §10 retention cron: daily, POST {"mode":"retention"} to the delete-account edge function, which erases anonymous accounts inactive for 30 days through the same audited path as a user request. Secrets live in Vault; without them the tick is a no-op.';
revoke all on function public.retention_sweep_tick() from public, anon, authenticated;

select cron.schedule('retention-sweep', '10 3 * * *', $$select public.retention_sweep_tick()$$);

-- ---------------------------------------------------------------------------
-- (4) sync_apply_profile — merge `settings` (P8 body + one column, both branches)
-- ---------------------------------------------------------------------------
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
  v_settings jsonb;
begin
  if p->>'user_id' is not null and (not public.sync_is_uuid(p->>'user_id') or (p->>'user_id')::uuid <> p_user_id) then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'foreign user_id');
  end if;
  if jsonb_typeof(p->'top_categories') = 'array' then
    select coalesce(array_agg(x), '{}') into v_top from jsonb_array_elements_text(p->'top_categories') x;
  else
    v_top := '{}';
  end if;
  -- settings ride along only when the payload carries an object; absent = keep what is stored
  v_settings := case when jsonb_typeof(p->'settings') = 'object' then p->'settings' else null end;
  select * into cur from public.profiles pr where pr.user_id = p_user_id;
  if not found then
    insert into public.profiles (user_id, timezone, locale, working_hours, sleep_window, rmeq_score,
                                 chronotype_class, survey_skipped, top_categories, onboarding_completed_at,
                                 settings, updated_at)
    values (p_user_id, coalesce(p->>'timezone', 'UTC'), coalesce(p->>'locale', 'en'),
            coalesce(p->'working_hours', '{}'::jsonb), coalesce(p->'sleep_window', '{}'::jsonb),
            (p->>'rmeq_score')::smallint, p->>'chronotype_class',
            coalesce((p->>'survey_skipped')::boolean, false), v_top,
            public.sync_ts(p->'onboarding_completed_at'),
            coalesce(v_settings, '{}'::jsonb),
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
    settings = coalesce(v_settings, settings),
    updated_at = coalesce(public.sync_ts(p->'updated_at'), now())
  where user_id = p_user_id returning * into nxt;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                            'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
end $$;
