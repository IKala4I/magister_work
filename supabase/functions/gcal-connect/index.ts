/**
 * Supabase Edge Function `gcal-connect` (FR-03; ADR-0012 §10). Wiring only — logic in
 * handler.ts (tested with fakes), adapters in ../gcal-webhook/db.ts. `verify_jwt = false`: the
 * JWT is verified here with `auth.getClaims`.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_WEBHOOK_BASE.
 */
import { createClient } from '@supabase/supabase-js';
import { revokeToken } from '../_shared/gcal.ts';
import { deleteState, loadState, saveState, wipeEvents } from '../gcal-webhook/db.ts';
import { googleClient, googleConfigFromEnv } from '../gcal-webhook/google.ts';
import { handleGcalConnect } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleGcalConnect(req, {
      now: () => Date.now(),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      config: googleConfigFromEnv(),
      google: googleClient,
      revokeToken: (t) => revokeToken(t),
      loadState: (userId) => loadState(admin, userId),
      saveState: (userId, patch) => saveState(admin, userId, patch),
      deleteState: (userId) => deleteState(admin, userId),
      wipeEvents: (userId) => wipeEvents(admin, userId),
      nonce: () => crypto.randomUUID(),
    });
  } catch (err) {
    console.error('gcal-connect failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
