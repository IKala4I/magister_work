/**
 * Supabase Edge Function `delete-account` (FR-42 / UC-10; ADR-0014 §8–§10). Wiring only — the
 * logic is in handler.ts (tested with fakes). `verify_jwt = false`: the user JWT (self mode) is
 * verified here with `auth.getClaims`; operator and retention modes carry the backend key.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Secrets: HOURWELL_SERVICE_KEY; GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_WEBHOOK_BASE
 * (Google teardown; without them the calendar rows still fall with the cascade).
 */
import { createClient } from '@supabase/supabase-js';
import { serviceKeyMatches } from '../_shared/auth.ts';
import { revokeToken } from '../_shared/gcal.ts';
import type { SyncDeps } from '../_shared/gcal_sync.ts';
import { loadState, makeSyncDbDeps } from '../gcal-webhook/db.ts';
import { googleClient, googleConfigFromEnv } from '../gcal-webhook/google.ts';
import { type DeletionReason, handleDeleteAccount } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('HOURWELL_SERVICE_KEY') ?? null;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const googleConfig = googleConfigFromEnv();
const gcalSync: SyncDeps | null = googleConfig === null ? null : {
  ...makeSyncDbDeps(admin),
  now: () => Date.now(),
  config: googleConfig,
  google: googleClient,
  randomId: () => crypto.randomUUID(),
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

Deno.serve(async (req: Request) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  try {
    return await handleDeleteAccount(req, {
      now: () => Date.now(),
      // getUser (server-side), not getClaims: a JWT whose account was just deleted must not
      // start a second "erasure" (FR-42; found by the P10 live smoke).
      verifyUser: async (jwt) => {
        const { data, error } = await userClient.auth.getUser(jwt);
        if (error || !data?.user?.id) return null;
        return data.user.id;
      },
      verifyServiceKey: (key) => serviceKeyMatches(SERVICE_KEY, key),
      hashUser: sha256Hex,
      userExists: async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) return false;
        return data?.user !== null && data?.user !== undefined;
      },
      loadGcalState: (userId) => loadState(admin, userId),
      gcalSync,
      revokeToken: (t) => revokeToken(t),
      insertAudit: async (row: { user_hash: string; reason: DeletionReason }) => {
        const { data, error } = await admin
          .from('deletion_audit')
          .insert(row)
          .select('id')
          .single();
        if (error || !data) fail('deletion_audit insert', error);
        return data.id as string;
      },
      completeAudit: async (id) => {
        const completed_at = new Date().toISOString();
        const { error } = await admin.from('deletion_audit').update({ completed_at }).eq('id', id);
        if (error) fail('deletion_audit complete', error);
        return completed_at;
      },
      deleteUser: async (userId) => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) fail('auth.admin.deleteUser', error);
      },
      purgeCandidates: async (nowIso, days, limit) => {
        const { data, error } = await admin.rpc('anonymous_purge_candidates', {
          p_now: nowIso,
          p_days: days,
          p_limit: limit,
        });
        if (error) fail('anonymous_purge_candidates', error);
        return ((data ?? []) as { user_id: string }[]).map((r) => ({ user_id: r.user_id }));
      },
    });
  } catch (err) {
    console.error('delete-account failed', err); // details stay in the function logs
    return new Response(JSON.stringify({ error: 'internal', detail: 'see function logs' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
