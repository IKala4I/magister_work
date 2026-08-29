/**
 * `gcal-callback` with injected deps: the one-shot nonce (unknown / expired / replayed), the
 * user-denied branch, the code exchange (server-side; failures bounce to the app), token
 * storage, scope resolution (incremental write keeps read, asking for write opts into the
 * write-back), the initial sync, and the redirect back to the app.
 */
import { assertEquals } from '@std/assert';
import type { GcalState } from '../_shared/gcal_sync.ts';
import { decodeState, type Deps, handleGcalCallback } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-01T10:00:00Z');
const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://fn/gcal-callback',
  webhookAddress: 'https://fn/gcal-webhook',
};
const APP = 'hourwell://gcal-callback';

function pending(over: Partial<GcalState> = {}): GcalState {
  return {
    user_id: USER,
    calendar_id: 'primary',
    refresh_token: null,
    access_token: null,
    access_token_expires_at: null,
    sync_token: null,
    channel_id: null,
    resource_id: null,
    channel_token: null,
    channel_expires_at: null,
    scope: 'read',
    write_back: false,
    last_synced_at: null,
    last_error: null,
    connected_at: null,
    confirmed_at: null,
    confirm_token: null,
    confirm_token_expires_at: null,
    oauth_state: 'nonce-1',
    oauth_state_expires_at: new Date(NOW + 60_000).toISOString(),
    timezone: 'Europe/Kyiv',
    ...over,
  };
}

interface Fake {
  state: GcalState | null;
  saved: Array<Partial<GcalState>>;
  exchanged: string[];
  exchangeError: Error | null;
  tokens: { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

function fake(over: Partial<Fake> = {}): Fake {
  return {
    state: pending(),
    saved: [],
    exchanged: [],
    exchangeError: null,
    tokens: {
      access_token: 'at',
      expires_in: 3600,
      refresh_token: 'rt',
      scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    },
    ...over,
  };
}

function deps(f: Fake, over: Partial<Deps> = {}): Deps {
  return {
    now: () => NOW,
    config: CFG,
    appRedirect: APP,
    randomId: () => 'confirm-1',
    saveState: (_u, patch) => {
      f.saved.push(patch);
      if (f.state) Object.assign(f.state, patch);
      return Promise.resolve();
    },
    loadStateByNonce: (nonce) =>
      Promise.resolve(f.state !== null && f.state.oauth_state === nonce ? f.state : null),
    exchangeCode: (_cfg, code) => {
      f.exchanged.push(code);
      return f.exchangeError ? Promise.reject(f.exchangeError) : Promise.resolve(f.tokens);
    },
    ...over,
  };
}

function get(query: Record<string, string>): Request {
  const u = new URL('https://fn/gcal-callback');
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return new Request(u.toString(), { method: 'GET' });
}

function landing(res: Response): { status: string | null; params: URLSearchParams } {
  assertEquals(res.status, 302);
  const u = new URL(res.headers.get('location') ?? '');
  assertEquals(u.protocol + '//' + u.host + u.pathname, `${APP}`);
  return { status: u.searchParams.get('status'), params: u.searchParams };
}

Deno.test('decodeState — <nonce>.<scope>', () => {
  assertEquals(decodeState('abc.read'), { nonce: 'abc', scope: 'read' });
  assertEquals(decodeState('a.b.write'), { nonce: 'a.b', scope: 'write' });
  assertEquals(decodeState('abc'), null);
  assertEquals(decodeState('abc.all'), null);
  assertEquals(decodeState(null), null);
});

Deno.test('invalid / unknown / expired / replayed state bounce to the app; the nonce is one-shot', async () => {
  const f = fake();
  const d = deps(f);
  assertEquals(landing(await handleGcalCallback(get({ code: 'c' }), d)).status, 'invalid_state');
  assertEquals(
    landing(await handleGcalCallback(get({ code: 'c', state: 'other.read' }), d)).status,
    'invalid_state',
  );
  const expired = fake({
    state: pending({ oauth_state_expires_at: new Date(NOW - 1).toISOString() }),
  });
  const e = await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(expired));
  assertEquals(landing(e).status, 'expired_state');
  assertEquals(expired.state?.oauth_state, null, 'nonce cleared even on failure');
  assertEquals(expired.exchanged.length, 0);
  // replay of a consumed nonce
  const r = await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(expired));
  assertEquals(landing(r).status, 'invalid_state');
  assertEquals(
    (await handleGcalCallback(new Request('https://fn/gcal-callback', { method: 'POST' }), d))
      .status,
    405,
  );
});

Deno.test('the user denied consent → denied (no exchange)', async () => {
  const f = fake();
  const res = await handleGcalCallback(
    get({ error: 'access_denied', state: 'nonce-1.read' }),
    deps(f),
  );
  assertEquals(landing(res).status, 'denied');
  assertEquals(f.exchanged, []);
});

Deno.test('happy path: code exchanged server-side, tokens stored UNCONFIRMED with a one-shot confirm token that only the redirect carries', async () => {
  const f = fake();
  const res = await handleGcalCallback(get({ code: 'the-code', state: 'nonce-1.read' }), deps(f));
  const l = landing(res);
  assertEquals(l.status, 'ok');
  assertEquals(l.params.get('scope'), 'read');
  assertEquals(l.params.get('confirm'), 'confirm-1');
  assertEquals(f.exchanged, ['the-code']);
  const s = f.state!;
  assertEquals(s.refresh_token, 'rt');
  assertEquals(s.access_token, 'at');
  assertEquals(s.access_token_expires_at, new Date(NOW + 3_600_000).toISOString());
  assertEquals(s.scope, 'read');
  assertEquals(s.write_back, false);
  assertEquals(s.confirmed_at, null, 'not connected until the device confirms (adversarial #10)');
  assertEquals(s.confirm_token, 'confirm-1');
  assertEquals(s.confirm_token_expires_at, new Date(NOW + 10 * 60_000).toISOString());
  assertEquals(s.oauth_state, null);
});

Deno.test('asking for the write scope opts into the write-back; a later read-only consent never downgrades', async () => {
  const f = fake({
    tokens: {
      access_token: 'at',
      expires_in: 3600,
      refresh_token: 'rt2',
      scope:
        'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events',
    },
  });
  const res = await handleGcalCallback(get({ code: 'c', state: 'nonce-1.write' }), deps(f));
  assertEquals(landing(res).params.get('scope'), 'write');
  assertEquals(f.state?.scope, 'write');
  assertEquals(f.state?.write_back, true);
  const g = fake({
    state: pending({
      scope: 'write',
      write_back: true,
      refresh_token: 'old',
      connected_at: 'c0',
      confirmed_at: 'c0',
    }),
  });
  await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(g));
  assertEquals(g.state?.scope, 'write', 'incremental authorization keeps the wider scope');
  assertEquals(g.state?.write_back, true);
  assertEquals(g.state?.connected_at, 'c0', 'first connection time kept');
  assertEquals(g.state?.confirmed_at, 'c0', 'an already confirmed connection stays live meanwhile');
});

Deno.test('no refresh token in the exchange and none stored → no_refresh_token; an existing one is kept', async () => {
  const f = fake({ tokens: { access_token: 'at', expires_in: 3600 } });
  const res = await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(f));
  assertEquals(landing(res).status, 'no_refresh_token');
  const g = fake({
    state: pending({ refresh_token: 'kept' }),
    tokens: { access_token: 'at', expires_in: 3600 },
  });
  const ok = await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(g));
  assertEquals(landing(ok).status, 'ok');
  assertEquals(g.state?.refresh_token, 'kept');
});

Deno.test('exchange failure → exchange_failed (nothing stored)', async () => {
  const f = fake({ exchangeError: new Error('token exchange: HTTP 400 invalid_grant') });
  assertEquals(
    landing(await handleGcalCallback(get({ code: 'c', state: 'nonce-1.read' }), deps(f))).status,
    'exchange_failed',
  );
  assertEquals(f.state?.refresh_token, null);
});

Deno.test('without Google credentials the callback bounces with not_configured', async () => {
  const res = await handleGcalCallback(
    get({ code: 'c', state: 'nonce-1.read' }),
    deps(fake(), { config: null }),
  );
  assertEquals(landing(res).status, 'not_configured');
});
