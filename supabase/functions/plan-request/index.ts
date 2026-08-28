/**
 * Supabase Edge Function `plan-request` (specs/07 §5 "called by plan-request EF only").
 * Wiring only — the logic is in handler.ts (tested with fakes) and the adapters beside it.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: RECSYS_URL (the HF Space), HOURWELL_SERVICE_KEY (shared with the service).
 * `verify_jwt = false` in config.toml: the token is verified HERE with `auth.getClaims`
 * (asymmetric project keys via JWKS), so the gateway's legacy HS256 check is not relied on.
 */
import { createClient } from '@supabase/supabase-js';
import { withLease } from '../_shared/lease.ts';
import { handlePlanRequest } from './handler.ts';
import { countPlansLast24h, loadContext } from './context.ts';
import { persist } from './persist.ts';
import { callService, type ServiceConfig, wakeService } from './service.ts';

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

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handlePlanRequest(req, {
      now: () => Date.now(),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      loadContext: (userId, planDate, horizon, nowMs) =>
        loadContext(userClient, userId, planDate, horizon, nowMs),
      countPlansLast24h: (userId, nowMs) => countPlansLast24h(userClient, userId, nowMs),
      callService: (body, budgetMs) => callService(serviceConfig, body, budgetMs),
      // under the user's lease so a concurrent pull never straddles the plan's server_seq
      // assignment and its commit (ADR-0012 §7; adversarial #14)
      persist: (input) => withLease(admin, input.userId, () => persist(admin, input)),
      wakeService: () => {
        const probe = wakeService(serviceConfig);
        // deno-lint-ignore no-explicit-any
        const rt = (globalThis as any).EdgeRuntime;
        if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(probe);
      },
    });
  } catch (err) {
    console.error('plan-request failed', err); // details stay in the function logs
    return new Response(
      JSON.stringify({ error: 'internal', detail: 'see function logs' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
});
