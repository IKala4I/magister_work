/**
 * Supabase Edge Function `gcal-webhook` (FR-03/UC-09; ADR-0012 §10). Wiring only — the logic is
 * in handler.ts (tested with fakes), the sync core in `_shared/gcal_sync.ts`, the adapters in
 * db.ts. Callers: Google push channels (no JWT — the per-channel token authenticates) and
 * pg_cron's `gcal_sweep_tick()` every 5 min (`x-service-key`). `verify_jwt = false`.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: HOURWELL_SERVICE_KEY, GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_WEBHOOK_BASE.
 */
import { createClient } from '@supabase/supabase-js';
import { loadConnected, loadStateByChannel, makeSyncDbDeps } from './db.ts';
import { googleClient, googleConfigFromEnv } from './google.ts';
import { handleGcalWebhook } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('HOURWELL_SERVICE_KEY') ?? null;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dbDeps = makeSyncDbDeps(admin);

Deno.serve(async (req: Request) => {
  try {
    return await handleGcalWebhook(req, {
      ...dbDeps,
      now: () => Date.now(),
      config: googleConfigFromEnv(),
      google: googleClient,
      serviceKey: SERVICE_KEY,
      randomId: () => crypto.randomUUID(),
      loadStateByChannel: (channelId) => loadStateByChannel(admin, channelId),
      loadConnected: () => loadConnected(admin),
    });
  } catch (err) {
    console.error('gcal-webhook failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
