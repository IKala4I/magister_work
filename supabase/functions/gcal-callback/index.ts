/**
 * Supabase Edge Function `gcal-callback` (FR-03; ADR-0012 §10) — Google's OAuth redirect target.
 * Wiring only — logic in handler.ts (tested with fakes), sync core in `_shared/gcal_sync.ts`,
 * adapters in ../gcal-webhook/db.ts. No JWT: the one-shot state nonce authenticates the round
 * trip (`verify_jwt = false`).
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_WEBHOOK_BASE; optional GCAL_APP_REDIRECT
 * (default hourwell://gcal-callback).
 */
import { createClient } from '@supabase/supabase-js';
import { exchangeCode } from '../_shared/gcal.ts';
import { ensureChannel, syncUser, writeBack } from '../_shared/gcal_sync.ts';
import { loadStateByNonce, makeSyncDbDeps } from '../gcal-webhook/db.ts';
import { googleClient, googleConfigFromEnv } from '../gcal-webhook/google.ts';
import { handleGcalCallback } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_REDIRECT = Deno.env.get('GCAL_APP_REDIRECT') ?? 'hourwell://gcal-callback';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dbDeps = makeSyncDbDeps(admin);

Deno.serve(async (req: Request) => {
  try {
    return await handleGcalCallback(req, {
      ...dbDeps,
      now: () => Date.now(),
      config: googleConfigFromEnv(),
      google: googleClient,
      randomId: () => crypto.randomUUID(),
      appRedirect: APP_REDIRECT,
      loadStateByNonce: (nonce) => loadStateByNonce(admin, nonce),
      exchangeCode: (cfg, code) => exchangeCode(cfg, code),
      initialSync: async (deps, state) => {
        await syncUser(deps, state);
        await ensureChannel(deps, state);
        await writeBack(deps, state);
      },
    });
  } catch (err) {
    console.error('gcal-callback failed', err); // details stay in the function logs
    return new Response(null, {
      status: 302,
      headers: { location: `${APP_REDIRECT}?status=internal` },
    });
  }
});
