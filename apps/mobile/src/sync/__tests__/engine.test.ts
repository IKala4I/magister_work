/**
 * The sync engine on real SQLite with a faked `sync-resolve` (ADR-0012 §1/§3/§4/§6): push acks
 * (applied / duplicate / superseded), the conflict round trip (merge → rewritten op → replayed
 * with the server's version → applied), dead-lettering (rejected at once, error after 5
 * attempts), the pull + cursor, offline / busy / no-session outcomes, and the pre-plan skip.
 */
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
  };
});
// the factory runs when the module is first required — only requires can build the real DB here
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('../../db/client', () => {
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  const path = require('node:path');
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return { db, sqlite };
});
/* eslint-enable @typescript-eslint/no-require-imports */
const mockGetSession = jest.fn();
jest.mock('../../auth/client', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
  isAuthAvailable: () => true,
}));
const mockInvoke = jest.fn();
jest.mock('../invoke', () => ({
  invokeFunction: (...a: unknown[]) => mockInvoke(...a),
  FUNCTIONS_REGION: 'eu-west-1',
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: jest.fn() }),
}));
jest.mock('../../observability/analytics', () => ({ track: jest.fn() }));
const mockBreadcrumb = jest.fn();
jest.mock('../../observability/sentry', () => ({
  Sentry: { addBreadcrumb: (...a: unknown[]) => mockBreadcrumb(...a) },
}));

import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { opOutbox, tasks } from '../../db/schema';
import { createTask, updateTask, type TaskDraft } from '../../db/tasks';
import type { LocalDb } from '../../db/writes';
import { useSyncStore } from '../../state/sync';
import { appStorage, StorageKeys } from '../../storage/mmkv';
import { getSyncCursor } from '../cursor';
import { MAX_ATTEMPTS, pendingOpCount, syncBeforePlan, syncNow } from '../engine';
import type { SyncRequestBody, SyncResponse } from '../types';

const USER = 'a0000000-0000-4000-8000-000000000001';
const localDb = db as unknown as LocalDb;

const DRAFT: TaskDraft = {
  title: 'write report',
  category: 'deep',
  estMinutes: 60,
  value: 2,
  splittable: false,
  deadline: null,
  earliestStart: null,
};

function response(over: Partial<SyncResponse> = {}): SyncResponse {
  return {
    acks: [],
    rewards: null,
    pull: [],
    cursor: 0,
    has_more: false,
    server_now: '2026-09-01T12:00:00.000Z',
    ...over,
  };
}

function ok(body: Partial<SyncResponse>) {
  return { kind: 'ok', data: response(body) };
}

function sentBody(call: number): SyncRequestBody {
  return mockInvoke.mock.calls[call]?.[1] as SyncRequestBody;
}

beforeEach(() => {
  localDb.delete(opOutbox).run();
  localDb.delete(tasks).run();
  appStorage.clearAll();
  mockInvoke.mockReset();
  mockBreadcrumb.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: USER } } } });
  useSyncStore.setState({ status: 'idle', lastSyncAt: null, pendingOps: 0, notice: null });
});

describe('syncNow — push', () => {
  it('pushes unacked ops in seq order to sync-resolve and acks applied/duplicate/superseded', async () => {
    const t = createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    const ops = localDb.select().from(opOutbox).all();
    expect(ops).toHaveLength(2); // task_upsert + task_created event
    mockInvoke.mockResolvedValueOnce(
      ok({
        acks: [
          { op_id: ops[0]!.opId, outcome: 'applied', version: 1, server_seq: 5 },
          { op_id: ops[1]!.opId, outcome: 'duplicate' },
        ],
        cursor: 5,
      }),
    );
    const out = await syncNow('manual');
    expect(out).toEqual({ kind: 'synced', pushed: 2, pulled: 0, conflicts: 0, rounds: 1 });
    const body = sentBody(0);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe('sync-resolve');
    expect(body.ops.map((o) => o.op_type)).toEqual(['task_upsert', 'event_append']);
    expect(body.ops[0]?.payload).toMatchObject({ id: t.id, user_id: USER, title: 'write report' });
    expect(body.cursor).toBe(0);
    expect(body.reason).toBe('manual');
    for (const op of localDb.select().from(opOutbox).all()) expect(op.ackedAt).not.toBeNull();
    expect(getSyncCursor()).toBe(5);
    expect(appStorage.getNumber(StorageKeys.lastSyncAt)).toBeDefined();
    expect(useSyncStore.getState()).toMatchObject({ status: 'idle', pendingOps: 0 });
  });

  it("does not push another identity's ops", async () => {
    createTask(localDb, {
      userId: 'someone-else',
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    mockInvoke.mockResolvedValueOnce(ok({}));
    await syncNow('manual');
    expect(sentBody(0).ops).toEqual([]);
    expect(pendingOpCount(localDb, USER)).toBe(0);
    expect(
      localDb
        .select()
        .from(opOutbox)
        .all()
        .every((o) => o.ackedAt === null),
    ).toBe(true);
  });
});

describe('syncNow — the conflict round trip (File 05 §2 409 + merge + replay)', () => {
  it('merges the server row, rewrites the op against the server version and replays it in the same sync', async () => {
    const t = createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
      now: new Date('2026-09-01T08:00:00Z'),
    });
    updateTask(localDb, {
      id: t.id,
      draft: { ...DRAFT, title: 'edited offline' },
      now: new Date('2026-09-01T10:00:00Z'),
    });
    const ops = localDb.select().from(opOutbox).all();
    const [createOp, eventOp, editOp] = ops;
    mockInvoke
      .mockResolvedValueOnce(
        ok({
          acks: [
            { op_id: createOp!.opId, outcome: 'duplicate' },
            { op_id: eventOp!.opId, outcome: 'duplicate' },
            {
              op_id: editOp!.opId,
              outcome: 'conflict',
              row: {
                id: t.id,
                user_id: USER,
                title: 'edited on the other phone',
                category: 'admin',
                est_minutes: 45,
                deadline: null,
                value: 3,
                splittable: false,
                earliest_start: null,
                recurrence: null,
                status: 'scheduled',
                done_at: null,
                postpone_count: 2,
                deleted_at: null,
                version: 4,
                created_at: '2026-09-01T08:00:00.000Z',
                updated_at: '2026-09-01T09:00:00.000Z',
              },
            },
          ],
          cursor: 9,
        }),
      )
      .mockResolvedValueOnce(
        ok({ acks: [{ op_id: editOp!.opId, outcome: 'applied', version: 5 }], cursor: 12 }),
      );
    const out = await syncNow('manual');
    expect(out).toEqual({ kind: 'synced', pushed: 3, pulled: 0, conflicts: 1, rounds: 2 });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const replayed = sentBody(1).ops;
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.op_id).toBe(editOp!.opId);
    expect(replayed[0]?.op_type).toBe('task_upsert');
    expect(replayed[0]?.base_version).toBe(4);
    expect(replayed[0]?.payload).toMatchObject({
      title: 'edited offline', // local edit (10:00) newer than the server edit (09:00)
      category: 'deep',
      postpone_count: 2, // monotone fact from the server
      status: 'inbox', // plan-mirror status follows the LWW winner (the local row)
      version: 5,
    });
    const row = localDb.select().from(tasks).where(eq(tasks.id, t.id)).get();
    expect(row).toMatchObject({ title: 'edited offline', version: 5, postponeCount: 2 });
    expect(
      localDb
        .select()
        .from(opOutbox)
        .all()
        .every((o) => o.ackedAt !== null),
    ).toBe(true);
    expect(getSyncCursor()).toBe(12);
  });

  it("collapses the entity's other queued ops into the merged one", async () => {
    const t = createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
      now: new Date('2026-09-01T08:00:00Z'),
    });
    updateTask(localDb, {
      id: t.id,
      draft: { ...DRAFT, title: 'edit 1' },
      now: new Date('2026-09-01T09:00:00Z'),
    });
    updateTask(localDb, {
      id: t.id,
      draft: { ...DRAFT, title: 'edit 2' },
      now: new Date('2026-09-01T10:00:00Z'),
    });
    const ops = localDb.select().from(opOutbox).all();
    const serverRow = {
      id: t.id,
      user_id: USER,
      title: 'server',
      category: 'deep',
      est_minutes: 60,
      deadline: null,
      value: 2,
      splittable: false,
      earliest_start: null,
      recurrence: null,
      status: 'inbox',
      done_at: null,
      postpone_count: 0,
      deleted_at: null,
      version: 7,
      created_at: '2026-09-01T08:00:00.000Z',
      updated_at: '2026-09-01T08:30:00.000Z',
    };
    mockInvoke
      .mockResolvedValueOnce(
        ok({
          acks: [
            { op_id: ops[0]!.opId, outcome: 'duplicate' },
            { op_id: ops[1]!.opId, outcome: 'duplicate' },
            { op_id: ops[2]!.opId, outcome: 'conflict', row: serverRow },
            { op_id: ops[3]!.opId, outcome: 'conflict', row: serverRow },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({ acks: [{ op_id: ops[2]!.opId, outcome: 'applied', version: 8 }] }),
      );
    await syncNow('manual');
    const replayed = sentBody(1).ops;
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.payload).toMatchObject({ title: 'edit 2', version: 8 });
    expect(replayed[0]?.base_version).toBe(7);
    const collapsed = localDb.select().from(opOutbox).where(eq(opOutbox.seq, ops[3]!.seq)).get();
    expect(collapsed?.ackedAt).not.toBeNull();
    expect(collapsed?.lastError).toContain('collapsed into');
  });
});

describe('syncNow — dead-lettering (a poison op never blocks the queue)', () => {
  it('a rejected op is dead-lettered at once with the reason and a breadcrumb', async () => {
    createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    const ops = localDb.select().from(opOutbox).all();
    mockInvoke.mockResolvedValueOnce(
      ok({
        acks: [
          { op_id: ops[0]!.opId, outcome: 'rejected', detail: 'foreign user_id' },
          { op_id: ops[1]!.opId, outcome: 'applied' },
        ],
      }),
    );
    await syncNow('manual');
    const dead = localDb.select().from(opOutbox).where(eq(opOutbox.seq, ops[0]!.seq)).get();
    expect(dead?.ackedAt).not.toBeNull();
    expect(dead?.lastError).toBe('dead-letter: foreign user_id');
    expect(mockBreadcrumb).toHaveBeenCalledTimes(1);
    expect(pendingOpCount(localDb, USER)).toBe(0);
  });

  it(`an erroring op is retried and dead-lettered after ${MAX_ATTEMPTS} attempts`, async () => {
    createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    const ops = localDb.select().from(opOutbox).all();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      mockInvoke.mockResolvedValueOnce(
        ok({
          acks: [
            { op_id: ops[0]!.opId, outcome: 'error', detail: 'boom', code: '23514' },
            { op_id: ops[1]!.opId, outcome: i === 0 ? 'applied' : 'duplicate' },
          ],
        }),
      );
      await syncNow('manual');
      const op = localDb.select().from(opOutbox).where(eq(opOutbox.seq, ops[0]!.seq)).get();
      expect(op?.attempts).toBe(i + 1);
      if (i < MAX_ATTEMPTS - 1) {
        expect(op?.ackedAt).toBeNull();
        expect(op?.lastError).toBe('boom');
      } else {
        expect(op?.ackedAt).not.toBeNull();
        expect(op?.lastError).toBe('dead-letter: boom');
      }
    }
    expect(mockInvoke).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});

describe('syncNow — pull, outcomes, pre-plan skip', () => {
  it('applies the pull page and advances the cursor; a full page triggers another round', async () => {
    const row = (seq: number, id: string) => ({
      server_seq: seq,
      tbl: 'tasks' as const,
      row: {
        id,
        user_id: USER,
        title: `pulled ${seq}`,
        category: 'admin',
        est_minutes: 30,
        deadline: null,
        value: 1,
        splittable: false,
        earliest_start: null,
        recurrence: null,
        status: 'inbox',
        done_at: null,
        postpone_count: 0,
        deleted_at: null,
        version: 1,
        created_at: '2026-09-01T06:00:00.000Z',
        updated_at: '2026-09-01T06:00:00.000Z',
        server_seq: seq,
      },
    });
    mockInvoke
      .mockResolvedValueOnce(
        ok({ pull: [row(1, 'a0000000-0000-4000-8000-0000000000a1')], cursor: 1, has_more: true }),
      )
      .mockResolvedValueOnce(
        ok({ pull: [row(2, 'a0000000-0000-4000-8000-0000000000a2')], cursor: 2 }),
      );
    const out = await syncNow('foreground');
    expect(out).toEqual({ kind: 'synced', pushed: 0, pulled: 2, conflicts: 0, rounds: 2 });
    expect(sentBody(1).cursor).toBe(1);
    expect(localDb.select().from(tasks).all()).toHaveLength(2);
    expect(getSyncCursor()).toBe(2);
  });

  it('offline leaves the queue intact and marks the store offline; busy and failures are reported', async () => {
    createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    mockInvoke.mockResolvedValueOnce({ kind: 'offline' });
    expect(await syncNow('write')).toEqual({ kind: 'offline' });
    expect(useSyncStore.getState()).toMatchObject({ status: 'offline', pendingOps: 2 });
    expect(pendingOpCount(localDb, USER)).toBe(2);
    mockInvoke.mockResolvedValueOnce({
      kind: 'http',
      status: 409,
      body: { error: 'busy' },
      message: 'x',
    });
    expect(await syncNow('write')).toEqual({ kind: 'busy' });
    mockInvoke.mockResolvedValueOnce({ kind: 'http', status: 500, body: null, message: 'boom' });
    expect((await syncNow('write')).kind).toBe('failed');
    expect(useSyncStore.getState().status).toBe('error');
  });

  it('no session → no network call', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await syncNow('manual')).toEqual({ kind: 'no-session' });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('no_session');
  });

  it('syncBeforePlan skips when nothing is pending and the last sync is fresh; syncs otherwise', async () => {
    appStorage.set(StorageKeys.lastSyncAt, Date.now());
    expect(await syncBeforePlan()).toEqual({ kind: 'skipped' });
    expect(mockInvoke).not.toHaveBeenCalled();
    createTask(localDb, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    mockInvoke.mockResolvedValueOnce(ok({}));
    expect((await syncBeforePlan()).kind).toBe('synced');
    expect(sentBody(0).reason).toBe('pre_plan');
  });

  it('coalesces a second caller into one follow-up round', async () => {
    let release: (v: unknown) => void = () => {};
    mockInvoke.mockImplementationOnce(() => new Promise((r) => (release = r)));
    mockInvoke.mockResolvedValueOnce(ok({}));
    const first = syncNow('manual');
    const second = syncNow('foreground');
    expect(second).toBe(first);
    await new Promise((r) => setTimeout(r, 0)); // the engine reaches invoke after the session read
    release(ok({}));
    await first;
    await new Promise((r) => setTimeout(r, 0));
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(sentBody(1).reason).toBe('foreground');
  });
});
