-- P7 follow-up — the functions gateway rejects requests without an `Authorization: Bearer …`
-- header even when `verify_jwt = false` (measured live 2026-08-27: `{"error":"unauthorized",
-- "detail":"missing bearer token"}` with no header AND with `apikey` only; the request reaches the
-- function once the publishable key is sent as the bearer). The cron tick therefore needs THREE
-- Vault secrets: `hourwell_functions_url`, `hourwell_service_key` (the backend key the function
-- checks) and `hourwell_anon_key` (the publishable key, sent as bearer + apikey). Without any of
-- them the tick stays a no-op.
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
begin
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
    url := rtrim(v_url, '/') || '/attribute-rewards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-service-key', v_key
    ),
    body := jsonb_build_object('mode', 'daily'),
    timeout_milliseconds := 60000
  );
  return 'posted';
end $$;
comment on function public.attribution_sweep_tick() is
  'Appendix A attribution cron: every 15 min, POST {"mode":"daily"} to the attribute-rewards edge function. Vault secrets hourwell_functions_url, hourwell_service_key, hourwell_anon_key (bearer for the gateway); without them the tick is a no-op.';
