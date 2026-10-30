/**
 * Screenshot fixture (рис. 3.4, poster): the clock is a faithful Date with a fixed offset, and the
 * seeded day is one the app's own code accepts — the lapse scan finds nothing to lapse at 09:41,
 * every block sits inside the default working hours without overlaps, every rationale is a
 * vocabulary key, and the Insights document passes the client's own shape check.
 */
jest.mock('../../db/client', () => ({ db: {} }));

import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { currentUserId } from '../../auth/identity';
import { activeFocusSessionQuery, focusedMsAt, lapseScan } from '../../db/feedback';
import { profiles, recommendations, tasks } from '../../db/schema';
import type { LocalDb } from '../../db/writes';
import { isInsightsDocument } from '../../domain/heatmap';
import { RATIONALE_KEYS } from '../../domain/rationale';
import { appStorage, StorageKeys } from '../../storage/mmkv';
import { cachedInsights } from '../../sync/insights';
import { installFixtureClock, uninstallFixtureClock } from '../clock';
import insights from '../insights.json';
import { FIXTURE_BLOCKS, FIXTURE_INBOX, FIXTURE_TASKS, seedFixture } from '../seed';

function openDb(): LocalDb {
  const db = drizzle(new Database(':memory:'));
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return db as unknown as LocalDb;
}

/** Friday 30 October 2026 at 09:41 local time — the day the screenshots show. */
function fixtureMorning(): Date {
  return new Date(2026, 9, 30, 9, 41, 0, 0);
}

describe('fixture clock', () => {
  afterEach(() => uninstallFixtureClock());

  it('starts "now" at 09:41 today and leaves explicit dates alone', () => {
    const real = new Date(2026, 9, 30, 14, 6, 15).getTime();
    const offset = installFixtureClock(real);
    expect(offset).toBe(new Date(2026, 9, 30, 9, 41).getTime() - real);
    const now = new Date();
    expect(now).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - now.getTime())).toBeLessThan(1000);
    expect(new Date(0).getTime()).toBe(0);
    expect(new Date(2026, 0, 1).getFullYear()).toBe(2026);
    expect(Date.parse('2026-10-30T00:00:00Z')).toBe(Date.UTC(2026, 9, 30));
    expect(typeof (Date as unknown as () => string)()).toBe('string');
  });

  it('puts the real Date back', () => {
    const RealDate = Date;
    installFixtureClock();
    expect(Date).not.toBe(RealDate);
    uninstallFixtureClock();
    expect(Date).toBe(RealDate);
  });
});

describe('fixture day', () => {
  beforeEach(() => appStorage.clearAll());

  it('seeds once, with a completed onboarding for the current identity', () => {
    const db = openDb();
    const now = fixtureMorning();
    expect(seedFixture(db, now)).toBe(true);
    expect(seedFixture(db, now)).toBe(false);
    const [profile] = db.select().from(profiles).all();
    expect(profile?.userId).toBe(currentUserId());
    expect(profile?.onboardingCompletedAt).not.toBeNull();
    expect(profile?.chronotypeClass).toBe(insights.chronotype_class);
    const rows = db.select().from(tasks).all();
    expect(rows).toHaveLength(FIXTURE_TASKS.length + FIXTURE_INBOX.length);
    expect(rows.filter((t) => t.status === 'inbox')).toHaveLength(FIXTURE_INBOX.length);
  });

  it('is a day the lapse scan accepts at 09:41: nothing past is left open', () => {
    const db = openDb();
    const now = fixtureMorning();
    seedFixture(db, now);
    const result = lapseScan(db, { userId: currentUserId(), now });
    expect(result.lapsed).toHaveLength(0);
  });

  it('places every block inside working hours, in order, without overlaps', () => {
    const db = openDb();
    seedFixture(db, fixtureMorning());
    const recs = db
      .select()
      .from(recommendations)
      .all()
      .sort((a, b) => a.slotStart.getTime() - b.slotStart.getTime());
    expect(recs).toHaveLength(FIXTURE_BLOCKS.length);
    for (const [i, r] of recs.entries()) {
      const startMin = r.slotStart.getHours() * 60 + r.slotStart.getMinutes();
      const endMin = r.slotEnd.getHours() * 60 + r.slotEnd.getMinutes();
      expect(startMin).toBeGreaterThanOrEqual(9 * 60);
      expect(endMin).toBeLessThanOrEqual(18 * 60);
      expect(startMin % 15).toBe(0);
      const next = recs[i + 1];
      if (next !== undefined)
        expect(r.slotEnd.getTime()).toBeLessThanOrEqual(next.slotStart.getTime());
      expect(RATIONALE_KEYS).toContain(r.rationaleKey);
      expect(r.isExperiment).toBe(r.rationaleKey === 'experiment');
      expect(r.propensity !== null).toBe(r.isExperiment);
    }
    expect(recs.filter((r) => r.isExperiment)).toHaveLength(1);
  });

  it('has a focus session running on the in-progress block', () => {
    const db = openDb();
    const now = fixtureMorning();
    seedFixture(db, now);
    const [session] = activeFocusSessionQuery(db, currentUserId()).all();
    expect(session?.recommendationId).toBe('fx-rec-fx-report');
    expect(Math.floor(focusedMsAt(session!, now) / 60_000)).toBe(25);
  });

  it('caches an Insights document the client accepts, for the same identity', () => {
    const db = openDb();
    const now = fixtureMorning();
    seedFixture(db, now);
    expect(isInsightsDocument(insights)).toBe(true);
    expect(appStorage.getString(StorageKeys.remindersPromptDismissed)).toBe('1');
    const cached = cachedInsights(currentUserId());
    expect(cached?.doc.heatmap).toHaveLength(48);
    expect(cached?.fetchedAt).toBe(now.getTime() - 4 * 60_000);
  });
});
