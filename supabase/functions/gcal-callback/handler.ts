/**
 * `gcal-callback` (no JWT — Google's browser redirect lands here; ADR-0012 §10): the one-shot
 * `state` nonce (`<nonce>.<scope>`, ≤ 10 min old) identifies the user, the code is exchanged
 * server-side with the client secret, the refresh token is stored in the server-only
 * `gcal_sync_state`, the initial full sync + push channel run, and the browser is sent back to
 * the app (`hourwell://gcal-callback?status=…`). Nothing here is trusted from the URL beyond
 * the nonce match; a replayed link finds no nonce and is bounced.
 */
import { exchangeCode, type GoogleConfig, scopeKeyOf } from '../_shared/gcal.ts';
import type { GcalState, SyncDeps } from '../_shared/gcal_sync.ts';
import type { GcalScope } from '../_shared/sync_types.ts';

export interface Deps extends Omit<SyncDeps, 'config'> {
  config: GoogleConfig | null;
  /** Where the browser goes afterwards (the app's deep link). */
  appRedirect: string;
  loadStateByNonce(nonce: string): Promise<GcalState | null>;
  exchangeCode(cfg: GoogleConfig, code: string): ReturnType<typeof exchangeCode>;
  /** Initial sync + channel for a freshly connected user (injected: `runInitialSync`). */
  initialSync(deps: SyncDeps, state: GcalState): Promise<void>;
}

export type CallbackStatus =
  | 'ok'
  | 'denied'
  | 'invalid_state'
  | 'expired_state'
  | 'exchange_failed'
  | 'no_refresh_token'
  | 'not_configured';

function redirect(
  deps: Deps,
  status: CallbackStatus,
  extra: Record<string, string> = {},
): Response {
  const u = new URL(deps.appRedirect);
  u.searchParams.set('status', status);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: u.toString() } });
}

export function decodeState(raw: string | null): { nonce: string; scope: GcalScope } | null {
  if (raw === null) return null;
  const i = raw.lastIndexOf('.');
  if (i <= 0) return null;
  const nonce = raw.slice(0, i);
  const scope = raw.slice(i + 1);
  if (nonce.length === 0 || (scope !== 'read' && scope !== 'write')) return null;
  return { nonce, scope };
}

export async function handleGcalCallback(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  if (deps.config === null) return redirect(deps, 'not_configured');
  const url = new URL(req.url);
  const parsed = decodeState(url.searchParams.get('state'));
  if (parsed === null) return redirect(deps, 'invalid_state');
  const state = await deps.loadStateByNonce(parsed.nonce);
  if (state === null) return redirect(deps, 'invalid_state');
  const nowMs = deps.now();
  const exp = state.oauth_state_expires_at === null ? 0 : Date.parse(state.oauth_state_expires_at);
  // the nonce is one-shot whatever happens next
  await deps.saveState(state.user_id, { oauth_state: null, oauth_state_expires_at: null });
  if (exp < nowMs) return redirect(deps, 'expired_state');
  if (url.searchParams.get('error') !== null) return redirect(deps, 'denied');
  const code = url.searchParams.get('code');
  if (code === null || code.length === 0) return redirect(deps, 'invalid_state');

  let tokens;
  try {
    tokens = await deps.exchangeCode(deps.config, code);
  } catch (err) {
    console.error('gcal-callback exchange failed', (err as Error)?.message);
    return redirect(deps, 'exchange_failed');
  }
  const refreshToken = tokens.refresh_token ?? state.refresh_token;
  if (refreshToken === null || refreshToken === undefined) {
    return redirect(deps, 'no_refresh_token');
  }
  const grantedKey = scopeKeyOf(tokens.scope) ?? parsed.scope;
  const scope: GcalScope = grantedKey === 'write' || state.scope === 'write' ? 'write' : 'read';
  const nowIso = new Date(nowMs).toISOString();
  const patch: Partial<GcalState> = {
    refresh_token: refreshToken,
    access_token: tokens.access_token,
    access_token_expires_at: new Date(nowMs + tokens.expires_in * 1000).toISOString(),
    scope,
    connected_at: state.connected_at ?? nowIso,
    last_error: null,
    // asking for the write scope IS opting in to the write-back (one consent, one switch)
    ...(parsed.scope === 'write' && scope === 'write' ? { write_back: true } : {}),
  };
  await deps.saveState(state.user_id, patch);
  const next: GcalState = { ...state, ...patch, oauth_state: null, oauth_state_expires_at: null };
  try {
    await deps.initialSync({ ...(deps as unknown as SyncDeps), config: deps.config }, next);
  } catch (err) {
    const detail = ((err as Error)?.message ?? String(err)).slice(0, 300);
    console.error('gcal-callback initial sync failed', detail);
    await deps.saveState(state.user_id, { last_error: detail }).catch(() => {});
    return redirect(deps, 'ok', { sync: 'failed' });
  }
  return redirect(deps, 'ok', { scope });
}
