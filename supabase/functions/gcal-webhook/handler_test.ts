/**
 * `gcal-webhook` against a fake Google + fake database: channel authentication, the push path
 * (incremental sync → busy import → displacement of open FUTURE blocks only), the 410 full
 * resync, the sweep (stale users, channel renewal, not_configured), token refresh, the opt-in
 * write-back (insert / patch on move / delete on close), and error containment (200 + last_error).
 */
import { assert, assertEquals } from '@std/assert';
import type { EventsPage, GoogleEvent, MappedEvent, WriteBackEvent } from '../_shared/gcal.ts';
import type { GcalState, OpenRec, WriteBackRec } from '../_shared/gcal_sync.ts';
import { type Deps, handleGcalWebhook } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-01T10:58:00Z'); // 13:58 Kyiv
const KEY = 'backend-key';
const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://fn/gcal-callback',
  webhookAddress: 'https://fn/gcal-webhook',
};

function state(over: Partial<GcalState> = {}): GcalState {
  return {
    user_id: USER,
    calendar_id: 'primary',
    refresh_token: 'rt',
    access_token: 'at',
    access_token_expires_at: new Date(NOW + 3_600_000).toISOString(),
    sync_token: 'tok1',
    channel_id: 'ch1',
    resource_id: 'res1',
    channel_token: 'secret1',
    channel_expires_at: new Date(NOW + 5 * 86_400_000).toISOString(),
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

const meeting = (over: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: 'meet1',
  status: 'confirmed',
  summary: 'Design review',
  start: { dateTime: '2026-09-01T14:00:00+03:00' },
  end: { dateTime: '2026-09-01T15:00:00+03:00' },
  ...over,
});

interface Fake {
  states: GcalState[];
  pages: Array<EventsPage | 'gone'>;
  listCalls: Array<Record<string, unknown>>;
  events: Map<string, MappedEvent>;
  wiped: number;
  recs: Array<
    OpenRec & { title: string; gcal_event_id: string | null; gcal_synced_slot_start: string | null }
  >;
  displaced: string[];
  refreshed: number;
  watched: Array<{ channelId: string; token: string; address: string }>;
  stopped: Array<{ channelId: string; resourceId: string }>;
  inserted: WriteBackEvent[];
  patched: Array<{ eventId: string; e: WriteBackEvent }>;
  deleted: string[];
  saved: Array<Partial<GcalState>>;
  ids: number;
  listError: Error | null;
}

function fake(over: Partial<Fake> = {}): Fake {
  return {
    states: [state()],
    pages: [{ items: [meeting()], nextSyncToken: 'tok2', timeZone: 'Europe/Kyiv' }],
    listCalls: [],
    events: new Map(),
    wiped: 0,
    recs: [
      // open block exactly under the meeting → displaced
      {
        id: 'rec-9c1d',
        slot_start: '2026-09-01T11:00:00.000Z',
        slot_end: '2026-09-01T12:00:00.000Z',
        status: 'accepted',
        title: 'Slides',
        gcal_event_id: null,
        gcal_synced_slot_start: null,
      },
      // open block later in the day, no overlap → untouched
      {
        id: 'rec-later',
        slot_start: '2026-09-01T13:00:00.000Z',
        slot_end: '2026-09-01T14:00:00.000Z',
        status: 'shown',
        title: 'Reading',
        gcal_event_id: null,
        gcal_synced_slot_start: null,
      },
      // a block that already ended → the past is facts, never displaced
      {
        id: 'rec-past',
        slot_start: '2026-09-01T07:00:00.000Z',
        slot_end: '2026-09-01T08:00:00.000Z',
        status: 'shown',
        title: 'Old',
        gcal_event_id: null,
        gcal_synced_slot_start: null,
      },
    ],
    displaced: [],
    refreshed: 0,
    watched: [],
    stopped: [],
    inserted: [],
    patched: [],
    deleted: [],
    saved: [],
    ids: 0,
    listError: null,
    ...over,
  };
}

function deps(f: Fake, over: Partial<Deps> = {}): Deps {
  return {
    now: () => NOW,
    config: CFG,
    serviceKey: KEY,
    randomId: () => `id-${++f.ids}`,
    google: {
      refreshAccessToken: () => {
        f.refreshed++;
        return Promise.resolve({ access_token: 'at2', expires_in: 3600 });
      },
      listEvents: (_t, _cal, params) => {
        f.listCalls.push({ ...params });
        if (f.listError !== null) return Promise.reject(f.listError);
        const page = f.pages.shift();
        return Promise.resolve(page ?? { items: [], nextSyncToken: 'tokN' });
      },
      watchEvents: (_t, _cal, input) => {
        f.watched.push({ channelId: input.channelId, token: input.token, address: input.address });
        return Promise.resolve({
          resourceId: `res-${input.channelId}`,
          expiration: NOW + 7 * 86_400_000,
        });
      },
      stopChannel: (_t, input) => {
        f.stopped.push(input);
        return Promise.resolve();
      },
      insertEvent: (_t, _cal, e) => {
        f.inserted.push(e);
        return Promise.resolve(`gev-${e.recommendationId}`);
      },
      patchEvent: (_t, _cal, eventId, e) => {
        f.patched.push({ eventId, e });
        return Promise.resolve();
      },
      deleteEvent: (_t, _cal, eventId) => {
        f.deleted.push(eventId);
        return Promise.resolve();
      },
    },
    saveState: (userId, patch) => {
      f.saved.push(patch);
      const s = f.states.find((x) => x.user_id === userId);
      if (s) Object.assign(s, patch);
      return Promise.resolve();
    },
    upsertEvents: (_u, events) => {
      for (const e of events) {
        if (e.deleted) {
          const cur = f.events.get(e.external_id);
          if (cur) f.events.set(e.external_id, { ...cur, deleted: true, busy: false });
        } else f.events.set(e.external_id, e);
      }
      return Promise.resolve();
    },
    wipeEvents: () => {
      f.wiped++;
      for (const [k, v] of f.events) f.events.set(k, { ...v, deleted: true, busy: false });
      return Promise.resolve();
    },
    loadOpenRecs: (_u, from, to) =>
      Promise.resolve(
        f.recs.filter((r) =>
          ['shown', 'accepted', 'pinned', 'moved'].includes(r.status) && r.slot_end > from &&
          r.slot_start < to
        ),
      ),
    markDisplaced: (_u, ids) => {
      for (const r of f.recs) if (ids.includes(r.id)) r.status = 'displaced_pending';
      f.displaced.push(...ids);
      return Promise.resolve();
    },
    loadWriteBackRecs: () => Promise.resolve(f.recs as WriteBackRec[]),
    saveWriteBack: (_u, recId, patch) => {
      const r = f.recs.find((x) => x.id === recId);
      if (r) Object.assign(r, patch);
      return Promise.resolve();
    },
    loadStateByChannel: (channelId) =>
      Promise.resolve(f.states.find((s) => s.channel_id === channelId) ?? null),
    loadConnected: () => Promise.resolve(f.states.filter((s) => s.refresh_token !== null)),
    ...over,
  };
}

function push(headers: Record<string, string>): Request {
  return new Request('http://x/gcal-webhook', {
    method: 'POST',
    headers: {
      'x-goog-channel-id': 'ch1',
      'x-goog-channel-token': 'secret1',
      'x-goog-resource-id': 'res1',
      'x-goog-resource-state': 'exists',
      ...headers,
    },
    body: '',
  });
}

function sweep(key: string | null = KEY, body: unknown = { mode: 'sweep' }): Request {
  return new Request('http://x/gcal-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key === null ? {} : { 'x-service-key': key }),
    },
    body: JSON.stringify(body),
  });
}

Deno.test('auth: unknown channel 404, bad channel token 403, sweep without/with wrong key 401, wrong mode 400, GET 405', async () => {
  const f = fake();
  const d = deps(f);
  assertEquals((await handleGcalWebhook(push({ 'x-goog-channel-id': 'nope' }), d)).status, 404);
  assertEquals((await handleGcalWebhook(push({ 'x-goog-channel-token': 'wrong' }), d)).status, 403);
  assertEquals((await handleGcalWebhook(sweep(null), d)).status, 401);
  assertEquals((await handleGcalWebhook(sweep('wrong'), d)).status, 401);
  assertEquals((await handleGcalWebhook(sweep(KEY, { mode: 'x' }), d)).status, 400);
  assertEquals(
    (await handleGcalWebhook(new Request('http://x/gcal-webhook', { method: 'GET' }), d)).status,
    405,
  );
  assertEquals(f.listCalls.length, 0, 'nothing synced on rejected requests');
});

Deno.test('push "sync" (channel opened) is acknowledged without syncing', async () => {
  const f = fake();
  const res = await handleGcalWebhook(push({ 'x-goog-resource-state': 'sync' }), deps(f));
  assertEquals(res.status, 200);
  assertEquals(f.listCalls.length, 0);
});

Deno.test('push "exists": incremental list with the stored sync token → busy import → the overlapping open FUTURE block is displaced_pending; later and past blocks untouched', async () => {
  const f = fake();
  const res = await handleGcalWebhook(push({}), deps(f));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.synced, { events: 1, tombstones: 0, displaced: 1, full: false });
  assertEquals(f.listCalls[0].syncToken, 'tok1');
  assertEquals(f.listCalls[0].timeMin, undefined, 'no time filters with a sync token');
  assertEquals(f.events.get('meet1')?.busy, true);
  assertEquals(f.displaced, ['rec-9c1d']);
  assertEquals(f.recs.find((r) => r.id === 'rec-later')?.status, 'shown');
  assertEquals(f.recs.find((r) => r.id === 'rec-past')?.status, 'shown');
  const s = f.states[0];
  assertEquals(s.sync_token, 'tok2');
  assertEquals(s.last_synced_at, new Date(NOW).toISOString());
  assertEquals(s.last_error, null);
});

Deno.test('a transparent (free) meeting is imported but displaces nothing; a cancelled one becomes a tombstone', async () => {
  const f = fake({
    pages: [{
      items: [
        meeting({ transparency: 'transparent' }),
        meeting({ id: 'meet0', status: 'cancelled' }),
      ],
      nextSyncToken: 'tok2',
    }],
  });
  f.events.set('meet0', {
    external_id: 'meet0',
    start_at: '2026-09-01T06:00:00.000Z',
    end_at: '2026-09-01T07:00:00.000Z',
    title: 'old',
    busy: true,
    deleted: false,
  });
  const res = await handleGcalWebhook(push({}), deps(f));
  const body = await res.json();
  assertEquals(body.synced, { events: 1, tombstones: 1, displaced: 0, full: false });
  assertEquals(f.events.get('meet1')?.busy, false);
  assertEquals(f.events.get('meet0')?.deleted, true);
  assertEquals(f.displaced, []);
});

Deno.test('410 Gone → wipe the mirror and run a FULL sync (time window, no sync token); pagination is followed', async () => {
  const f = fake({
    pages: [
      'gone',
      { items: [meeting()], nextPageToken: 'p2', timeZone: 'Europe/Kyiv' },
      { items: [meeting({ id: 'meet2' })], nextSyncToken: 'tokFull' },
    ],
  });
  const res = await handleGcalWebhook(push({}), deps(f));
  const body = await res.json();
  assertEquals(body.synced.full, true);
  assertEquals(body.synced.events, 2);
  assertEquals(f.wiped, 1);
  assertEquals(f.listCalls[0].syncToken, 'tok1');
  assertEquals(f.listCalls[1].syncToken, undefined);
  assert(typeof f.listCalls[1].timeMin === 'string' && typeof f.listCalls[1].timeMax === 'string');
  assertEquals(f.listCalls[2].pageToken, 'p2');
  assertEquals(f.states[0].sync_token, 'tokFull');
});

Deno.test('an expired access token is refreshed before the API call and the new one is saved', async () => {
  const f = fake({ states: [state({ access_token_expires_at: new Date(NOW - 1).toISOString() })] });
  await handleGcalWebhook(push({}), deps(f));
  assertEquals(f.refreshed, 1);
  assertEquals(f.states[0].access_token, 'at2');
  assert(f.saved.some((p) => p.access_token === 'at2'));
});

Deno.test('a Google failure on the push path answers 200 (no retry storm) and records last_error', async () => {
  const f = fake({ listError: new Error('events.list: HTTP 500 boom') });
  const res = await handleGcalWebhook(push({}), deps(f));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, false);
  assertEquals(f.states[0].last_error, 'events.list: HTTP 500 boom');
});

Deno.test('sweep: stale users are synced, fresh ones are not; channels with < 24 h left are renewed (stop old, watch new)', async () => {
  const stale = state({
    user_id: USER,
    last_synced_at: new Date(NOW - 6 * 60_000).toISOString(),
    channel_expires_at: new Date(NOW + 3_600_000).toISOString(), // 1 h left → renew
  });
  const fresh = state({
    user_id: '00000000-0000-4000-8000-000000000002',
    channel_id: 'ch2',
    last_synced_at: new Date(NOW - 60_000).toISOString(),
  });
  const f = fake({ states: [stale, fresh], pages: [{ items: [], nextSyncToken: 'tok3' }] });
  const res = await handleGcalWebhook(sweep(), deps(f));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.users, 2);
  assertEquals(body.synced, 1);
  assertEquals(body.renewed, 1);
  assertEquals(f.stopped, [{ channelId: 'ch1', resourceId: 'res1' }]);
  assertEquals(f.watched.length, 1);
  assertEquals(f.watched[0].address, CFG.webhookAddress);
  assertEquals(stale.channel_id, f.watched[0].channelId);
  assertEquals(stale.channel_token, f.watched[0].token);
  assertEquals(stale.resource_id, `res-${f.watched[0].channelId}`);
  assertEquals(f.listCalls.length, 1, 'only the stale user listed');
});

Deno.test('sweep without Google credentials is skipped; a per-user error is contained and recorded', async () => {
  const f = fake();
  const skipped = await handleGcalWebhook(sweep(), deps(f, { config: null }));
  assertEquals((await skipped.json()).skipped, 'not_configured');
  const g = fake({
    states: [state({ last_synced_at: null })],
    listError: new Error('events.list: HTTP 403 quota'),
  });
  const res = await handleGcalWebhook(sweep(), deps(g));
  const body = await res.json();
  assertEquals(body.errors, 1);
  assertEquals(g.states[0].last_error, 'events.list: HTTP 403 quota');
});

Deno.test('write-back (opt-in, write scope): open blocks get inserted, a moved block is patched, a closed block deletes its event; read scope does nothing', async () => {
  const f = fake({
    states: [state({ scope: 'write', write_back: true })],
    pages: [{ items: [], nextSyncToken: 'tok2' }],
  });
  f.recs = [
    {
      ...f.recs[1],
      id: 'rec-new',
      status: 'shown',
      gcal_event_id: null,
      gcal_synced_slot_start: null,
    },
    {
      ...f.recs[1],
      id: 'rec-moved',
      status: 'moved',
      gcal_event_id: 'gev-old',
      gcal_synced_slot_start: '2026-09-01T09:00:00.000Z',
    },
    {
      ...f.recs[1],
      id: 'rec-closed',
      status: 'rejected',
      gcal_event_id: 'gev-closed',
      gcal_synced_slot_start: f.recs[1].slot_start,
    },
    {
      ...f.recs[1],
      id: 'rec-steady',
      status: 'accepted',
      gcal_event_id: 'gev-steady',
      gcal_synced_slot_start: f.recs[1].slot_start,
    },
  ];
  const res = await handleGcalWebhook(push({}), deps(f));
  const body = await res.json();
  assertEquals(body.write_back, { inserted: 1, patched: 1, deleted: 1 });
  assertEquals(f.inserted[0].summary, 'Hourwell · Reading');
  assertEquals(f.inserted[0].recommendationId, 'rec-new');
  assertEquals(f.recs.find((r) => r.id === 'rec-new')?.gcal_event_id, 'gev-rec-new');
  assertEquals(f.patched[0].eventId, 'gev-old');
  assertEquals(f.deleted, ['gev-closed']);
  assertEquals(f.recs.find((r) => r.id === 'rec-closed')?.gcal_event_id, null);

  const g = fake({ states: [state({ scope: 'read', write_back: true })] });
  const res2 = await handleGcalWebhook(push({}), deps(g));
  assertEquals((await res2.json()).write_back, { inserted: 0, patched: 0, deleted: 0 });
});
