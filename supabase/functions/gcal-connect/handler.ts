/**
 * `gcal-connect` (user JWT; FR-03; ADR-0012 §10): `status`, `start` (returns Google's consent
 * URL with a one-shot state nonce bound to the uid — the code exchange happens in
 * `gcal-callback`, server-side, so the refresh token never reaches the device), `confirm`
 * (adversarial #10: the callback stores the tokens UNCONFIRMED and hands the redirected device a
 * one-shot confirm token; only the device that started the consent can activate the connection,
 * and a consent obtained by phishing another person is purged because the confirming JWT does
 * not own the row), `disconnect` (remove the mirrored events, stop the channel, revoke the
 * token, drop the state, tombstone the imported events) and `set_write_back` (the opt-in; needs
 * the write scope, which `start {scope: 'write'}` obtains by incremental authorization; off
 * removes the mirrored events). Works for magic-link and anonymous users alike — connecting a
 * calendar is not signing in with Google.
 */
import { authUrl, type GoogleConfig } from '../_shared/gcal.ts';
import {
  clearWriteBack,
  disconnectGoogle,
  type GcalState,
  type SyncDeps,
} from '../_shared/gcal_sync.ts';
import type {
  GcalConnectBody,
  GcalConnectResponse,
  GcalScope,
  GcalStatus,
} from '../_shared/sync_types.ts';

export interface Deps extends Omit<SyncDeps, 'config'> {
  config: GoogleConfig | null;
  verifyUser(token: string): Promise<string | null>;
  revokeToken(token: string): Promise<boolean>;
  loadState(userId: string): Promise<GcalState | null>;
  loadStateByConfirmToken(token: string): Promise<GcalState | null>;
  deleteState(userId: string): Promise<void>;
  /** Initial sync + channel for a freshly confirmed connection (injected). */
  initialSync(deps: SyncDeps, state: GcalState): Promise<void>;
  nonce(): string;
}

/** The consent round trip must finish within this window. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: GcalConnectResponse): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

export function isConnected(state: GcalState | null): state is GcalState {
  return state !== null && state.refresh_token !== null && state.confirmed_at !== null;
}

export function statusOf(state: GcalState | null): GcalStatus {
  const connected = isConnected(state);
  return {
    connected,
    scope: connected ? state.scope : null,
    write_back: connected ? state.write_back : false,
    calendar_id: connected ? state.calendar_id : null,
    last_synced_at: connected ? state.last_synced_at : null,
    last_error: connected ? state.last_error : null,
    channel_expires_at: connected ? state.channel_expires_at : null,
    connected_at: connected ? state.connected_at : null,
  };
}

/** `state` query value: `<nonce>.<scope>` — the callback needs the requested scope. */
export function encodeState(nonce: string, scope: GcalScope): string {
  return `${nonce}.${scope}`;
}

function parseBody(raw: unknown): GcalConnectBody | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be a JSON object';
  const b = raw as Record<string, unknown>;
  switch (b.action) {
    case 'status':
    case 'disconnect':
      return { action: b.action };
    case 'start': {
      const scope = b.scope ?? 'read';
      if (scope !== 'read' && scope !== 'write') return 'scope must be read or write';
      return { action: 'start', scope };
    }
    case 'confirm':
      if (typeof b.token !== 'string' || b.token.length === 0 || b.token.length > 128) {
        return 'token must be a non-empty string';
      }
      return { action: 'confirm', token: b.token };
    case 'set_write_back':
      if (typeof b.enabled !== 'boolean') return 'enabled must be a boolean';
      return { action: 'set_write_back', enabled: b.enabled };
    default:
      return 'action must be status, start, confirm, disconnect or set_write_back';
  }
}

/** Tokens stored by the callback are dropped when the confirm fails (never activated). */
function purge(deps: Deps, userId: string): Promise<void> {
  return deps.saveState(userId, {
    refresh_token: null,
    access_token: null,
    access_token_expires_at: null,
    confirm_token: null,
    confirm_token_expires_at: null,
    confirmed_at: null,
  });
}

export async function handleGcalConnect(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'bad_request', detail: 'POST only' });
  const token = bearer(req);
  if (token === null) return json(401, { error: 'unauthorized', detail: 'missing bearer token' });
  const userId = await deps.verifyUser(token);
  if (userId === null) return json(401, { error: 'unauthorized' });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'bad_request', detail: 'invalid JSON' });
  }
  const body = parseBody(raw);
  if (typeof body === 'string') return json(400, { error: 'bad_request', detail: body });

  const state = await deps.loadState(userId);
  const sync = (config: GoogleConfig): SyncDeps => ({ ...deps, config });
  switch (body.action) {
    case 'status':
      return json(200, { status: statusOf(state) });

    case 'start': {
      if (deps.config === null) return json(503, { error: 'not_configured' });
      const nonce = deps.nonce();
      const expiresAt = new Date(deps.now() + OAUTH_STATE_TTL_MS).toISOString();
      await deps.saveState(userId, { oauth_state: nonce, oauth_state_expires_at: expiresAt });
      return json(200, {
        auth_url: authUrl(deps.config, {
          state: encodeState(nonce, body.scope ?? 'read'),
          scope: body.scope ?? 'read',
        }),
        expires_at: expiresAt,
      });
    }

    case 'confirm': {
      if (deps.config === null) return json(503, { error: 'not_configured' });
      const pending = await deps.loadStateByConfirmToken(body.token);
      if (pending === null) return json(409, { error: 'invalid_confirm', detail: 'unknown token' });
      const exp = pending.confirm_token_expires_at === null
        ? 0
        : Date.parse(pending.confirm_token_expires_at);
      if (pending.user_id !== userId || exp < deps.now() || pending.refresh_token === null) {
        // a consent that did not come back to the account that asked for it is never activated
        await purge(deps, pending.user_id);
        return json(409, {
          error: 'invalid_confirm',
          detail: 'consent did not match this account',
        });
      }
      const nowIso = new Date(deps.now()).toISOString();
      const patch: Partial<GcalState> = {
        confirmed_at: nowIso,
        connected_at: pending.connected_at ?? nowIso,
        confirm_token: null,
        confirm_token_expires_at: null,
        last_error: null,
      };
      await deps.saveState(userId, patch);
      const confirmed: GcalState = { ...pending, ...patch };
      try {
        await deps.initialSync(sync(deps.config), confirmed);
      } catch (err) {
        const detail = ((err as Error)?.message ?? String(err)).slice(0, 300);
        console.error('gcal-connect initial sync failed', detail);
        await deps.saveState(userId, { last_error: detail }).catch(() => {});
        confirmed.last_error = detail;
      }
      return json(200, { status: statusOf(confirmed) });
    }

    case 'disconnect': {
      if (state !== null) {
        if (deps.config !== null && state.refresh_token !== null) {
          // shared with account erasure (ADR-0014 §8): mirror out, channel stopped, token revoked
          await disconnectGoogle(sync(deps.config), state, deps.revokeToken);
        }
        await deps.deleteState(userId);
        await deps.wipeEvents(userId);
      }
      return json(200, { status: statusOf(null) });
    }

    case 'set_write_back': {
      if (!isConnected(state)) return json(409, { error: 'not_connected' });
      if (body.enabled && state.scope !== 'write') {
        return json(409, { error: 'not_connected', detail: 'write scope required' });
      }
      if (!body.enabled && deps.config !== null) {
        try {
          await clearWriteBack(sync(deps.config), state);
        } catch {
          // the switch still goes off; stale events are a cosmetic residue
        }
      }
      await deps.saveState(userId, { write_back: body.enabled });
      return json(200, { status: statusOf({ ...state, write_back: body.enabled }) });
    }
  }
}
