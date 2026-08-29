/**
 * Supabase Edge Function `gcal-connect` (FR-03; ADR-0012 §10). Wiring only — logic in
 * handler.ts (tested with fakes), sync core in `_shared/gcal_sync.ts`, adapters in
 * ../gcal-webhook/db.ts. `verify_jwt = false`: the JWT is verified here with `auth.getClaims`.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_WEBHOOK_BASE.
 */
import { createClient } from '@supabase/supabase-js';
import { revokeToken } from '../_shared/gcal.ts';
import { ensureChannel, syncUser, writeBack } from '../_shared/gcal_sync.ts';
import { withLease } from '../_shared/lease.ts';
import {
  deleteState,
  loadState,
  loadStateByConfirmToken,
  makeSyncDbDeps,
} from '../gcal-webhook/db.ts';
import { googleClient, googleConfigFromEnv } from '../gcal-webhook/google.ts';
import { handleGcalConnect } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dbDeps = makeSyncDbDeps(admin);

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleGcalConnect(req, {
      ...dbDeps,
      now: () => Date.now(),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      config: googleConfigFromEnv(),
      google: googleClient,
      randomId: () => crypto.randomUUID(),
      revokeToken: (t) => revokeToken(t),
      loadState: (userId) => loadState(admin, userId),
      loadStateByConfirmToken: (t) => loadStateByConfirmToken(admin, t),
      deleteState: (userId) => deleteState(admin, userId),
      initialSync: (deps, state) =>
        withLease(admin, state.user_id, async () => {
          await syncUser(deps, state);
          await ensureChannel(deps, state);
          await writeBack(deps, state);
        }),
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
