-- P11 key audit (runbook §11): the P7 attribution sweep sent the Vault anon key as
-- `Authorization: Bearer` AND `apikey`. The key in Vault is a NEW-generation publishable key
-- (sb_publishable_...), and per the Supabase key migration guide new keys are NOT JWTs and
-- must ride the `apikey` header only — a Bearer publishable key causes JWT parsing errors in
-- anything that parses it. It is tolerated TODAY only because every function runs
-- verify_jwt = false and the daily path keys off `x-service-key` (live evidence: 6 h of
-- uniform 200s in net._http_response) — this migration removes the latent break by aligning
-- the sweep with the P10 retention tick's header shape (x-service-key + apikey only).
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
  'Appendix A attribution cron: every 15 min, POST {"mode":"daily"} to the attribute-rewards edge function. Vault secrets hourwell_functions_url, hourwell_service_key, hourwell_anon_key (apikey header ONLY — new-generation keys are not JWTs and never ride Authorization: Bearer; runbook §11). Without url/key the tick is a no-op.';
