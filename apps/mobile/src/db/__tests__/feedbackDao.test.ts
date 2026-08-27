/**
 * P7 feedback facts on real SQLite (better-sqlite3, committed migration bundle): FR-30 session
 * lifecycle with pauses, UC-06 completion, FR-23/UC-04 skip + lapse (DST-safe scan, third-skip
 * diagnostic), UC-07 move, UC-04 A1 correction, FR-31 rating — every fact through the outbox,
 * categorical payloads only (NFR-S3), no reward anywhere (invariant 1).
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

import {
  abandonStaleSessions,
  activeFocusSessionQuery,
  answerSkipDiagnostic,
  applyServerRecommendations,
  correctLapse,
  endFocusSession,
  focusedMsAt,
  lapseScan,
  markBlockDone,
  moveBlock,
  pauseFocusSession,
  rateFocusSession,
  resumeFocusSession,
  skipBlock,
  startFocusSession,
} from '../feedback';
import type { RecommendationRow } from '../plans';
import { events, opOutbox, plans, recommendations, tasks } from '../schema';
import { createTask } from '../tasks';
import type { TaskRow } from '../tasks';
import type { LocalDb } from '../writes';

const USER = 'local:test-user';
const T = (iso: string) => new Date(iso);

function openDb(): { db: LocalDb; close: () => void } {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return { db: db as unknown as LocalDb, close: () => sqlite.close() };
}

function seed(
  db: LocalDb,
  over: {
    slotStart?: Date;
    slotEnd?: Date;
    status?: RecommendationRow['status'];
    title?: string;
  } = {},
): { task: TaskRow; rec: RecommendationRow } {
  const task = createTask(db, {
    userId: USER,
    draft: {
      title: over.title ?? 'write the report',
      category: 'deep',
      estMinutes: 60,
      value: 2,
      splittable: false,
      deadline: null,
      earliestStart: null,
    },
    meta: { source: 'form', nlParseUsed: false },
    now: T('2026-09-02T06:00:00+03:00'),
  });
  db.insert(plans)
    .values({
      id: `plan-${task.id}`,
      userId: USER,
      planDate: '2026-09-02',
      horizon: 'day',
      engine: 'learned',
      modelVersion: 'recsys-p5.0',
      arm: null,
      solverStatus: 'OPTIMAL',
      telemetry: {},
      generatedAt: T('2026-09-02T06:00:00+03:00'),
      serverSeq: null,
    })
    .run();
  const slotStart = over.slotStart ?? T('2026-09-02T14:00:00+03:00');
  const slotEnd = over.slotEnd ?? T('2026-09-02T15:30:00+03:00');
  const recId = `rec-${task.id}`;
  db.insert(recommendations)
    .values({
      id: recId,
      userId: USER,
      planId: `plan-${task.id}`,
      taskId: task.id,
      chunkIndex: 0,
      slotStart,
      slotEnd,
      contextBucket: 'AF.wd.fresh',
      features: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.6, 0, 0, 0, 0.5, 0.2, 0],
      qHat: 0.6,
      confidence: 0.7,
      rationaleKey: 'best_available',
      rationaleParams: {},
      isExperiment: false,
      engine: 'learned',
      modelVersion: 'recsys-p5.0',
      status: over.status ?? 'shown',
      attributedAt: null,
      propensity: null,
      conflictFlag: false,
      version: 1,
      createdAt: slotStart,
      updatedAt: slotStart,
      serverSeq: null,
    })
    .run();
  db.update(tasks).set({ status: 'scheduled' }).where(eq(tasks.id, task.id)).run();
  const rec = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recId))
    .get() as RecommendationRow;
  return { task: db.select().from(tasks).where(eq(tasks.id, task.id)).get() as TaskRow, rec };
}

const eventsOf = (db: LocalDb, type?: string) =>
  (db.select().from(events).all() as Array<typeof events.$inferSelect>).filter(
    (e) => type === undefined || e.type === type,
  );
const taskOf = (db: LocalDb, id: string) =>
  db.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow;
const recOf = (db: LocalDb, id: string) =>
  db.select().from(recommendations).where(eq(recommendations.id, id)).get() as RecommendationRow;

describe('focus sessions (FR-30, UC-06)', () => {
  it('start → pause → resume → finish: focused time excludes the pause, the task completes, four facts are logged', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db);
    const s = startFocusSession(db, {
      userId: USER,
      recommendationId: rec.id,
      now: T('2026-09-02T14:05:00+03:00'),
    });
    expect(s.state).toBe('running');
    expect(s.plannedMinutes).toBe(90);
    expect(recOf(db, rec.id).status).toBe('accepted'); // starting = accepting the placement
    expect(() => startFocusSession(db, { userId: USER, recommendationId: rec.id })).toThrow(
      /already running/,
    );

    const paused = pauseFocusSession(db, { sessionId: s.id, now: T('2026-09-02T14:25:00+03:00') });
    expect(paused.state).toBe('paused');
    expect(paused.focusedMs).toBe(20 * 60_000);
    expect(focusedMsAt(paused, T('2026-09-02T14:40:00+03:00'))).toBe(20 * 60_000); // frozen while paused

    const resumed = resumeFocusSession(db, {
      sessionId: s.id,
      now: T('2026-09-02T14:35:00+03:00'),
    });
    expect(focusedMsAt(resumed, T('2026-09-02T14:45:00+03:00'))).toBe(30 * 60_000);

    const ended = endFocusSession(db, {
      sessionId: s.id,
      outcome: 'finished',
      now: T('2026-09-02T15:20:00+03:00'),
    });
    expect(ended.state).toBe('finished');
    expect(ended.focusedMs).toBe(65 * 60_000); // 20 + 45
    expect(taskOf(db, task.id).status).toBe('done');
    expect(taskOf(db, task.id).skipStreak).toBe(0);
    expect(recOf(db, rec.id).status).toBe('completed');
    expect(activeFocusSessionQuery(db, USER).all()).toHaveLength(0);

    expect(eventsOf(db).map((e) => e.type)).toEqual([
      'task_created',
      'focus_start',
      'focus_pause',
      'focus_resume',
      'focus_end',
    ]);
    const end = eventsOf(db, 'focus_end')[0]!;
    expect(end.recommendationId).toBe(rec.id);
    expect(end.localDay).toBe('2026-09-02'); // anchored on the session START (midnight-safe)
    expect(end.payload).toMatchObject({
      outcome: 'finished',
      started_at: '2026-09-02T11:05:00.000Z',
      focused_ms: 65 * 60_000,
      planned_minutes: 90,
      est_minutes: 60,
    });
    // every fact rode the outbox with the same op_id
    const ops = db.select().from(opOutbox).all() as Array<typeof opOutbox.$inferSelect>;
    expect(ops.filter((o) => o.opType === 'event_append').map((o) => o.opId)).toEqual(
      eventsOf(db).map((e) => e.opId),
    );
    // the completed task went through the outbox too (task_upsert with base_version)
    const upserts = ops.filter((o) => o.opType === 'task_upsert');
    expect(upserts[upserts.length - 1]!.baseVersion).toBe(1); // base = the version before the completing write
    close();
  });

  it('abandon leaves the task open; the fact carries the fraction; a rating is a label with no reward field', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db);
    const s = startFocusSession(db, {
      userId: USER,
      recommendationId: rec.id,
      now: T('2026-09-02T14:00:00+03:00'),
    });
    const ended = endFocusSession(db, {
      sessionId: s.id,
      outcome: 'abandoned',
      now: T('2026-09-02T14:27:00+03:00'),
    });
    expect(ended.state).toBe('abandoned');
    expect(taskOf(db, task.id).status).toBe('scheduled');
    expect(recOf(db, rec.id).status).toBe('accepted');
    const endFact = eventsOf(db, 'focus_end')[0]!;
    expect(endFact.payload).toMatchObject({ outcome: 'abandoned', focused_ms: 27 * 60_000 });
    expect(Object.keys(endFact.payload as object)).not.toContain('fraction'); // no client-side reward arithmetic
    expect((endFact.context as { tz?: string }).tz).toBeTruthy(); // device zone rides on every fact
    const rated = rateFocusSession(db, {
      sessionId: s.id,
      energy: 3,
      now: T('2026-09-02T14:28:00+03:00'),
    });
    expect(rated.ratedEnergy).toBe(3);
    expect(eventsOf(db, 'session_rated')[0]!.payload).toEqual({
      session_id: s.id,
      energy: 3,
      difficulty: null,
      outcome: 'abandoned',
    });
    close();
  });
});

describe('block actions (FR-23, FR-25, UC-04, UC-07)', () => {
  it('Done from the block completes the task and logs task_completed with the latency', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db);
    markBlockDone(db, { recommendationId: rec.id, now: T('2026-09-02T15:00:00+03:00') });
    expect(taskOf(db, task.id).status).toBe('done');
    expect(recOf(db, rec.id).status).toBe('completed');
    expect(eventsOf(db, 'task_completed')[0]!.payload).toEqual({
      done_at: '2026-09-02T12:00:00.000Z',
      source: 'block',
      completion_latency_minutes: 60,
    });
    close();
  });

  it('Skip returns the task to the Inbox, counts a postpone, and asks the diagnostic on the third consecutive skip', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db);
    const first = skipBlock(db, { recommendationId: rec.id, now: T('2026-09-02T14:02:00+03:00') });
    expect(first.diagnosticDue).toBe(false);
    expect(eventsOf(db, 'block_skipped')[0]!.payload).not.toHaveProperty('fraction');
    expect(first.task.status).toBe('inbox');
    expect(first.task.postponeCount).toBe(1);
    expect(recOf(db, rec.id).status).toBe('rejected');
    expect(eventsOf(db, 'block_skipped')[0]!.payload).toMatchObject({
      skip_streak: 1,
      minutes_before_slot_end: 88,
    });
    // two more placements of the same task, skipped
    for (let i = 2; i <= 3; i++) {
      db.insert(recommendations)
        .values({ ...rec, id: `${rec.id}-${i}`, status: 'shown' })
        .run();
      const r = skipBlock(db, {
        recommendationId: `${rec.id}-${i}`,
        now: T(`2026-09-0${i}T14:02:00+03:00`),
      });
      expect(r.diagnosticDue).toBe(i === 3);
    }
    expect(taskOf(db, task.id).skipStreak).toBe(3);
    // a 4th skip after "ask me later" does not re-ask (one question per third skip)
    db.insert(recommendations)
      .values({ ...rec, id: `${rec.id}-4`, status: 'shown' })
      .run();
    expect(
      skipBlock(db, { recommendationId: `${rec.id}-4`, now: T('2026-09-04T14:02:00+03:00') })
        .diagnosticDue,
    ).toBe(false);
    expect(taskOf(db, task.id).skipStreak).toBe(4);
    const answered = answerSkipDiagnostic(db, {
      taskId: task.id,
      answer: 'too_big',
      now: T('2026-09-03T14:03:00+03:00'),
    });
    expect(answered.splittable).toBe(true);
    expect(answered.skipStreak).toBe(0);
    expect(eventsOf(db, 'skip_diagnostic')[0]!.payload).toEqual({
      answer: 'too_big',
      consecutive_skips: 4,
      category: 'deep',
      est_minutes: 60,
    });
    const archived = answerSkipDiagnostic(db, { taskId: task.id, answer: 'not_important' });
    expect(archived.status).toBe('archived');
    close();
  });

  it('Move keeps the duration, marks the row moved, and logs both slots with the distance', () => {
    const { db, close } = openDb();
    const { rec } = seed(db);
    // a target before "now" is lifted to the next 15-min tick (never into the past)
    const past = moveBlock(db, {
      recommendationId: rec.id,
      toStart: T('2026-09-02T08:00:00+03:00'),
      now: T('2026-09-02T09:50:00+03:00'),
    });
    expect(past.slotStart.toISOString()).toBe('2026-09-02T07:00:00.000Z'); // 10:00 Kyiv
    const moved = moveBlock(db, {
      recommendationId: rec.id,
      toStart: T('2026-09-02T18:00:00+03:00'),
      now: T('2026-09-02T10:00:00+03:00'),
    });
    expect(moved.status).toBe('moved');
    expect(moved.slotEnd.getTime() - moved.slotStart.getTime()).toBe(90 * 60_000);
    expect(eventsOf(db, 'block_moved')[1]!.payload).toEqual({
      from_start: '2026-09-02T07:00:00.000Z',
      from_end: '2026-09-02T08:30:00.000Z',
      to_start: '2026-09-02T15:00:00.000Z',
      to_end: '2026-09-02T16:30:00.000Z',
      distance_minutes: 480,
    });
    close();
  });

  it('"Actually did it" on a lapsed block completes the task and logs the correction fact', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db, { status: 'lapsed' });
    correctLapse(db, { recommendationId: rec.id, now: T('2026-09-03T21:00:00+03:00') });
    expect(taskOf(db, task.id).status).toBe('done');
    expect(recOf(db, rec.id).status).toBe('completed');
    expect(eventsOf(db, 'lapse_corrected')[0]!.payload).toMatchObject({
      at: '2026-09-03T18:00:00.000Z',
    });
    close();
  });
});

describe('lazy lapse scan (File 05 §1; invariant 7)', () => {
  it('marks ended blocks without a session as lapsed, returns the task to the Inbox, leaves future/active/done blocks alone', () => {
    const { db, close } = openDb();
    const ended = seed(db, { title: 'a' });
    const future = seed(db, {
      title: 'b',
      slotStart: T('2026-09-02T17:00:00+03:00'),
      slotEnd: T('2026-09-02T18:00:00+03:00'),
    });
    const active = seed(db, {
      title: 'c',
      slotStart: T('2026-09-02T12:00:00+03:00'),
      slotEnd: T('2026-09-02T13:00:00+03:00'),
    });
    startFocusSession(db, {
      userId: USER,
      recommendationId: active.rec.id,
      now: T('2026-09-02T12:05:00+03:00'),
    });
    const done = seed(db, {
      title: 'd',
      slotStart: T('2026-09-02T09:00:00+03:00'),
      slotEnd: T('2026-09-02T10:00:00+03:00'),
    });
    markBlockDone(db, { recommendationId: done.rec.id, now: T('2026-09-02T09:50:00+03:00') });

    const result = lapseScan(db, { userId: USER, now: T('2026-09-02T16:00:00+03:00') });
    expect(result.lapsed.map((r) => r.id)).toEqual([ended.rec.id]);
    expect(recOf(db, ended.rec.id).status).toBe('lapsed');
    expect(taskOf(db, ended.task.id)).toMatchObject({
      status: 'inbox',
      postponeCount: 1,
      skipStreak: 1,
    });
    expect(recOf(db, future.rec.id).status).toBe('shown');
    expect(recOf(db, active.rec.id).status).toBe('accepted');
    expect(recOf(db, done.rec.id).status).toBe('completed');
    expect(eventsOf(db, 'lapse_observed')).toHaveLength(1);
    // idempotent: a second scan finds nothing new
    expect(lapseScan(db, { userId: USER, now: T('2026-09-02T16:30:00+03:00') }).lapsed).toEqual([]);
    expect(eventsOf(db, 'lapse_observed')).toHaveLength(1);
    close();
  });

  it('is DST-safe: the fall-back hour (Europe/Kyiv 2026-10-25 04:00 → 03:00) neither lapses a running slot early nor spares an ended one', () => {
    const { db, close } = openDb();
    // slot 03:30–04:30 local BEFORE the change (EEST, +03) = 00:30–01:30Z
    const early = seed(db, {
      title: 'a',
      slotStart: T('2026-10-25T00:30:00Z'),
      slotEnd: T('2026-10-25T01:30:00Z'),
    });
    // slot 03:30–04:30 local AFTER the change (EET, +02) = 01:30–02:30Z — same wall clock, later instant
    const late = seed(db, {
      title: 'b',
      slotStart: T('2026-10-25T01:30:00Z'),
      slotEnd: T('2026-10-25T02:30:00Z'),
    });
    // at 02:00Z (= 04:00 EET, the second 04:00 of the night) the first slot has ended, the second has not
    const r1 = lapseScan(db, { userId: USER, now: T('2026-10-25T02:00:00Z') });
    expect(r1.lapsed.map((r) => r.id)).toEqual([early.rec.id]);
    expect(recOf(db, late.rec.id).status).toBe('shown');
    const r2 = lapseScan(db, { userId: USER, now: T('2026-10-25T02:31:00Z') });
    expect(r2.lapsed.map((r) => r.id)).toEqual([late.rec.id]);
    close();
  });

  it('a session running on ANOTHER placement of the same task keeps its ended chunk from lapsing', () => {
    const { db, close } = openDb();
    const a = seed(db, {
      title: 'chunked',
      slotStart: T('2026-09-02T09:00:00+03:00'),
      slotEnd: T('2026-09-02T10:00:00+03:00'),
    });
    db.insert(recommendations)
      .values({
        ...a.rec,
        id: `${a.rec.id}-2`,
        slotStart: T('2026-09-02T14:00:00+03:00'),
        slotEnd: T('2026-09-02T15:00:00+03:00'),
      })
      .run();
    startFocusSession(db, {
      userId: USER,
      recommendationId: `${a.rec.id}-2`,
      now: T('2026-09-02T14:01:00+03:00'),
    });
    const r = lapseScan(db, { userId: USER, now: T('2026-09-02T14:30:00+03:00') });
    expect(r.lapsed).toEqual([]);
    expect(taskOf(db, a.task.id).status).toBe('scheduled');
    close();
  });

  it('a session left running far beyond its block is abandoned on the next foreground', () => {
    const { db, close } = openDb();
    const { rec } = seed(db);
    const s = startFocusSession(db, {
      userId: USER,
      recommendationId: rec.id,
      now: T('2026-09-02T14:00:00+03:00'),
    });
    expect(abandonStaleSessions(db, { userId: USER, now: T('2026-09-02T17:59:00+03:00') })).toEqual(
      [],
    ); // 90×2 + 60 = 240 min
    const closed = abandonStaleSessions(db, { userId: USER, now: T('2026-09-02T18:01:00+03:00') });
    expect(closed.map((x) => x.id)).toEqual([s.id]);
    expect(closed[0]!.state).toBe('abandoned');
    close();
  });

  it('the third consecutive lapse of a task surfaces the diagnostic', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db);
    lapseScan(db, { userId: USER, now: T('2026-09-02T16:00:00+03:00') });
    for (let i = 2; i <= 3; i++) {
      db.update(tasks).set({ status: 'scheduled' }).where(eq(tasks.id, task.id)).run();
      db.insert(recommendations)
        .values({ ...rec, id: `${rec.id}-${i}`, status: 'shown' })
        .run();
      const r = lapseScan(db, { userId: USER, now: T('2026-09-02T17:00:00+03:00') });
      expect(r.diagnosticDue.map((t) => t.id)).toEqual(i === 3 ? [task.id] : []);
    }
    close();
  });
});

describe('hygiene', () => {
  it('no P7 event payload ever carries the task title (NFR-S3)', () => {
    const { db, close } = openDb();
    const { task, rec } = seed(db, { title: 'SECRET TITLE' });
    const s = startFocusSession(db, {
      userId: USER,
      recommendationId: rec.id,
      now: T('2026-09-02T14:00:00+03:00'),
    });
    pauseFocusSession(db, { sessionId: s.id, now: T('2026-09-02T14:10:00+03:00') });
    resumeFocusSession(db, { sessionId: s.id, now: T('2026-09-02T14:12:00+03:00') });
    endFocusSession(db, {
      sessionId: s.id,
      outcome: 'abandoned',
      now: T('2026-09-02T14:20:00+03:00'),
    });
    rateFocusSession(db, { sessionId: s.id, energy: 2, difficulty: 1 });
    skipBlock(db, { recommendationId: rec.id });
    moveBlock(db, { recommendationId: rec.id, toStart: T('2026-09-02T18:00:00+03:00') });
    answerSkipDiagnostic(db, { taskId: task.id, answer: 'wrong_time' });
    for (const e of eventsOf(db)) {
      expect(JSON.stringify(e.payload ?? {})).not.toContain('SECRET');
      expect(JSON.stringify(e.context ?? {})).not.toContain('SECRET');
      expect(Object.keys((e.payload ?? {}) as object)).not.toContain('reward');
    }
    close();
  });

  it('applyServerRecommendations mirrors the server-derived status, slots and features', () => {
    const { db, close } = openDb();
    const { rec } = seed(db);
    applyServerRecommendations(db, [
      {
        id: rec.id,
        status: 'moved',
        slot_start: '2026-09-02T15:00:00.000Z',
        slot_end: '2026-09-02T16:30:00.000Z',
        context_bucket: 'EV.wd',
        features: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.6, 0, 0, 0, 0.5, 0.2, 0.1],
        attributed_at: null,
      },
    ]);
    const after = recOf(db, rec.id);
    expect(after.status).toBe('moved');
    expect(after.contextBucket).toBe('EV.wd');
    expect(after.slotStart.toISOString()).toBe('2026-09-02T15:00:00.000Z');
    close();
  });
});
