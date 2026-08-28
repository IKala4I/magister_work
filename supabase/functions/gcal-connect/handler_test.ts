/**
 * `gcal-connect` with injected deps: auth, `status`, `start` (consent URL + one-shot nonce with
 * a 10-min expiry, 503 without credentials), `disconnect` (stop channel, revoke, drop state,
 * tombstone events), `set_write_back` (needs the write scope).
 */
import { assertEquals } from '@std/assert';
import type { GcalState } from '../_shared/gcal_sync.ts';
import { type Deps, encodeState, handleGcalConnect, OAUTH_STATE_TTL_MS } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-01T10:00:00Z');
const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://fn/gcal-callback',
  webhookAddress: 'https://fn/gcal-webhook',
};

function connected(over: Partial<GcalState> = {}): GcalState {
  return {
    user_id: USER,
    calendar_id: 'primary',
    refresh_token: 'rt',
    access_token: 'at',
    access_token_expires_at: new Date(NOW + 3_600_000).toISOString(),
    sync_token: 'tok',
    channel_id: 'ch1',
    resource_id: 'res1',
    channel_token: 'secret',
    channel_expires_at: new Date(NOW + 86_400_000).toISOString(),
    scope: 'read',
    write_back: false,
    last_synced_at: new Date(NOW - 60_000).toISOString(),
    last_error: null,
    connected_at: new Date(NOW - 86_400_000).toISOString(),
    oauth_state: null,
    oauth_state_expires_at: null,
    timezone: 'Europe/Kyiv',
    ...over,
  };
}

interface Fake {
  state: GcalState | null;
  saved: Array<Partial<GcalState>>;
  deleted: number;
  wiped: number;
  stopped: Array<{ channelId: string; resourceId: string }>;
  revoked: string[];
}

function deps(f: Fake, over: Partial<Deps> = {}): Deps {
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    config: CFG,
    google: {
      refreshAccessToken: () => Promise.resolve({ access_token: 'at2', expires_in: 3600 }),
      stopChannel: (_t, input) => {
        f.stopped.push(input);
        return Promise.resolve();
      },
    },
    revokeToken: (t) => {
      f.revoked.push(t);
      return Promise.resolve(true);
    },
    loadState: () => Promise.resolve(f.state),
    saveState: (_u, patch) => {
      f.saved.push(patch);
      if (f.state) Object.assign(f.state, patch);
      else f.state = connected({ refresh_token: null, ...patch });
      return Promise.resolve();
    },
    deleteState: () => {
      f.deleted++;
      f.state = null;
      return Promise.resolve();
    },
    wipeEvents: () => {
      f.wiped++;
      return Promise.resolve();
    },
    nonce: () => 'nonce-1',
    ...over,
  };
}

function fake(state: GcalState | null): Fake {
  return { state, saved: [], deleted: 0, wiped: 0, stopped: [], revoked: [] };
}

function req(body: unknown, token: string | null = 'good'): Request {
  return new Request('http://x/gcal-connect', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

Deno.test('401 without / with a bad token; 400 on unknown actions and bad bodies', async () => {
  const d = deps(fake(null));
  assertEquals((await handleGcalConnect(req({ action: 'status' }, null), d)).status, 401);
  assertEquals((await handleGcalConnect(req({ action: 'status' }, 'bad'), d)).status, 401);
  assertEquals((await handleGcalConnect(req({ action: 'nope' }), d)).status, 400);
  assertEquals((await handleGcalConnect(req({ action: 'start', scope: 'all' }), d)).status, 400);
  assertEquals((await handleGcalConnect(req({ action: 'set_write_back' }), d)).status, 400);
});

Deno.test('status: not connected vs connected', async () => {
  const none = await handleGcalConnect(req({ action: 'status' }), deps(fake(null)));
  assertEquals((await none.json()).status.connected, false);
  const some = await handleGcalConnect(req({ action: 'status' }), deps(fake(connected())));
  const body = await some.json();
  assertEquals(body.status.connected, true);
  assertEquals(body.status.scope, 'read');
  assertEquals(body.status.write_back, false);
  assertEquals(body.status.calendar_id, 'primary');
});

Deno.test('start: stores a one-shot nonce with a 10-minute expiry and returns the consent URL; 503 without credentials', async () => {
  const f = fake(null);
  const res = await handleGcalConnect(req({ action: 'start' }), deps(f));
  assertEquals(res.status, 200);
  const body = await res.json();
  const u = new URL(body.auth_url);
  assertEquals(u.searchParams.get('state'), encodeState('nonce-1', 'read'));
  assertEquals(body.expires_at, new Date(NOW + OAUTH_STATE_TTL_MS).toISOString());
  assertEquals(f.saved[0].oauth_state, 'nonce-1');
  const write = await handleGcalConnect(req({ action: 'start', scope: 'write' }), deps(f));
  const wu = new URL((await write.json()).auth_url);
  assertEquals(wu.searchParams.get('state'), encodeState('nonce-1', 'write'));
  const off = await handleGcalConnect(req({ action: 'start' }), deps(f, { config: null }));
  assertEquals(off.status, 503);
});

Deno.test('disconnect: stops the channel, revokes the refresh token, drops the state and tombstones the mirror', async () => {
  const f = fake(connected());
  const res = await handleGcalConnect(req({ action: 'disconnect' }), deps(f));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status.connected, false);
  assertEquals(f.stopped, [{ channelId: 'ch1', resourceId: 'res1' }]);
  assertEquals(f.revoked, ['rt']);
  assertEquals(f.deleted, 1);
  assertEquals(f.wiped, 1);
  // idempotent when nothing is connected
  const again = await handleGcalConnect(req({ action: 'disconnect' }), deps(fake(null)));
  assertEquals(again.status, 200);
});

Deno.test('set_write_back: 409 when not connected or without the write scope; saved otherwise; off always allowed', async () => {
  const none = await handleGcalConnect(
    req({ action: 'set_write_back', enabled: true }),
    deps(fake(null)),
  );
  assertEquals(none.status, 409);
  const readOnly = await handleGcalConnect(
    req({ action: 'set_write_back', enabled: true }),
    deps(fake(connected())),
  );
  assertEquals(readOnly.status, 409);
  const f = fake(connected({ scope: 'write' }));
  const on = await handleGcalConnect(req({ action: 'set_write_back', enabled: true }), deps(f));
  assertEquals(on.status, 200);
  assertEquals((await on.json()).status.write_back, true);
  assertEquals(f.saved, [{ write_back: true }]);
  const g = fake(connected({ scope: 'read', write_back: true }));
  const off = await handleGcalConnect(req({ action: 'set_write_back', enabled: false }), deps(g));
  assertEquals(off.status, 200);
  assertEquals(g.saved, [{ write_back: false }]);
});
