/**
 * Supabase Edge Function `gcal-callback` (FR-03; ADR-0012 §10) — Google's OAuth redirect target.
 * Wiring only — logic in handler.ts (tested with fakes), adapters in ../gcal-webhook/db.ts. No
 * JWT: the one-shot state nonce authenticates the round trip (`verify_jwt = false`); the
 * connection is activated by `gcal-connect {confirm}` from the redirected device.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_WEBHOOK_BASE; optional GCAL_APP_REDIRECT
 * (default hourwell://gcal-callback).
 */
import { createClient } from '@supabase/supabase-js';
import { exchangeCode } from '../_shared/gcal.ts';
import { loadStateByNonce, saveState } from '../gcal-webhook/db.ts';
import { googleConfigFromEnv } from '../gcal-webhook/google.ts';
import { handleGcalCallback } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_REDIRECT = Deno.env.get('GCAL_APP_REDIRECT') ?? 'hourwell://gcal-callback';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  try {
    return await handleGcalCallback(req, {
      now: () => Date.now(),
      config: googleConfigFromEnv(),
      appRedirect: APP_REDIRECT,
      loadStateByNonce: (nonce) => loadStateByNonce(admin, nonce),
      saveState: (userId, patch) => saveState(admin, userId, patch),
      exchangeCode: (cfg, code) => exchangeCode(cfg, code),
      randomId: () => crypto.randomUUID(),
    });
  } catch (err) {
    console.error('gcal-callback failed', err); // details stay in the function logs
    return new Response(null, {
      status: 302,
      headers: { location: `${APP_REDIRECT}?status=internal` },
    });
  }
});
