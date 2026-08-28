/**
 * `gcal-connect` with injected deps: auth, `status` (connected only when confirmed), `start`
 * (consent URL + one-shot nonce with a 10-min expiry, 503 without credentials), `confirm`
 * (adversarial #10: the redirected device activates the connection; a token that belongs to
 * another account, an expired one or a missing refresh token purges the pending tokens),
 * `disconnect` (mirrored events removed BEFORE the revoke, channel stopped, state dropped,
 * mirror tombstoned), `set_write_back` (needs the write scope; off removes the mirrored events).
 */
import { assertEquals } from '@std/assert';
import type { GcalState, WriteBackRec } from '../_shared/gcal_sync.ts';
import { type Deps, encodeState, handleGcalConnect, OAUTH_STATE_TTL_MS } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
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
    confirmed_at: new Date(NOW - 86_400_000).toISOString(),
    confirm_token: null,
    confirm_token_expires_at: null,
    oauth_state: null,
    oauth_state_expires_at: null,
    timezone: 'Europe/Kyiv',
    ...over,
  };
}

/** What the callback leaves behind: tokens stored, not yet confirmed. */
function pendingConfirm(over: Partial<GcalState> = {}): GcalState {
  return connected({
    connected_at: null,
    confirmed_at: null,
    confirm_token: 'confirm-1',
    confirm_token_expires_at: new Date(NOW + 60_000).toISOString(),
    channel_id: null,
    resource_id: null,
    channel_token: null,
    channel_expires_at: null,
    sync_token: null,
    last_synced_at: null,
    ...over,
  });
}

interface Fake {
  state: GcalState | null;
  saved: Array<Partial<GcalState>>;
  deleted: number;
  wiped: number;
  stopped: Array<{ channelId: string; resourceId: string }>;
  revoked: string[];
  mirrored: WriteBackRec[];
  deletedEvents: string[];
  synced: number;
  syncError: Error | null;
}

function fake(state: GcalState | null, over: Partial<Fake> = {}): Fake {
  return {
    state,
    saved: [],
    deleted: 0,
    wiped: 0,
    stopped: [],
    revoked: [],
    mirrored: [],
    deletedEvents: [],
    synced: 0,
    syncError: null,
    ...over,
  };
}

function deps(f: Fake, over: Partial<Deps> = {}): Deps {
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    config: CFG,
    randomId: () => 'id',
    google: {
      refreshAccessToken: () => Promise.resolve({ access_token: 'at2', expires_in: 3600 }),
      listEvents: () => Promise.resolve({ items: [] }),
      watchEvents: () => Promise.resolve({ resourceId: 'r', expiration: 0 }),
      stopChannel: (_t, input) => {
        f.stopped.push(input);
        return Promise.resolve();
      },
      insertEvent: () => Promise.resolve('e'),
      patchEvent: () => Promise.resolve(),
      deleteEvent: (_t, _cal, id) => {
        f.deletedEvents.push(id);
        return Promise.resolve();
      },
    },
    revokeToken: (t) => {
      f.revoked.push(t);
      return Promise.resolve(true);
    },
    loadState: () => Promise.resolve(f.state),
    loadStateByConfirmToken: (t) =>
      Promise.resolve(f.state !== null && f.state.confirm_token === t ? f.state : null),
    saveState: (_u, patch) => {
      f.saved.push(patch);
      if (f.state) Object.assign(f.state, patch);
      else f.state = connected({ refresh_token: null, confirmed_at: null, ...patch });
      return Promise.resolve();
    },
    deleteState: () => {
      f.deleted++;
      f.state = null;
      return Promise.resolve();
    },
    upsertEvents: () => Promise.resolve(),
    wipeEvents: () => {
      f.wiped++;
      return Promise.resolve();
    },
    loadOpenRecs: () => Promise.resolve([]),
    markDisplaced: () => Promise.resolve(),
    loadWriteBackRecs: () => Promise.resolve([]),
    loadWriteBackMirrored: () => Promise.resolve(f.mirrored),
    saveWriteBack: (_u, recId, patch) => {
      const r = f.mirrored.find((x) => x.id === recId);
      if (r) Object.assign(r, patch);
      return Promise.resolve();
    },
    initialSync: () => {
      f.synced++;
      return f.syncError ? Promise.reject(f.syncError) : Promise.resolve();
    },
    nonce: () => 'nonce-1',
    ...over,
  };
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

const mirrored = (): WriteBackRec[] => [
  {
    id: 'rec-1',
    slot_start: '2026-09-01T11:00:00.000Z',
    slot_end: '2026-09-01T12:00:00.000Z',
    status: 'shown',
    title: '',
    gcal_event_id: 'gev-1',
    gcal_synced_slot_start: '2026-09-01T11:00:00.000Z',
  },
  {
    id: 'rec-2',
    slot_start: '2026-09-02T11:00:00.000Z',
    slot_end: '2026-09-02T12:00:00.000Z',
    status: 'accepted',
    title: '',
    gcal_event_id: 'gev-2',
    gcal_synced_slot_start: '2026-09-02T11:00:00.000Z',
  },
];

Deno.test('401 without / with a bad token; 400 on unknown actions and bad bodies', async () => {
  const d = deps(fake(null));
  assertEquals((await handleGcalConnect(req({ action: 'status' }, null), d)).status, 401);
  assertEquals((await handleGcalConnect(req({ action: 'status' }, 'bad'), d)).status, 401);
  assertEquals((await handleGcalConnect(req({ action: 'nope' }), d)).status, 400);
  assertEquals((await handleGcalConnect(req({ action: 'start', scope: 'all' }), d)).status, 400);
  assertEquals((await handleGcalConnect(req({ action: 'set_write_back' }), d)).status, 400);
  assertEquals((await handleGcalConnect(req({ action: 'confirm' }), d)).status, 400);
});

Deno.test('status: not connected, pending (tokens stored but unconfirmed) is NOT connected, confirmed is', async () => {
  const none = await handleGcalConnect(req({ action: 'status' }), deps(fake(null)));
  assertEquals((await none.json()).status.connected, false);
  const pending = await handleGcalConnect(req({ action: 'status' }), deps(fake(pendingConfirm())));
  assertEquals((await pending.json()).status.connected, false);
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

Deno.test('confirm: the device that started the consent activates the connection and the initial sync runs', async () => {
  const f = fake(pendingConfirm());
  const res = await handleGcalConnect(req({ action: 'confirm', token: 'confirm-1' }), deps(f));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status.connected, true);
  assertEquals(f.state?.confirmed_at, new Date(NOW).toISOString());
  assertEquals(f.state?.connected_at, new Date(NOW).toISOString());
  assertEquals(f.state?.confirm_token, null, 'one-shot');
  assertEquals(f.synced, 1);
  // replay of the same token finds nothing
  const again = await handleGcalConnect(req({ action: 'confirm', token: 'confirm-1' }), deps(f));
  assertEquals(again.status, 409);
});

Deno.test('confirm: a token owned by ANOTHER account (phished consent) purges the tokens and never activates', async () => {
  const f = fake(pendingConfirm({ user_id: OTHER }));
  const res = await handleGcalConnect(req({ action: 'confirm', token: 'confirm-1' }), deps(f));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, 'invalid_confirm');
  assertEquals(f.state?.refresh_token, null, 'purged');
  assertEquals(f.state?.confirmed_at, null);
  assertEquals(f.synced, 0);
});

Deno.test('confirm: an expired token purges; a failed initial sync keeps the connection with last_error', async () => {
  const expired = fake(
    pendingConfirm({ confirm_token_expires_at: new Date(NOW - 1).toISOString() }),
  );
  const e = await handleGcalConnect(req({ action: 'confirm', token: 'confirm-1' }), deps(expired));
  assertEquals(e.status, 409);
  assertEquals(expired.state?.refresh_token, null);

  const failing = fake(pendingConfirm(), { syncError: new Error('events.list: HTTP 403 quota') });
  const res = await handleGcalConnect(
    req({ action: 'confirm', token: 'confirm-1' }),
    deps(failing),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status.connected, true);
  assertEquals(body.status.last_error, 'events.list: HTTP 403 quota');
  assertEquals(failing.state?.refresh_token, 'rt', 'the connection itself is kept');
});

Deno.test('disconnect: removes the mirrored events BEFORE revoking, stops the channel, drops the state, tombstones the mirror', async () => {
  const f = fake(connected({ scope: 'write', write_back: true }), { mirrored: mirrored() });
  const res = await handleGcalConnect(req({ action: 'disconnect' }), deps(f));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status.connected, false);
  assertEquals(f.deletedEvents, ['gev-1', 'gev-2']);
  assertEquals(f.mirrored.every((r) => r.gcal_event_id === null), true);
  assertEquals(f.stopped, [{ channelId: 'ch1', resourceId: 'res1' }]);
  assertEquals(f.revoked, ['rt']);
  assertEquals(f.deleted, 1);
  assertEquals(f.wiped, 1);
  // idempotent when nothing is connected
  const again = await handleGcalConnect(req({ action: 'disconnect' }), deps(fake(null)));
  assertEquals(again.status, 200);
});

Deno.test('set_write_back: 409 when not connected or without the write scope; on saves; off removes the mirrored events', async () => {
  const none = await handleGcalConnect(
    req({ action: 'set_write_back', enabled: true }),
    deps(fake(null)),
  );
  assertEquals(none.status, 409);
  const pending = await handleGcalConnect(
    req({ action: 'set_write_back', enabled: true }),
    deps(fake(pendingConfirm({ scope: 'write' }))),
  );
  assertEquals(pending.status, 409, 'unconfirmed is not connected');
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
  const g = fake(connected({ scope: 'write', write_back: true }), { mirrored: mirrored() });
  const off = await handleGcalConnect(req({ action: 'set_write_back', enabled: false }), deps(g));
  assertEquals(off.status, 200);
  assertEquals(g.deletedEvents, ['gev-1', 'gev-2']);
  assertEquals(g.saved.at(-1), { write_back: false });
});
