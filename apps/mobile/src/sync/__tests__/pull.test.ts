/**
 * The pull applier on real SQLite (ADR-0012 §5): rows land column-for-column, re-applying a page
 * is a no-op, entities with unacked ops are skipped, a displaced placement sends its task back
 * to the Inbox through the outbox (status only), a kept completion is reported for the toast,
 * cancelled meetings arrive as tombstones and stay out of the busy query.
 */
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
  };
});

import path from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { busyEventsQuery } from '../../db/calendar';
import { calendarEvents, opOutbox, plans, profiles, recommendations, tasks } from '../../db/schema';
import { createTask } from '../../db/tasks';
import type { LocalDb } from '../../db/writes';
import { applyPull } from '../pull';
import type { PullRow } from '../types';

const USER = 'a0000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-01T13:10:00Z');

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

const TASK = 'b0000000-0000-4000-8000-000000000001';
const REC = 'c0000000-0000-4000-8000-000000000001';
const PLAN = 'd0000000-0000-4000-8000-000000000001';

const taskRow = (over: Record<string, unknown> = {}): PullRow => ({
  server_seq: 10,
  tbl: 'tasks',
  row: {
    id: TASK,
    user_id: USER,
    title: 'Slides',
    category: 'deep',
    est_minutes: 60,
    deadline: null,
    value: 2,
    splittable: false,
    earliest_start: null,
    recurrence: null,
    status: 'scheduled',
    done_at: null,
    postpone_count: 0,
    deleted_at: null,
    version: 7,
    created_at: '2026-09-01T06:00:00.000Z',
    updated_at: '2026-09-01T06:00:00.000Z',
    server_seq: 10,
    ...over,
  },
});

const planRow: PullRow = {
  server_seq: 11,
  tbl: 'plans',
  row: {
    id: PLAN,
    user_id: USER,
    plan_date: '2026-09-01',
    horizon: 'day',
    engine: 'learned',
    model_version: 'recsys-p5.0',
    arm: null,
    solver_status: 'OPTIMAL',
    telemetry: { ef: { reason: 'learned' }, unplaced: [] },
    generated_at: '2026-09-01T05:00:00.000Z',
    server_seq: 11,
  },
};

const recRow = (over: Record<string, unknown> = {}): PullRow => ({
  server_seq: 12,
  tbl: 'recommendations',
  row: {
    id: REC,
    user_id: USER,
    plan_id: PLAN,
    task_id: TASK,
    chunk_index: 0,
    slot_start: '2026-09-01T11:00:00.000Z',
    slot_end: '2026-09-01T12:00:00.000Z',
    context_bucket: 'AF.wd.fresh',
    features: [1, 0],
    q_hat: 0.6,
    confidence: 0.7,
    rationale_key: 'energy_peak',
    rationale_params: { category: 'deep' },
    is_experiment: false,
    engine: 'learned',
    model_version: 'recsys-p5.0',
    status: 'accepted',
    attributed_at: null,
    propensity: null,
    conflict_flag: false,
    version: 2,
    created_at: '2026-09-01T05:00:00.000Z',
    updated_at: '2026-09-01T05:00:00.000Z',
    server_seq: 12,
    ...over,
  },
});

const eventRow = (over: Record<string, unknown> = {}): PullRow => ({
  server_seq: 13,
  tbl: 'calendar_events',
  row: {
    id: 'e0000000-0000-4000-8000-000000000001',
    user_id: USER,
    source: 'google',
    external_id: 'meet1',
    start_at: '2026-09-01T11:00:00.000Z',
    end_at: '2026-09-01T12:00:00.000Z',
    title: 'Design review',
    busy: true,
    deleted_at: null,
    updated_at: '2026-09-01T10:58:00.000Z',
    server_seq: 13,
    ...over,
  },
});

const profileRow: PullRow = {
  server_seq: 9,
  tbl: 'profiles',
  row: {
    user_id: USER,
    timezone: 'Europe/Kyiv',
    locale: 'en',
    working_hours: { mon: [540, 1080] },
    sleep_window: [1380, 420],
    rmeq_score: 20,
    chronotype_class: 'MM',
    survey_skipped: false,
    top_categories: ['deep'],
    onboarding_completed_at: '2026-08-30T10:00:00.000Z',
    research_cohort: false,
    settings: {},
    eu_eea_resident: null,
    version: 3,
    updated_at: '2026-08-30T10:00:00.000Z',
    server_seq: 9,
  },
};

describe('applyPull', () => {
  it('lands profile, task, plan, recommendation and meeting rows column-for-column; re-applying is a no-op', () => {
    const rows = [profileRow, taskRow(), planRow, recRow(), eventRow()];
    const r1 = applyPull(db, { userId: USER, rows, now: NOW });
    expect(r1).toEqual({ applied: 5, skipped: 0, meetingsKept: 0, displaced: 0 });
    const p = db.select().from(profiles).where(eq(profiles.userId, USER)).get();
    expect(p).toMatchObject({ timezone: 'Europe/Kyiv', version: 3, serverSeq: 9 });
    const t = db.select().from(tasks).where(eq(tasks.id, TASK)).get();
    expect(t).toMatchObject({ title: 'Slides', status: 'scheduled', version: 7, serverSeq: 10 });
    expect(t?.createdAt).toEqual(new Date('2026-09-01T06:00:00.000Z'));
    const pl = db.select().from(plans).where(eq(plans.id, PLAN)).get();
    expect(pl).toMatchObject({ planDate: '2026-09-01', engine: 'learned' });
    const rec = db.select().from(recommendations).where(eq(recommendations.id, REC)).get();
    expect(rec).toMatchObject({ status: 'accepted', conflictFlag: false, features: [1, 0] });
    expect(rec?.slotStart).toEqual(new Date('2026-09-01T11:00:00.000Z'));
    const ev = db.select().from(calendarEvents).all();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ externalId: 'meet1', busy: true, title: 'Design review' });

    const r2 = applyPull(db, { userId: USER, rows, now: NOW });
    expect(r2.applied).toBe(5);
    expect(db.select().from(tasks).all()).toHaveLength(1);
    expect(db.select().from(opOutbox).all()).toHaveLength(0);
  });

  it('skips a task with an unacked local op (the push owns it) but applies the rest', () => {
    const created = createTask(db, {
      userId: USER,
      draft: {
        title: 'local edit in flight',
        category: 'admin',
        estMinutes: 30,
        value: 1,
        splittable: false,
        deadline: null,
        earliestStart: null,
      },
      meta: { source: 'form', nlParseUsed: false },
      now: NOW,
    });
    const r = applyPull(db, {
      userId: USER,
      rows: [taskRow({ id: created.id, title: 'server version' }), planRow],
      now: NOW,
    });
    expect(r).toEqual({ applied: 1, skipped: 1, meetingsKept: 0, displaced: 0 });
    expect(db.select().from(tasks).where(eq(tasks.id, created.id)).get()?.title).toBe(
      'local edit in flight',
    );
  });

  it('a PENDING displacement leaves the task alone (facts beat plans — it may still be worked); the final displaced returns it to the Inbox through the outbox — status only, no postpone', () => {
    applyPull(db, { userId: USER, rows: [taskRow(), planRow, recRow()], now: NOW });
    const pending = applyPull(db, {
      userId: USER,
      rows: [recRow({ status: 'displaced_pending', version: 3, server_seq: 20 })],
      now: NOW,
    });
    expect(pending.displaced).toBe(0);
    expect(db.select().from(tasks).where(eq(tasks.id, TASK)).get()).toMatchObject({
      status: 'scheduled',
      version: 7,
    });
    expect(db.select().from(opOutbox).all()).toHaveLength(0);
    expect(db.select().from(recommendations).where(eq(recommendations.id, REC)).get()?.status).toBe(
      'displaced_pending',
    );

    const r = applyPull(db, {
      userId: USER,
      rows: [recRow({ status: 'displaced', version: 4, server_seq: 21 })],
      now: NOW,
    });
    expect(r.displaced).toBe(1);
    const t = db.select().from(tasks).where(eq(tasks.id, TASK)).get();
    expect(t).toMatchObject({ status: 'inbox', postponeCount: 0, version: 8 });
    const ops = db.select().from(opOutbox).all();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ opType: 'task_upsert', entityId: TASK, baseVersion: 7 });
    expect((ops[0]?.payload as { status: string }).status).toBe('inbox');
    // re-applying the same displaced row is not a second displacement
    const r2 = applyPull(db, {
      userId: USER,
      rows: [recRow({ status: 'displaced', version: 4, server_seq: 21 })],
      now: NOW,
    });
    expect(r2.displaced).toBe(0);
    expect(db.select().from(opOutbox).all()).toHaveLength(1);
  });

  it('a completion kept despite a meeting (conflict_flag) is reported once for the toast', () => {
    applyPull(db, { userId: USER, rows: [taskRow(), planRow, recRow()], now: NOW });
    const r = applyPull(db, {
      userId: USER,
      rows: [recRow({ status: 'completed', conflict_flag: true, version: 4, server_seq: 22 })],
      now: NOW,
    });
    expect(r.meetingsKept).toBe(1);
    const again = applyPull(db, {
      userId: USER,
      rows: [recRow({ status: 'completed', conflict_flag: true, version: 4, server_seq: 22 })],
      now: NOW,
    });
    expect(again.meetingsKept).toBe(0);
  });

  it('a cancelled meeting arrives as a tombstone and leaves the busy query', () => {
    applyPull(db, { userId: USER, rows: [eventRow()], now: NOW });
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-02T00:00:00Z');
    expect(busyEventsQuery(db, USER, from, to).all()).toHaveLength(1);
    applyPull(db, {
      userId: USER,
      rows: [eventRow({ deleted_at: '2026-09-01T12:30:00.000Z', busy: false, server_seq: 30 })],
      now: NOW,
    });
    expect(busyEventsQuery(db, USER, from, to).all()).toHaveLength(0);
    expect(db.select().from(calendarEvents).all()).toHaveLength(1);
  });

  it("another identity's rows are never applied", () => {
    const r = applyPull(db, {
      userId: USER,
      rows: [taskRow({ user_id: 'someone-else' })],
      now: NOW,
    });
    expect(r.applied).toBe(1); // counted, but the row guard dropped it
    expect(db.select().from(tasks).all()).toHaveLength(0);
  });
});
