/**
 * `gcal-connect` (user JWT; FR-03; ADR-0012 §10): `status`, `start` (returns Google's consent
 * URL with a one-shot state nonce bound to the uid — the code exchange happens in
 * `gcal-callback`, server-side, so the refresh token never reaches the device), `disconnect`
 * (stop the channel, revoke the token, drop the state, tombstone the mirrored events) and
 * `set_write_back` (the opt-in; needs the write scope, which `start {scope: 'write'}` obtains
 * by incremental authorization). Works for magic-link and anonymous users alike — connecting a
 * calendar is not signing in with Google.
 */
import { authUrl, type GoogleConfig } from '../_shared/gcal.ts';
import {
  ensureAccessToken,
  type GcalState,
  type GoogleClient,
  type SyncDeps,
} from '../_shared/gcal_sync.ts';
import type {
  GcalConnectBody,
  GcalConnectResponse,
  GcalScope,
  GcalStatus,
} from '../_shared/sync_types.ts';

export interface Deps {
  now(): number;
  verifyUser(token: string): Promise<string | null>;
  config: GoogleConfig | null;
  google: Pick<GoogleClient, 'refreshAccessToken' | 'stopChannel'>;
  revokeToken(token: string): Promise<boolean>;
  loadState(userId: string): Promise<GcalState | null>;
  saveState(userId: string, patch: Partial<GcalState>): Promise<void>;
  deleteState(userId: string): Promise<void>;
  wipeEvents(userId: string): Promise<void>;
  nonce(): string;
}

/** The slice of the sync core `ensureAccessToken` reads (a disconnect needs a live token). */
function tokenDeps(deps: Deps, config: GoogleConfig): SyncDeps {
  return {
    now: deps.now,
    config,
    google: deps.google as GoogleClient,
    saveState: deps.saveState,
    upsertEvents: () => Promise.resolve(),
    wipeEvents: deps.wipeEvents,
    loadOpenRecs: () => Promise.resolve([]),
    markDisplaced: () => Promise.resolve(),
    loadWriteBackRecs: () => Promise.resolve([]),
    saveWriteBack: () => Promise.resolve(),
    randomId: deps.nonce,
  };
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

export function statusOf(state: GcalState | null): GcalStatus {
  const connected = state !== null && state.refresh_token !== null;
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
    case 'set_write_back':
      if (typeof b.enabled !== 'boolean') return 'enabled must be a boolean';
      return { action: 'set_write_back', enabled: b.enabled };
    default:
      return 'action must be status, start, disconnect or set_write_back';
  }
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

    case 'disconnect': {
      if (state !== null) {
        if (deps.config !== null && state.refresh_token !== null) {
          // best effort: Google may already have revoked/expired everything
          try {
            if (state.channel_id !== null && state.resource_id !== null) {
              const access = await ensureAccessToken(tokenDeps(deps, deps.config), state);
              await deps.google.stopChannel(access, {
                channelId: state.channel_id,
                resourceId: state.resource_id,
              });
            }
          } catch {
            // ignore
          }
          await deps.revokeToken(state.refresh_token);
        }
        await deps.deleteState(userId);
        await deps.wipeEvents(userId);
      }
      return json(200, { status: statusOf(null) });
    }

    case 'set_write_back': {
      if (state === null || state.refresh_token === null) {
        return json(409, { error: 'not_connected' });
      }
      if (body.enabled && state.scope !== 'write') {
        return json(409, { error: 'not_connected', detail: 'write scope required' });
      }
      await deps.saveState(userId, { write_back: body.enabled });
      return json(200, { status: statusOf({ ...state, write_back: body.enabled }) });
    }
  }
}
