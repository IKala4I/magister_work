/**
 * Supabase Edge Function `export-data` (FR-42 / UC-10; ADR-0014 §7). Wiring only — the logic is
 * in handler.ts (tested with fakes). `verify_jwt = false`: the JWT is verified here with
 * `auth.getClaims`; every row is read under the USER's client so RLS is the filter (the uid
 * predicate is belt and braces).
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { handleExportData } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleExportData(req, {
      now: () => Date.now(),
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getClaims(jwt);
        if (error || !data?.claims?.sub) return null;
        return data.claims.sub;
      },
      readPage: async (table, userId, order, from, to) => {
        let q = userClient.from(table).select('*').eq('user_id', userId);
        for (const col of order) q = q.order(col, { ascending: true });
        const { data, error } = await q.range(from, to);
        if (error) throw new Error(`${table}: ${error.message}`);
        return (data ?? []) as Record<string, unknown>[];
      },
    });
  } catch (err) {
    console.error('export-data failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
