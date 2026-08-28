/**
 * Supabase Edge Function `sync-resolve` (File 05 §2; ADR-0012). Wiring only — the logic is in
 * handler.ts (tested with fakes), the adapters in db.ts; the reward pass is
 * `attribute-rewards`' `processUser` with its own adapters (one mapping, two callers).
 * `verify_jwt = false`: the JWT is verified here with `auth.getClaims`.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: RECSYS_URL, HOURWELL_SERVICE_KEY (for the /feedback delivery inside the reward pass).
 */
import { createClient } from '@supabase/supabase-js';
import { makeDbDeps } from '../attribute-rewards/db.ts';
import { postFeedback, type ServiceConfig } from '../attribute-rewards/feedback.ts';
import { processUser } from '../attribute-rewards/handler.ts';
import { acquireLease, pullRows, releaseLease, replayOps } from './db.ts';
import { handleSyncResolve, LEASE_TTL_SECONDS } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const serviceConfig: ServiceConfig = {
  url: Deno.env.get('RECSYS_URL') ?? null,
  serviceKey: Deno.env.get('HOURWELL_SERVICE_KEY') ?? null,
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rewardDbDeps = makeDbDeps(admin);

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  const verifyUser = async (jwt: string) => {
    const { data, error } = await userClient.auth.getClaims(jwt);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub;
  };
  try {
    return await handleSyncResolve(req, {
      now: () => Date.now(),
      verifyUser,
      acquireLease: (userId) => acquireLease(admin, userId, LEASE_TTL_SECONDS),
      releaseLease: (userId, lease) => releaseLease(admin, userId, lease),
      replay: (userId, ops) => replayOps(admin, userId, ops),
      rewards: (userId) =>
        processUser(
          {
            ...rewardDbDeps,
            now: () => Date.now(),
            serviceKey: serviceConfig.serviceKey,
            verifyUser,
            postFeedback: (uid, tuples) => postFeedback(serviceConfig, uid, tuples),
          },
          userId,
          'instant',
          null,
        ),
      pull: (_jwt, cursor, limit) => pullRows(userClient, cursor, limit),
    });
  } catch (err) {
    console.error('sync-resolve failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
