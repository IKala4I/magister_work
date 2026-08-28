/**
 * The two binding P3 contracts, tested end-to-end on real SQLite (P4 acceptance):
 * adoptLocalData must rewrite EVERY row and EVERY outbox payload owned by the pre-auth
 * placeholder (a missed payload dead-letters the queue against RLS); wipeLocalMirror must
 * clear the mirror AND reset the pull cursor (a kept cursor silently skips every server
 * row below the previous account's high-water mark) while preserving device identity and
 * the op counter (op_ids are never reused).
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

import { saveProfile } from '../../db/profile';
import { createTask } from '../../db/tasks';
import { calendarEvents, events, opOutbox, plans, profiles, tasks } from '../../db/schema';
import type { LocalDb } from '../../db/writes';
import { useSyncStore } from '../../state/sync';
import { appStorage, StorageKeys } from '../../storage/mmkv';
import { advanceSyncCursor, getSyncCursor } from '../../sync/cursor';
import { getLocalUserId } from '../../sync/localUser';
import {
  adoptLocalData,
  discardPendingWipe,
  keepPendingWipe,
  pendingWipeUserId,
  reconcilePendingWipe,
  transitionToAccount,
  unackedOpsFor,
  wipeLocalMirror,
} from '../accountTransition';

const UID = 'a0000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-08-26T10:00:00Z');

function openDb() {
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
  appStorage.clearAll();
  useSyncStore.setState({ pendingWipe: null });
});
afterEach(() => handle.close());

function seedLocalData(): string {
  const localId = getLocalUserId();
  createTask(db, {
    userId: localId,
    draft: {
      title: 'pre-auth task',
      category: 'deep',
      estMinutes: 60,
      value: 2,
      splittable: false,
      deadline: null,
      earliestStart: null,
    },
    meta: { source: 'form', nlParseUsed: false },
  });
  saveProfile(db, {
    userId: localId,
    draft: {
      timezone: 'Europe/Kyiv',
      locale: 'en',
      workingHours: { mon: [540, 1080] },
      sleepWindow: [1380, 420],
      rmeqScore: null,
      chronotypeClass: 'INT',
      surveySkipped: true,
      topCategories: [],
      onboardingCompletedAt: NOW,
    },
    now: NOW,
  });
  return localId;
}

describe('adoptLocalData (first sign-in contract)', () => {
  it('rewrites every row and every outbox payload user_id before any push', () => {
    const localId = seedLocalData();
    expect(localId.startsWith('local:')).toBe(true);

    adoptLocalData(db, UID);

    for (const table of [tasks, events, profiles] as const) {
      const owners = db.select({ userId: table.userId }).from(table).all();
      expect(owners.length).toBeGreaterThan(0);
      for (const row of owners) expect(row.userId).toBe(UID);
    }
    const ops = db.select().from(opOutbox).all();
    expect(ops.length).toBeGreaterThanOrEqual(3); // task_upsert + event_append + profile_update
    for (const op of ops) {
      const payload = op.payload as Record<string, unknown>;
      expect(payload.user_id).toBe(UID);
    }
  });

  it('is idempotent and leaves foreign rows alone', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    adoptLocalData(db, UID); // second run: nothing local-prefixed remains, must be a no-op

    const owners = db.select({ userId: tasks.userId }).from(tasks).all();
    for (const row of owners) expect(row.userId).toBe(UID);
  });

  it('survives a pre-existing profile row for the uid (m7: no PK-collision loop)', () => {
    seedLocalData(); // stale local: profile from before a failed adopt
    // …after which the user re-onboarded under the authenticated uid:
    saveProfile(db, {
      userId: UID,
      draft: {
        timezone: 'Europe/Kyiv',
        locale: 'en',
        workingHours: { tue: [540, 1080] },
        sleepWindow: [1380, 420],
        rmeqScore: 20,
        chronotypeClass: 'MM',
        surveySkipped: false,
        topCategories: ['deep'],
        onboardingCompletedAt: NOW,
      },
      now: NOW,
    });

    expect(() => adoptLocalData(db, UID)).not.toThrow();

    const rows = db.select().from(profiles).all();
    expect(rows).toHaveLength(1); // the stale placeholder row is gone
    expect(rows[0]).toMatchObject({ userId: UID, chronotypeClass: 'MM' }); // uid row wins
    const owners = db.select({ userId: tasks.userId }).from(tasks).all();
    for (const row of owners) expect(row.userId).toBe(UID); // tasks still adopted
  });
});

describe('wipeLocalMirror (account-change contract)', () => {
  it('clears mirror + queue and resets the cursor; identity/op counter survive', () => {
    seedLocalData();
    advanceSyncCursor(500);
    const deviceId = appStorage.getString(StorageKeys.deviceId);
    const opCounter = appStorage.getNumber(StorageKeys.opCounter);
    expect(opCounter).toBeGreaterThan(0);

    wipeLocalMirror(db);

    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(db.select().from(events).all()).toHaveLength(0);
    expect(db.select().from(profiles).all()).toHaveLength(0);
    expect(db.select().from(opOutbox).all()).toHaveLength(0);
    expect(getSyncCursor()).toBe(0); // next pull starts from scratch for the new account
    expect(appStorage.getString(StorageKeys.deviceId)).toBe(deviceId);
    expect(appStorage.getNumber(StorageKeys.opCounter)).toBe(opCounter);
  });
});

describe('P8 account change (ADR-0012 §11): wipe now, or defer while the previous account has unsynced ops', () => {
  const OTHER = 'b0000000-0000-4000-8000-000000000002';

  it('wipeLocalMirror clears every mirrored table (plans, focus sessions, calendar rows included) and resets the cursor', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    advanceSyncCursor(42);
    db.insert(plans)
      .values({
        id: 'p1',
        userId: UID,
        planDate: '2026-09-01',
        engine: 'learned',
        telemetry: {},
        generatedAt: NOW,
      })
      .run();
    db.insert(calendarEvents)
      .values({
        id: 'c1',
        userId: UID,
        externalId: 'x',
        startAt: NOW,
        endAt: NOW,
        updatedAt: NOW,
      })
      .run();
    wipeLocalMirror(db);
    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(db.select().from(plans).all()).toHaveLength(0);
    expect(db.select().from(calendarEvents).all()).toHaveLength(0);
    expect(db.select().from(opOutbox).all()).toHaveLength(0);
    expect(getSyncCursor()).toBe(0);
  });

  it('transitionToAccount wipes when nothing is unsynced', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    db.update(opOutbox).set({ ackedAt: NOW }).run(); // everything already pushed
    advanceSyncCursor(7);
    transitionToAccount(db, UID);
    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(getSyncCursor()).toBe(0);
    expect(pendingWipeUserId()).toBeNull();
    expect(useSyncStore.getState().pendingWipe).toBeNull();
  });

  it('transitionToAccount defers the wipe when unacked ops exist: cursor reset, rows kept, banner state set', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    advanceSyncCursor(7);
    transitionToAccount(db, UID);
    expect(db.select().from(tasks).all()).toHaveLength(1);
    expect(unackedOpsFor(db, UID)).toBeGreaterThan(0);
    expect(getSyncCursor()).toBe(0);
    expect(pendingWipeUserId()).toBe(UID);
    expect(useSyncStore.getState().pendingWipe?.userId).toBe(UID);
  });

  it('the previous owner signing back in cancels the pending wipe; discard removes only their rows', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    transitionToAccount(db, UID); // deferred
    // the new account creates its own task meanwhile
    createTask(db, {
      userId: OTHER,
      draft: {
        title: 'other account task',
        category: 'admin',
        estMinutes: 30,
        value: 1,
        splittable: false,
        deadline: null,
        earliestStart: null,
      },
      meta: { source: 'form', nlParseUsed: false },
    });
    reconcilePendingWipe(db, OTHER);
    expect(useSyncStore.getState().pendingWipe?.userId).toBe(UID);

    discardPendingWipe(db);
    expect(pendingWipeUserId()).toBeNull();
    expect(useSyncStore.getState().pendingWipe).toBeNull();
    const remaining = db.select().from(tasks).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.userId).toBe(OTHER);
    for (const op of db.select().from(opOutbox).all()) {
      expect((op.payload as { user_id?: string }).user_id).toBe(OTHER);
    }
  });

  it('keepPendingWipe leaves the rows and clears the question; reconcile for the owner clears it too', () => {
    seedLocalData();
    adoptLocalData(db, UID);
    transitionToAccount(db, UID);
    keepPendingWipe();
    expect(pendingWipeUserId()).toBeNull();
    expect(db.select().from(tasks).all()).toHaveLength(1);

    transitionToAccount(db, UID);
    reconcilePendingWipe(db, UID); // UID signs back in
    expect(pendingWipeUserId()).toBeNull();
    expect(useSyncStore.getState().pendingWipe).toBeNull();
    expect(db.select().from(tasks).all()).toHaveLength(1);
  });
});
