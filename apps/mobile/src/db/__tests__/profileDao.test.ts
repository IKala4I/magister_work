/**
 * Profile write-path tests (FR-02, NFR-R1 local half) against real SQLite prepared with
 * the committed drizzle bundle — same rig as tasksDao.test.ts. Pins: one transaction =
 * row + profile_update op, server-shaped snake_case payload (P8 replays it unchanged),
 * base_version chain across saves, and the synced-state bookkeeping.
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

import { getProfile, markProfileSynced, saveProfile } from '../profile';
import type { ProfileDraft } from '../profile';
import { opOutbox } from '../schema';
import type { LocalDb } from '../writes';

const USER = 'local:test-device';
const NOW = new Date('2026-08-26T10:00:00Z');

const DRAFT: ProfileDraft = {
  timezone: 'Europe/Kyiv',
  locale: 'en',
  workingHours: { mon: [540, 1080], tue: [540, 1080] },
  sleepWindow: [1380, 420],
  rmeqScore: 24,
  chronotypeClass: 'DM',
  surveySkipped: false,
  topCategories: ['deep', 'learning'],
  onboardingCompletedAt: NOW,
};

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
});
afterEach(() => handle.close());

describe('saveProfile', () => {
  it('writes the row and its outbox op in one transaction', () => {
    const row = saveProfile(db, { userId: USER, draft: DRAFT, now: NOW });
    expect(row.userId).toBe(USER);
    expect(row.chronotypeClass).toBe('DM');
    expect(row.onboardingCompletedAt).toEqual(NOW);

    const ops = db.select().from(opOutbox).all();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ opType: 'profile_update', entityId: USER, baseVersion: null });
    // Server-shaped payload: snake_case, ISO timestamp — sync-resolve replays it as-is.
    expect(ops[0]?.payload).toEqual({
      user_id: USER,
      timezone: 'Europe/Kyiv',
      locale: 'en',
      working_hours: { mon: [540, 1080], tue: [540, 1080] },
      sleep_window: [1380, 420],
      rmeq_score: 24,
      chronotype_class: 'DM',
      survey_skipped: false,
      top_categories: ['deep', 'learning'],
      onboarding_completed_at: NOW.toISOString(),
    });
  });

  it('a skipped survey persists INT with no score (File 04 §3.1)', () => {
    const row = saveProfile(db, {
      userId: USER,
      draft: { ...DRAFT, rmeqScore: null, chronotypeClass: 'INT', surveySkipped: true },
      now: NOW,
    });
    expect(row.rmeqScore).toBeNull();
    expect(row.chronotypeClass).toBe('INT');
    expect(row.surveySkipped).toBe(true);
  });

  it('re-saving updates in place and chains base_version', () => {
    saveProfile(db, { userId: USER, draft: DRAFT, now: NOW });
    markProfileSynced(db, { userId: USER, version: 3, serverSeq: 41 });

    const later = new Date(NOW.getTime() + 60_000);
    saveProfile(db, {
      userId: USER,
      draft: { ...DRAFT, workingHours: { wed: [600, 900] } },
      now: later,
    });

    const row = getProfile(db, USER);
    expect(row?.workingHours).toEqual({ wed: [600, 900] });
    expect(row?.version).toBe(3); // local version reflects the server's last accepted one

    const ops = db.select().from(opOutbox).all();
    expect(ops).toHaveLength(2);
    expect(ops[1]?.baseVersion).toBe(3); // optimistic-concurrency check for the update op
  });
});

describe('markProfileSynced', () => {
  it('records the server version and sequence', () => {
    saveProfile(db, { userId: USER, draft: DRAFT, now: NOW });
    markProfileSynced(db, { userId: USER, version: 2, serverSeq: 17 });
    const row = getProfile(db, USER);
    expect(row?.version).toBe(2);
    expect(row?.serverSeq).toBe(17);
  });
});
