/**
 * Supabase Edge Function `insights` (P9, ADR-0013). Wiring only — the logic is in handler.ts
 * (tested with fakes). `verify_jwt = false`: the JWT is verified here with `auth.getClaims`;
 * the study data (recommendations, focus facts, profile) is read under the USER's client so RLS
 * is the filter; the model service is reached with the shared backend key.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY. Secrets: RECSYS_URL, HOURWELL_SERVICE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { handleInsights, type ServiceCall } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RECSYS_URL = Deno.env.get('RECSYS_URL') ?? null;
const SERVICE_KEY = Deno.env.get('HOURWELL_SERVICE_KEY') ?? null;

async function fetchInsights(userId: string): Promise<ServiceCall> {
  if (RECSYS_URL === null || SERVICE_KEY === null) return { kind: 'not_configured' };
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let res: Response;
  try {
    const url = `${RECSYS_URL.replace(/\/$/, '')}/insights?user_id=${encodeURIComponent(userId)}`;
    res = await fetch(url, {
      headers: { 'x-service-key': SERVICE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { kind: 'failed', status: null, detail: String((err as Error)?.name ?? err), ms: ms() };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    return { kind: 'failed', status: res.status, detail, ms: ms() };
  }
  const body = await res.json().catch(() => null);
  if (body === null || !Array.isArray(body.heatmap)) {
    return { kind: 'failed', status: res.status, detail: 'invalid response', ms: ms() };
  }
  return { kind: 'ok', body, ms: ms() };
}

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleInsights(req, {
      now: () => Date.now(),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      loadProfile: async (userId) => {
        const { data, error } = await userClient
          .from('profiles')
          .select('timezone, chronotype_class, survey_skipped, onboarding_completed_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new Error(`profiles: ${error.message}`);
        if (data === null || data.onboarding_completed_at === null) return null;
        return {
          timezone: data.timezone,
          chronotype_class: data.chronotype_class ?? null,
          survey_skipped: Boolean(data.survey_skipped),
        };
      },
      fetchInsights,
      loadBlocks: async (userId, fromIso) => {
        // facts + placements only (spec-conflicts H2): no reward column is selected here
        const { data, error } = await userClient
          .from('recommendations')
          .select('id, slot_start, slot_end, status')
          .eq('user_id', userId)
          .gte('slot_end', fromIso)
          .limit(2000);
        if (error) throw new Error(`recommendations: ${error.message}`);
        return (data ?? []) as {
          id: string;
          slot_start: string;
          slot_end: string;
          status: string;
        }[];
      },
      loadFocusFacts: async (userId, fromIso) => {
        const { data, error } = await userClient
          .from('events')
          .select('type, recommendation_id, payload')
          .eq('user_id', userId)
          .eq('type', 'focus_end')
          .gte('client_ts', fromIso)
          .order('client_ts', { ascending: false })
          .limit(4000);
        if (error) throw new Error(`events: ${error.message}`);
        if ((data ?? []).length === 4000) console.warn('insights: focus facts capped at 4000');
        return (data ?? []).map((e) => ({
          type: e.type as string,
          recommendation_id: (e.recommendation_id as string | null) ?? null,
          payload: (e.payload ?? {}) as Record<string, unknown>,
        }));
      },
    });
  } catch (err) {
    console.error('insights failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
