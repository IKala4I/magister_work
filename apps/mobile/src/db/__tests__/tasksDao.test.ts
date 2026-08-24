/**
 * Task write-path tests (FR-10, NFR-R1 local half) against a real SQLite database:
 * better-sqlite3 in memory, prepared with the SAME committed drizzle migration bundle
 * the device applies — so these tests break if the write path and the schema drift.
 * Pins: outbox op per mutation (offline-first by construction), server-shaped payloads,
 * base_version chain, task_created event (categorical only — never the title, NFR-S3),
 * soft-delete/restore as first-class idempotent ops, inbox query shape.
 */
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
  };
});

import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import {
  createTask,
  inboxTasksQuery,
  restoreTask,
  softDeleteTask,
  updateTask,
  type TaskDraft,
} from '../tasks';
import { events, opOutbox, tasks } from '../schema';
import type { LocalDb } from '../writes';

const USER = 'local:test-user';

const DRAFT: TaskDraft = {
  title: 'write report',
  category: 'deep',
  estMinutes: 120,
  value: 2,
  splittable: false,
  deadline: new Date(2026, 7, 28, 23, 59),
  earliestStart: null,
};

function openDb(): { db: LocalDb; close: () => void } {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return { db: db as unknown as LocalDb, close: () => sqlite.close() };
}

let handle: ReturnType<typeof openDb>;
let db: LocalDb;

beforeEach(() => {
  handle = openDb();
  db = handle.db;
});

afterEach(() => {
  handle.close();
});

describe('createTask (FR-10 + UC-02 postcondition)', () => {
  it('writes the row, one task_upsert op, and one task_created event atomically', () => {
    const now = new Date(2026, 7, 24, 10, 0);
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'quick_add', nlParseUsed: true },
      now,
    });

    const stored = db.select().from(tasks).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(row.id);
    expect(stored[0]?.status).toBe('inbox');
    expect(stored[0]?.version).toBe(1);

    const ops = db.select().from(opOutbox).all();
    expect(ops).toHaveLength(2);
    const upsert = ops.find((o) => o.opType === 'task_upsert');
    const eventOp = ops.find((o) => o.opType === 'event_append');
    expect(upsert).toBeDefined();
    expect(eventOp).toBeDefined();
    expect(upsert?.baseVersion).toBeNull();
    // Server-shaped payload: snake_case keys, epoch-ms timestamps.
    const payload = upsert?.payload as Record<string, unknown>;
    expect(payload.est_minutes).toBe(120);
    expect(payload.user_id).toBe(USER);
    expect(payload.deadline).toBe(DRAFT.deadline?.getTime());
    expect(payload.version).toBe(1);

    const eventRows = db.select().from(events).all();
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.type).toBe('task_created');
    expect(eventRows[0]?.taskId).toBe(row.id);
    expect(eventRows[0]?.localDay).toBe('2026-08-24');
    expect(eventRows[0]?.opId).toBe(eventOp?.opId);
  });

  it('never puts the task title into the event payload (NFR-S3)', () => {
    createTask(db, { userId: USER, draft: DRAFT, meta: { source: 'form', nlParseUsed: false } });
    const [event] = db.select().from(events).all();
    const payload = (event?.payload ?? {}) as Record<string, unknown>;
    expect(payload.title).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(DRAFT.title);
    expect(payload).toMatchObject({
      source: 'form',
      nl_parse_used: false,
      category: 'deep',
      est_minutes: 120,
      has_deadline: true,
    });
  });

  it.each([
    [{ ...DRAFT, title: '   ' }, /title/],
    [{ ...DRAFT, estMinutes: 0 }, /minutes/],
    [{ ...DRAFT, estMinutes: 12.5 }, /minutes/],
    [{ ...DRAFT, value: 0 }, /value/],
    [{ ...DRAFT, value: 4 }, /value/],
    [
      { ...DRAFT, earliestStart: new Date(2026, 7, 29), deadline: new Date(2026, 7, 28) },
      /earliest start/,
    ],
  ])('rejects invalid drafts without writing anything', (draft, message) => {
    expect(() =>
      createTask(db, { userId: USER, draft, meta: { source: 'form', nlParseUsed: false } }),
    ).toThrow(message);
    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(db.select().from(opOutbox).all()).toHaveLength(0);
    expect(db.select().from(events).all()).toHaveLength(0);
  });
});

describe('updateTask', () => {
  it('bumps version and enqueues an op carrying the previous version as base_version', () => {
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    const updated = updateTask(db, { id: row.id, draft: { ...DRAFT, estMinutes: 90, value: 3 } });
    expect(updated.version).toBe(2);
    expect(updated.estMinutes).toBe(90);

    const ops = db
      .select()
      .from(opOutbox)
      .all()
      .filter((o) => o.opType === 'task_upsert');
    expect(ops).toHaveLength(2);
    const updateOp = ops.at(-1);
    expect(updateOp?.baseVersion).toBe(1);
    expect((updateOp?.payload as Record<string, unknown>).version).toBe(2);
  });

  it('refuses to edit a deleted task and unknown ids', () => {
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    softDeleteTask(db, { id: row.id });
    expect(() => updateTask(db, { id: row.id, draft: DRAFT })).toThrow(/deleted/);
    expect(() => updateTask(db, { id: 'nope', draft: DRAFT })).toThrow(/not found/);
  });
});

describe('soft delete + restore (undo window, File 02 §3)', () => {
  it('delete sets the tombstone and enqueues task_delete; restore is a first-class upsert', () => {
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    const deleted = softDeleteTask(db, { id: row.id });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.version).toBe(2);

    const restored = restoreTask(db, { id: row.id });
    expect(restored.deletedAt).toBeNull();
    expect(restored.version).toBe(3);

    const opTypes = db
      .select()
      .from(opOutbox)
      .all()
      .map((o) => o.opType);
    expect(opTypes.filter((t) => t === 'task_delete')).toHaveLength(1);
    expect(opTypes.filter((t) => t === 'task_upsert')).toHaveLength(2); // create + restore
  });

  it('both are idempotent (no duplicate ops on repeat)', () => {
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'form', nlParseUsed: false },
    });
    softDeleteTask(db, { id: row.id });
    softDeleteTask(db, { id: row.id });
    restoreTask(db, { id: row.id });
    restoreTask(db, { id: row.id });
    expect(db.select().from(opOutbox).all()).toHaveLength(4); // create×2(upsert+event) + delete + restore
  });
});

describe('offline sequence (NFR-R1 local half)', () => {
  it('create→edit→delete offline leaves a replayable, ordered op log', () => {
    const row = createTask(db, {
      userId: USER,
      draft: DRAFT,
      meta: { source: 'quick_add', nlParseUsed: true },
    });
    updateTask(db, { id: row.id, draft: { ...DRAFT, title: 'write report v2' } });
    softDeleteTask(db, { id: row.id });

    const ops = db.select().from(opOutbox).all();
    // seq strictly ascending, op ids unique, nothing acked/sent yet
    const seqs = ops.map((o) => o.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(ops.map((o) => o.opId)).size).toBe(ops.length);
    expect(ops.every((o) => o.sentAt === null && o.ackedAt === null)).toBe(true);
    // base_version chain for the plain-row ops
    const rowOps = ops.filter((o) => o.opType !== 'event_append');
    expect(rowOps.map((o) => o.baseVersion)).toEqual([null, 1, 2]);
  });
});

describe('inboxTasksQuery', () => {
  it('lists only non-deleted inbox tasks, newest first', () => {
    const first = createTask(db, {
      userId: USER,
      draft: { ...DRAFT, title: 'first' },
      meta: { source: 'form', nlParseUsed: false },
      now: new Date(2026, 7, 24, 9, 0),
    });
    const second = createTask(db, {
      userId: USER,
      draft: { ...DRAFT, title: 'second' },
      meta: { source: 'form', nlParseUsed: false },
      now: new Date(2026, 7, 24, 11, 0),
    });
    softDeleteTask(db, { id: first.id });

    const listed = inboxTasksQuery(db).all();
    expect(listed.map((t) => t.id)).toEqual([second.id]);
  });
});
