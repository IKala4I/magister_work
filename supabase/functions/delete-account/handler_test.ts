/** `delete-account` with injected deps: the three modes, the audited order, Google teardown. */
import { assert, assertEquals } from '@std/assert';
import type { GcalState } from '../_shared/gcal_sync.ts';
import { type Deps, handleDeleteAccount, RETENTION_BATCH } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-09-05T03:10:00Z');

interface Fake {
  log: string[];
  audits: { id: string; user_hash: string; reason: string; completed_at: string | null }[];
  deleted: string[];
  revoked: string[];
  gcal: GcalState | null;
  candidates: string[];
  failDelete: Set<string>;
}

function fake(over: Partial<Fake> = {}): Fake {
  return {
    log: [],
    audits: [],
    deleted: [],
    revoked: [],
    gcal: null,
    candidates: [],
    failDelete: new Set(),
    ...over,
  };
}

function gcalState(): GcalState {
  return {
    user_id: USER,
    calendar_id: 'primary',
    refresh_token: 'rt',
    access_token: 'at',
    access_token_expires_at: new Date(NOW + 3_600_000).toISOString(),
    sync_token: null,
    channel_id: 'ch',
    resource_id: 'res',
    channel_token: 'tok',
    channel_expires_at: null,
    scope: 'read',
    write_back: false,
    last_synced_at: null,
    last_error: null,
    connected_at: new Date(NOW).toISOString(),
    confirmed_at: new Date(NOW).toISOString(),
    confirm_token: null,
    confirm_token_expires_at: null,
    oauth_state: null,
    oauth_state_expires_at: null,
    timezone: 'Europe/Kyiv',
  } as unknown as GcalState;
}

function deps(f: Fake, over: Partial<Deps> = {}): Deps {
  let n = 0;
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    verifyServiceKey: (k) => k === 'svc',
    hashUser: (u) => Promise.resolve(`h(${u})`),
    userExists: (u) => Promise.resolve(u === USER || u === OTHER),
    loadGcalState: (u) => Promise.resolve(u === USER ? f.gcal : null),
    gcalSync: {
      now: () => NOW,
      config: { clientId: 'c', clientSecret: 's', redirectUri: 'r', webhookAddress: 'w' },
      google: {
        refreshAccessToken: () => Promise.resolve({ access_token: 'at2', expires_in: 3600 }),
        listEvents: () => Promise.resolve({ items: [] }),
        watchEvents: () => Promise.resolve({ resourceId: 'r', expiration: 0 }),
        stopChannel: () => {
          f.log.push('stopChannel');
          return Promise.resolve();
        },
        insertEvent: () => Promise.resolve('e'),
        patchEvent: () => Promise.resolve(),
        deleteEvent: () => Promise.resolve(),
      },
      saveState: () => Promise.resolve(),
      upsertEvents: () => Promise.resolve(),
      wipeEvents: () => Promise.resolve(),
      loadOpenRecs: () => Promise.resolve([]),
      markDisplaced: () => Promise.resolve(),
      loadWriteBackRecs: () => Promise.resolve([]),
      loadWriteBackMirrored: () => Promise.resolve([]),
      saveWriteBack: () => Promise.resolve(),
      randomId: () => 'id',
    },
    revokeToken: (t) => {
      f.revoked.push(t);
      f.log.push('revoke');
      return Promise.resolve(true);
    },
    insertAudit: (row) => {
      const id = `audit-${++n}`;
      f.audits.push({ id, ...row, completed_at: null });
      f.log.push(`audit:${row.reason}`);
      return Promise.resolve(id);
    },
    completeAudit: (id) => {
      const a = f.audits.find((x) => x.id === id)!;
      a.completed_at = new Date(NOW).toISOString();
      f.log.push('complete');
      return Promise.resolve(a.completed_at);
    },
    deleteUser: (u) => {
      if (f.failDelete.has(u)) return Promise.reject(new Error('boom'));
      f.deleted.push(u);
      f.log.push('delete');
      return Promise.resolve();
    },
    purgeCandidates: (_now, days, limit) => {
      f.log.push(`candidates:${days}:${limit}`);
      return Promise.resolve(f.candidates.map((user_id) => ({ user_id })));
    },
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://x/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test('self: needs a bearer token', async () => {
  const f = fake();
  const res = await handleDeleteAccount(post({}), deps(f));
  assertEquals(res.status, 401);
  assertEquals(f.deleted, []);
  assertEquals(f.audits, []);
});

Deno.test('self: audit row → delete → completed; the response carries the reference only', async () => {
  const f = fake();
  const res = await handleDeleteAccount(post({}, { authorization: 'Bearer good' }), deps(f));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, 'deleted');
  assertEquals(body.reference, 'audit-1');
  assertEquals(body.completed_at, new Date(NOW).toISOString());
  assertEquals(JSON.stringify(body).includes(USER), false);
  assertEquals(f.deleted, [USER]);
  assertEquals(f.audits[0].user_hash, `h(${USER})`);
  assertEquals(f.audits[0].reason, 'user_request');
  assertEquals(f.log, ['audit:user_request', 'delete', 'complete']);
});

Deno.test('self: a connected Google calendar is torn down first (channel, token), then erased', async () => {
  const f = fake({ gcal: gcalState() });
  const res = await handleDeleteAccount(post({}, { authorization: 'Bearer good' }), deps(f));
  assertEquals(res.status, 200);
  assertEquals(f.revoked, ['rt']);
  assertEquals(f.log, ['stopChannel', 'revoke', 'audit:user_request', 'delete', 'complete']);
});

Deno.test('self: Google not configured on this deployment → no teardown attempted, erasure proceeds', async () => {
  const f = fake({ gcal: gcalState() });
  const res = await handleDeleteAccount(
    post({}, { authorization: 'Bearer good' }),
    deps(f, { gcalSync: null }),
  );
  assertEquals(res.status, 200);
  assertEquals(f.revoked, []);
  assertEquals(f.deleted, [USER]);
});

Deno.test('self: a failing Google teardown does not block the erasure', async () => {
  const f = fake({ gcal: gcalState() });
  const res = await handleDeleteAccount(
    post({}, { authorization: 'Bearer good' }),
    deps(f, { revokeToken: () => Promise.reject(new Error('google down')) }),
  );
  assertEquals(res.status, 200);
  assertEquals(f.deleted, [USER]);
  assertEquals(f.audits[0].completed_at !== null, true);
});

Deno.test('self: a failing delete leaves the audit row open (requested, not completed)', async () => {
  const f = fake({ failDelete: new Set([USER]) });
  let threw = false;
  try {
    await handleDeleteAccount(post({}, { authorization: 'Bearer good' }), deps(f));
  } catch {
    threw = true;
  }
  assert(threw);
  assertEquals(f.audits.length, 1);
  assertEquals(f.audits[0].completed_at, null);
});

Deno.test('self: a JWT whose account is already gone is 401 — no second audit row (FR-42, live-smoke finding)', async () => {
  const f = fake();
  const res = await handleDeleteAccount(
    post({}, { authorization: 'Bearer good' }),
    deps(f, { userExists: () => Promise.resolve(false) }),
  );
  assertEquals(res.status, 401);
  assertEquals(f.audits, []);
  assertEquals(f.deleted, []);
});

Deno.test('self: a failing audit stamp AFTER the delete still answers deleted (the device must not be stranded)', async () => {
  const f = fake();
  const res = await handleDeleteAccount(
    post({}, { authorization: 'Bearer good' }),
    deps(f, { completeAudit: () => Promise.reject(new Error('db hiccup')) }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, 'deleted');
  assertEquals(body.reference, 'audit-1');
  assertEquals(f.deleted, [USER]);
  assertEquals(f.audits[0].completed_at, null); // the evidence that the stamp failed
});

Deno.test('operator: backend key required; user_id validated; unknown user is 404 without an audit row', async () => {
  const f = fake();
  assertEquals(
    (await handleDeleteAccount(post({ mode: 'operator', user_id: USER }), deps(f))).status,
    401,
  );
  assertEquals(
    (await handleDeleteAccount(post({ mode: 'operator' }, { 'x-service-key': 'svc' }), deps(f)))
      .status,
    400,
  );
  assertEquals(
    (await handleDeleteAccount(
      post({ mode: 'operator', user_id: 'not-a-uuid' }, { 'x-service-key': 'svc' }),
      deps(f),
    )).status,
    400,
  );
  const missing = await handleDeleteAccount(
    post({ mode: 'operator', user_id: '00000000-0000-4000-8000-0000000000ff' }, {
      'x-service-key': 'svc',
    }),
    deps(f),
  );
  assertEquals(missing.status, 404);
  assertEquals(f.audits, []);
  assertEquals(f.deleted, []);
});

Deno.test('operator: erases the named user with reason operator', async () => {
  const f = fake();
  const res = await handleDeleteAccount(
    post({ mode: 'operator', user_id: OTHER }, { 'x-service-key': 'svc' }),
    deps(f),
  );
  assertEquals(res.status, 200);
  assertEquals(f.deleted, [OTHER]);
  assertEquals(f.audits[0].reason, 'operator');
  assertEquals(f.audits[0].user_hash, `h(${OTHER})`);
});

Deno.test('retention: backend key required; erases every candidate through the same path; one failure never stops the sweep', async () => {
  const f = fake({ candidates: [USER, OTHER, '00000000-0000-4000-8000-000000000003'] });
  f.failDelete.add(OTHER);
  assertEquals((await handleDeleteAccount(post({ mode: 'retention' }), deps(f))).status, 401);
  const res = await handleDeleteAccount(
    post({ mode: 'retention' }, { 'x-service-key': 'svc' }),
    deps(f),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, 'swept');
  assertEquals(body.deleted, 2);
  assertEquals(body.failed, 1);
  assertEquals(body.references, ['audit-1', 'audit-3']);
  assertEquals(f.deleted, [USER, '00000000-0000-4000-8000-000000000003']);
  assertEquals(f.audits.map((a) => a.reason), [
    'anonymous_retention',
    'anonymous_retention',
    'anonymous_retention',
  ]);
  assertEquals(f.log[0], `candidates:30:${RETENTION_BATCH}`);
});

Deno.test('retention: nothing to do is a swept 0', async () => {
  const f = fake();
  const res = await handleDeleteAccount(
    post({ mode: 'retention' }, { 'x-service-key': 'svc' }),
    deps(f),
  );
  assertEquals(await res.json(), { status: 'swept', deleted: 0, failed: 0, references: [] });
});

Deno.test('bad mode / bad JSON / wrong method', async () => {
  const f = fake();
  assertEquals((await handleDeleteAccount(post({ mode: 'all' }), deps(f))).status, 400);
  const badJson = new Request('https://x/delete-account', {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
    body: '{',
  });
  assertEquals((await handleDeleteAccount(badJson, deps(f))).status, 400);
  const get = new Request('https://x/delete-account', {
    method: 'GET',
    headers: { authorization: 'Bearer good' },
  });
  assertEquals((await handleDeleteAccount(get, deps(f))).status, 405);
  assertEquals(f.deleted, []);
});
