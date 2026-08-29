/**
 * Pure half of the Google Calendar module: the consent URL, scope resolution, the event → row
 * mapping (busy rule, all-day handling, cancellations, our own marker), overlap, the write-back
 * window.
 */
import { assert, assertEquals } from '@std/assert';
import {
  authUrl,
  GCAL_SCOPES,
  type GoogleEvent,
  HOURWELL_MARKER,
  mapGoogleEvent,
  overlaps,
  scopeKeyOf,
} from './gcal.ts';
import { writeBackSummary, writeBackWindow } from './gcal_sync.ts';

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://x.functions.supabase.co/gcal-callback',
  webhookAddress: 'https://x.functions.supabase.co/gcal-webhook',
};

Deno.test('authUrl — offline access, forced consent, incremental scopes, state', () => {
  const u = new URL(authUrl(CFG, { state: 'n.read', scope: 'read' }));
  assertEquals(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assertEquals(u.searchParams.get('client_id'), 'cid');
  assertEquals(u.searchParams.get('redirect_uri'), CFG.redirectUri);
  assertEquals(u.searchParams.get('response_type'), 'code');
  assertEquals(u.searchParams.get('scope'), GCAL_SCOPES.read);
  assertEquals(u.searchParams.get('access_type'), 'offline');
  assertEquals(u.searchParams.get('prompt'), 'consent');
  assertEquals(u.searchParams.get('include_granted_scopes'), 'true');
  assertEquals(u.searchParams.get('state'), 'n.read');
  const w = new URL(authUrl(CFG, { state: 'n.write', scope: 'write' }));
  assertEquals(w.searchParams.get('scope'), GCAL_SCOPES.write);
});

Deno.test('scopeKeyOf — write beats read; unrelated scopes are null', () => {
  assertEquals(scopeKeyOf(`${GCAL_SCOPES.read} ${GCAL_SCOPES.write}`), 'write');
  assertEquals(scopeKeyOf(GCAL_SCOPES.read), 'read');
  assertEquals(scopeKeyOf('openid email'), null);
  assertEquals(scopeKeyOf(undefined), null);
});

const timed = (over: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: 'evt1',
  status: 'confirmed',
  summary: 'Standup',
  start: { dateTime: '2026-09-01T14:00:00+03:00' },
  end: { dateTime: '2026-09-01T15:00:00+03:00' },
  ...over,
});

Deno.test('mapGoogleEvent — a timed opaque event is busy with UTC instants and its title', () => {
  const m = mapGoogleEvent(timed(), 'Europe/Kyiv');
  assert(m !== null);
  assertEquals(m, {
    external_id: 'evt1',
    start_at: '2026-09-01T11:00:00.000Z',
    end_at: '2026-09-01T12:00:00.000Z',
    title: 'Standup',
    busy: true,
    deleted: false,
  });
});

Deno.test('mapGoogleEvent — transparent, declined, working-location and birthday events are not busy', () => {
  assertEquals(mapGoogleEvent(timed({ transparency: 'transparent' }), 'UTC')?.busy, false);
  assertEquals(
    mapGoogleEvent(
      timed({ attendees: [{ self: true, responseStatus: 'declined' }] }),
      'UTC',
    )?.busy,
    false,
  );
  assertEquals(
    mapGoogleEvent(timed({ attendees: [{ self: true, responseStatus: 'accepted' }] }), 'UTC')
      ?.busy,
    true,
  );
  assertEquals(mapGoogleEvent(timed({ eventType: 'workingLocation' }), 'UTC')?.busy, false);
  assertEquals(mapGoogleEvent(timed({ eventType: 'birthday' }), 'UTC')?.busy, false);
  assertEquals(mapGoogleEvent(timed({ eventType: 'outOfOffice' }), 'UTC')?.busy, true);
});

Deno.test('mapGoogleEvent — cancelled instances are tombstones; our own write-back events and id-less items are skipped', () => {
  const gone = mapGoogleEvent({ id: 'evt9', status: 'cancelled' }, 'UTC');
  assertEquals(gone?.deleted, true);
  assertEquals(gone?.external_id, 'evt9');
  assertEquals(gone?.busy, false);
  assertEquals(
    mapGoogleEvent(
      timed({ extendedProperties: { private: { [HOURWELL_MARKER]: 'rec-1' } } }),
      'UTC',
    ),
    null,
  );
  assertEquals(mapGoogleEvent(timed({ id: undefined }), 'UTC'), null);
  assertEquals(
    mapGoogleEvent(timed({ end: { dateTime: '2026-09-01T13:00:00+03:00' } }), 'UTC'),
    null,
  );
  assertEquals(mapGoogleEvent({ id: 'x', start: {}, end: {} }, 'UTC'), null);
});

Deno.test('mapGoogleEvent — all-day events: opaque spans the local day (exclusive end), free (Google default) is skipped', () => {
  const busyDay = mapGoogleEvent(
    { id: 'd1', summary: 'Offsite', start: { date: '2026-09-01' }, end: { date: '2026-09-02' } },
    'Europe/Kyiv',
  );
  assertEquals(busyDay, {
    external_id: 'd1',
    start_at: '2026-08-31T21:00:00.000Z',
    end_at: '2026-09-01T21:00:00.000Z',
    title: 'Offsite',
    busy: true,
    deleted: false,
  });
  assertEquals(
    mapGoogleEvent(
      {
        id: 'd2',
        start: { date: '2026-09-01' },
        end: { date: '2026-09-02' },
        transparency: 'transparent',
      },
      'Europe/Kyiv',
    ),
    null,
  );
  // the event's own zone wins over the calendar zone
  const la = mapGoogleEvent(
    {
      id: 'd3',
      start: { date: '2026-09-01', timeZone: 'America/Los_Angeles' },
      end: { date: '2026-09-02', timeZone: 'America/Los_Angeles' },
    },
    'Europe/Kyiv',
  );
  assertEquals(la?.start_at, '2026-09-01T07:00:00.000Z');
});

Deno.test('mapGoogleEvent — titles are display-only and capped at 200 chars; empty titles are null', () => {
  const long = mapGoogleEvent(timed({ summary: 'x'.repeat(500) }), 'UTC');
  assertEquals(long?.title?.length, 200);
  assertEquals(mapGoogleEvent(timed({ summary: '' }), 'UTC')?.title, null);
  assertEquals(mapGoogleEvent(timed({ summary: undefined }), 'UTC')?.title, null);
});

Deno.test('overlaps — half-open intervals', () => {
  assertEquals(overlaps(0, 10, 10, 20), false);
  assertEquals(overlaps(0, 10, 9, 20), true);
  assertEquals(overlaps(5, 6, 0, 10), true);
  assertEquals(overlaps(20, 30, 0, 10), false);
});

Deno.test('writeBackWindow — local midnight of the plan day to the end of the next day (+ DST slack)', () => {
  const w = writeBackWindow(Date.parse('2026-09-01T10:00:00+03:00'), 'Europe/Kyiv');
  assertEquals(w.fromIso, '2026-08-31T21:00:00.000Z');
  assertEquals(w.toIso, '2026-09-03T00:00:00.000Z');
  assertEquals(writeBackSummary('Slides'), 'Hourwell · Slides');
});
