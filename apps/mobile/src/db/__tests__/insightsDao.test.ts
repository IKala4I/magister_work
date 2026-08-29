/**
 * P9 facts on real SQLite: belief labels (append-only through the outbox, closed vocabulary,
 * latest-wins read-back, pending until acked), the weekly review fact, and FR-24 trade-off
 * decisions applied as task edits (class-2 ops) with the decision fact — nothing here touches a
 * reward or a model state (invariant 1).
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

import type { TradeOffOption } from '../../domain/tradeoff';
import {
  applyTradeoffOption,
  beliefLabelsQuery,
  decidedPlanIds,
  labelBelief,
  latestLocalLabels,
  nextDayStart,
  recordWeeklyReview,
  rejectTradeoffs,
  stateRefOf,
  tradeoffDecisionsQuery,
  weeklyReviewsQuery,
} from '../insights';
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

function seedTask(
  db: LocalDb,
  over: { deadline?: Date | null; estMinutes?: number } = {},
): TaskRow {
  return createTask(db, {
    userId: USER,
    draft: {
      title: 'write the report',
      category: 'deep',
      estMinutes: over.estMinutes ?? 90,
      value: 2,
      splittable: false,
      deadline: over.deadline ?? null,
      earliestStart: null,
    },
    meta: { source: 'form', nlParseUsed: false },
    now: T('2026-09-02T06:00:00+03:00'),
  });
}

function seedPlan(db: LocalDb, task: TaskRow, status: 'shown' | 'pinned' = 'shown'): string {
  const planId = `plan-${task.id}`;
  db.insert(plans)
    .values({
      id: planId,
      userId: USER,
      planDate: '2026-09-02',
      horizon: 'day',
      engine: 'learned',
      modelVersion: 'recsys-p5.0',
      arm: null,
      solverStatus: 'INFEASIBLE',
      telemetry: {},
      generatedAt: T('2026-09-02T06:00:00+03:00'),
      serverSeq: null,
    })
    .run();
  db.insert(recommendations)
    .values({
      id: `rec-${task.id}`,
      userId: USER,
      planId,
      taskId: task.id,
      chunkIndex: 0,
      slotStart: T('2026-09-02T14:00:00+03:00'),
      slotEnd: T('2026-09-02T15:30:00+03:00'),
      contextBucket: 'AF.wd.fresh',
      features: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.6, 0, 0, 0, 0.5, 0.2, 0],
      qHat: 0.6,
      confidence: 0.7,
      rationaleKey: 'best_available',
      rationaleParams: {},
      isExperiment: false,
      engine: 'learned',
      modelVersion: 'recsys-p5.0',
      status,
      attributedAt: null,
      propensity: null,
      conflictFlag: false,
      version: 1,
      createdAt: T('2026-09-02T06:00:00+03:00'),
      updatedAt: T('2026-09-02T06:00:00+03:00'),
      serverSeq: null,
    })
    .run();
  db.update(tasks).set({ status: 'scheduled' }).where(eq(tasks.id, task.id)).run();
  return planId;
}

const allEvents = (db: LocalDb) => db.select().from(events).all();
const allOps = (db: LocalDb) => db.select().from(opOutbox).all();

describe('belief labels (FR-41 / FR-33)', () => {
  it('appends a belief_label fact through the outbox with the closed vocabulary only', () => {
    const { db, close } = openDb();
    try {
      const opId = labelBelief(db, {
        userId: USER,
        stateRef: 'beta:deep.MO.weekday',
        label: 'correct',
        surface: 'beliefs',
        now: T('2026-09-02T09:00:00+03:00'),
      });
      const ev = allEvents(db);
      expect(ev).toHaveLength(1);
      expect(ev[0]!.type).toBe('belief_label');
      expect(ev[0]!.payload).toEqual({
        state_ref: 'beta:deep.MO.weekday',
        label: 'correct',
        surface: 'beliefs',
      });
      const ops = allOps(db);
      expect(ops).toHaveLength(1);
      expect(ops[0]!.opId).toBe(opId);
      expect(ops[0]!.opType).toBe('event_append');
      expect(() =>
        labelBelief(db, {
          userId: USER,
          stateRef: 'beta:deep.XX.weekday',
          label: 'correct',
          surface: 'beliefs',
        }),
      ).toThrow(/invalid state_ref/);
      expect(() =>
        labelBelief(db, {
          userId: USER,
          stateRef: 'bandit:deep',
          label: 'correct',
          surface: 'beliefs',
        }),
      ).toThrow(/invalid state_ref/);
      expect(allEvents(db)).toHaveLength(1); // nothing half-written
    } finally {
      close();
    }
  });

  it('the latest label per cell wins on read-back; unacked rows are pending', () => {
    const { db, close } = openDb();
    try {
      const ref = stateRefOf('deep', 'MO', 'weekday');
      labelBelief(db, {
        userId: USER,
        stateRef: ref,
        label: 'correct',
        surface: 'beliefs',
        now: T('2026-09-02T09:00:00Z'),
      });
      labelBelief(db, {
        userId: USER,
        stateRef: ref,
        label: 'incorrect',
        surface: 'review',
        now: T('2026-09-02T10:00:00Z'),
      });
      labelBelief(db, {
        userId: USER,
        stateRef: 'beta:admin.AF.weekend',
        label: 'none',
        surface: 'beliefs',
        now: T('2026-09-02T10:30:00Z'),
      });
      const rows = beliefLabelsQuery(db, USER).all();
      expect(rows).toHaveLength(3);
      const latest = latestLocalLabels(rows);
      expect(latest.get(ref)).toEqual({
        label: 'incorrect',
        at: Date.parse('2026-09-02T10:00:00Z'),
        pending: true,
      });
      expect(latest.get('beta:admin.AF.weekend')?.label).toBe('none');
      // an acked row (server_ts set by the engine) is no longer pending
      db.update(events)
        .set({ serverTs: T('2026-09-02T10:01:00Z') })
        .where(eq(events.type, 'belief_label'))
        .run();
      expect(latestLocalLabels(beliefLabelsQuery(db, USER).all()).get(ref)?.pending).toBe(false);
    } finally {
      close();
    }
  });
});

describe('weekly review (UC-08)', () => {
  it('logs the review-completed fact and the latest one is readable', () => {
    const { db, close } = openDb();
    try {
      recordWeeklyReview(db, {
        userId: USER,
        week: '2026-W35',
        learnings: 3,
        labelsSet: 1,
        trend: 'up',
        now: T('2026-08-30T20:00:00Z'),
      });
      recordWeeklyReview(db, {
        userId: USER,
        week: '2026-W36',
        learnings: 2,
        labelsSet: 0,
        trend: null,
        now: T('2026-09-06T20:00:00Z'),
      });
      const rows = weeklyReviewsQuery(db, USER).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload).toEqual({
        week: '2026-W36',
        learnings: 2,
        labels_set: 0,
        trend: null,
      });
      expect(allOps(db)).toHaveLength(2);
    } finally {
      close();
    }
  });
});

describe('trade-off decisions (FR-24 / UC-05)', () => {
  const opt = (over: Partial<TradeOffOption>): TradeOffOption => ({
    kind: 'drop',
    task_id: 't',
    delta_minutes: null,
    consequence: { metric: 'value_forfeited', value: 1.2 },
    ...over,
  });

  it('drop: the task leaves today (earliest_start = tomorrow, +1 postpone, back to inbox) as a task op + the decision fact', () => {
    const { db, close } = openDb();
    try {
      const task = seedTask(db);
      const planId = seedPlan(db, task);
      const now = T('2026-09-02T09:15:00+03:00');
      const options = [
        opt({ task_id: task.id }),
        opt({
          task_id: task.id,
          kind: 'shrink',
          delta_minutes: 30,
          consequence: { metric: 'est_completion_drop', value: 0.18 },
        }),
      ];
      const r = applyTradeoffOption(db, {
        userId: USER,
        planId,
        option: options[0]!,
        rank: 1,
        options,
        now,
      });
      expect(r.task?.earliestStart).toEqual(nextDayStart(now));
      expect(r.task?.postponeCount).toBe(1);
      expect(r.task?.status).toBe('inbox');
      expect(r.task?.version).toBe(2);
      const ops = allOps(db).filter((o) => o.opType === 'task_upsert');
      expect(ops.at(-1)!.baseVersion).toBe(1);
      expect((ops.at(-1)!.payload as { earliest_start: number }).earliest_start).toBe(
        nextDayStart(now).getTime(),
      );
      const decision = allEvents(db).find((e) => e.type === 'tradeoff_decision')!;
      expect(decision.taskId).toBe(task.id);
      expect(decision.payload).toEqual({
        plan_id: planId,
        kind: 'drop',
        rank: 1,
        delta_minutes: null,
        consequence: { metric: 'value_forfeited', value: 1.2 },
        alternatives: [
          { kind: 'drop', metric: 'value_forfeited' },
          { kind: 'shrink', metric: 'est_completion_drop' },
        ],
      });
      expect(decidedPlanIds(tradeoffDecisionsQuery(db, USER).all())).toEqual(new Set([planId]));
    } finally {
      close();
    }
  });

  it('shrink cuts the estimate by delta (floor 15); move_past_deadline extends the deadline by the slip', () => {
    const { db, close } = openDb();
    try {
      const task = seedTask(db, { deadline: T('2026-09-02T18:00:00+03:00') });
      const planId = seedPlan(db, task);
      const shrink = opt({
        task_id: task.id,
        kind: 'shrink',
        delta_minutes: 30,
        consequence: { metric: 'est_completion_drop', value: 0.2 },
      });
      const r1 = applyTradeoffOption(db, {
        userId: USER,
        planId,
        option: shrink,
        rank: 1,
        options: [shrink],
      });
      expect(r1.task?.estMinutes).toBe(60);
      const huge = opt({
        task_id: task.id,
        kind: 'shrink',
        delta_minutes: 500,
        consequence: { metric: 'est_completion_drop', value: 0.9 },
      });
      expect(
        applyTradeoffOption(db, { userId: USER, planId, option: huge, rank: 1, options: [huge] })
          .task?.estMinutes,
      ).toBe(15);
      const move = opt({
        task_id: task.id,
        kind: 'move_past_deadline',
        delta_minutes: 45,
        consequence: { metric: 'deadline_slip_minutes', value: 45 },
      });
      const r3 = applyTradeoffOption(db, {
        userId: USER,
        planId,
        option: move,
        rank: 2,
        options: [move],
      });
      expect(r3.task?.deadline).toEqual(T('2026-09-02T18:45:00+03:00'));
      expect(allEvents(db).filter((e) => e.type === 'tradeoff_decision')).toHaveLength(3);
    } finally {
      close();
    }
  });

  it('unpin releases the pinned block to accepted through a recommendation_status op', () => {
    const { db, close } = openDb();
    try {
      const task = seedTask(db);
      const planId = seedPlan(db, task, 'pinned');
      const unpin = opt({
        task_id: task.id,
        kind: 'unpin',
        consequence: { metric: 'pinned_conflict', value: 1 },
      });
      const r = applyTradeoffOption(db, {
        userId: USER,
        planId,
        option: unpin,
        rank: 1,
        options: [unpin],
      });
      expect(r.task).toBeNull();
      expect(r.unpinned).toBe(`rec-${task.id}`);
      const rec = db
        .select()
        .from(recommendations)
        .where(eq(recommendations.id, `rec-${task.id}`))
        .get()!;
      expect(rec.status).toBe('accepted');
      const op = allOps(db).find((o) => o.opType === 'recommendation_status')!;
      expect(op.payload).toEqual({ id: rec.id, user_id: USER, status: 'accepted', version: 1 });
      expect(op.baseVersion).toBe(1);
    } finally {
      close();
    }
  });

  it('an option for a task that no longer exists throws before any write (the action layer falls back to reject)', () => {
    const { db, close } = openDb();
    try {
      const task = seedTask(db);
      const planId = seedPlan(db, task);
      const gone = opt({ task_id: '00000000-0000-4000-8000-00000000dead' });
      expect(() =>
        applyTradeoffOption(db, { userId: USER, planId, option: gone, rank: 1, options: [gone] }),
      ).toThrow(/not found/);
      expect(allEvents(db).filter((e) => e.type === 'tradeoff_decision')).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('rejecting every option logs the overload fact (UC-05 A1) and counts as decided', () => {
    const { db, close } = openDb();
    try {
      const task = seedTask(db);
      const planId = seedPlan(db, task);
      rejectTradeoffs(db, { userId: USER, planId, options: [opt({ task_id: task.id })] });
      const ev = allEvents(db).find((e) => e.type === 'tradeoff_rejected')!;
      expect(ev.payload).toEqual({
        plan_id: planId,
        options: [{ kind: 'drop', metric: 'value_forfeited' }],
      });
      expect(decidedPlanIds(tradeoffDecisionsQuery(db, USER).all()).has(planId)).toBe(true);
      expect(allOps(db).filter((o) => o.opType === 'task_upsert')).toHaveLength(1); // only createTask's
    } finally {
      close();
    }
  });
});
