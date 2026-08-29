/**
 * Supabase Edge Function `attribute-rewards` (specs/07 §3.4–3.5; File 05 §1). Wiring only — the
 * logic is in handler.ts (tested with fakes), the adapters in db.ts, the service call in
 * feedback.ts. Callers: the client after pushing facts (`mode: instant`, user JWT), pg_cron via
 * pg_net every 15 min (`mode: daily`, `x-service-key`), and P8's sync-resolve (backend key +
 * user_id). `verify_jwt = false`: the JWT is verified here with `auth.getClaims`.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: RECSYS_URL (the service host, ADR-0009), HOURWELL_SERVICE_KEY (shared backend key —
 * the same value the cron tick reads from Vault and the service checks on /feedback).
 */
import { createClient } from '@supabase/supabase-js';
import { acquireLease, releaseLease } from '../_shared/lease.ts';
import { makeDbDeps } from './db.ts';
import { postFeedback, postLabels, type ServiceConfig } from './feedback.ts';
import { handleAttributeRewards } from './handler.ts';

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
const dbDeps = makeDbDeps(admin);

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleAttributeRewards(req, {
      ...dbDeps,
      now: () => Date.now(),
      serviceKey: serviceConfig.serviceKey,
      acquireLease: (userId) => acquireLease(admin, userId),
      releaseLease: (userId, token) => releaseLease(admin, userId, token),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      postFeedback: (userId, tuples) => postFeedback(serviceConfig, userId, tuples),
      postLabels: (userId, labels) => postLabels(serviceConfig, userId, labels),
    });
  } catch (err) {
    console.error('attribute-rewards failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
