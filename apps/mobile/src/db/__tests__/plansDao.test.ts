/**
 * Plan mirror write path (P6): applying a `planned` response is one transaction that lands the
 * plan + recommendation rows exactly as served (every assignment field incl. M-01 propensity),
 * expires superseded rows, mirrors task status through the outbox, and appends one
 * `recommendation_shown` event per block with the NFR-O1 tag and no task text. Real SQLite
 * (better-sqlite3) on the committed migration bundle, like tasksDao.test.ts.
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
  applyPlanResponse,
  isFallbackPlan,
  latestPlanForDay,
  planRecommendationsQuery,
  unplacedOf,
} from '../plans';
import { events, opOutbox, plans, recommendations, tasks } from '../schema';
import { createTask } from '../tasks';
import type { LocalDb } from '../writes';
import type { PlanRequestResponse, RecommendationRow } from '../../sync/types';

const USER = 'local:test-user';
const NOW = new Date(2026, 7, 26, 8, 0);

function openDb(): { db: LocalDb; close: () => void } {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return { db: db as unknown as LocalDb, close: () => sqlite.close() };
}

type Ids = [string, string, string];

function seedTasks(db: LocalDb): Ids {
  const make = (title: string): string =>
    createTask(db, {
      userId: USER,
      draft: {
        title,
        category: 'deep',
        estMinutes: 60,
        value: 2,
        splittable: false,
        deadline: null,
        earliestStart: null,
      },
      meta: { source: 'form', nlParseUsed: false },
      now: NOW,
    }).id;
  return [make('write report'), make('expense sheet'), make('read paper')];
}

function rec(
  planId: string,
  taskId: string,
  over: Partial<RecommendationRow> = {},
): RecommendationRow {
  return {
    id: `rec-${planId}-${taskId}-${over.chunk_index ?? 0}`,
    user_id: 'srv-uid',
    plan_id: planId,
    task_id: taskId,
    chunk_index: 0,
    slot_start: '2026-08-26T06:00:00.000Z',
    slot_end: '2026-08-26T07:00:00.000Z',
    context_bucket: 'MO.wd.fresh',
    features: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0.66, 0, 0, 0, 0.5, 0.22, 0],
    q_hat: 0.6,
    confidence: 0.7,
    rationale_key: 'best_available',
    rationale_params: { category: 'deep', daypart: 'MO' },
    is_experiment: false,
    engine: 'learned',
    model_version: 'recsys-p5.0',
    status: 'shown',
    attributed_at: null,
    propensity: null,
    conflict_flag: false,
    version: 1,
    created_at: '2026-08-26T05:00:00.000Z',
    updated_at: '2026-08-26T05:00:00.000Z',
    server_seq: 100,
    ...over,
  };
}

function planned(
  planId: string,
  taskIds: Ids,
  over: Partial<Extract<PlanRequestResponse, { status: 'planned' }>> = {},
): Extract<PlanRequestResponse, { status: 'planned' }> {
  return {
    status: 'planned',
    plan: {
      id: planId,
      user_id: 'srv-uid',
      plan_date: '2026-08-26',
      horizon: 'day',
      engine: 'learned',
      model_version: 'recsys-p5.0',
      arm: null,
      solver_status: 'OPTIMAL',
      telemetry: {
        ef: {
          reason: 'learned',
          experiment: {
            task_id: taskIds[1],
            bucket_id: 'AF.wd.fresh',
            top_m: ['MO.wd.fresh', 'AF.wd.fresh'],
            propensity: 0.5,
            n_eligible: 2,
          },
        },
        unplaced: [{ task_id: taskIds[2], reason: 'deferred' }],
      },
      generated_at: '2026-08-26T05:00:00.000Z',
      server_seq: 99,
    },
    recommendations: [
      rec(planId, taskIds[0]),
      rec(planId, taskIds[1], {
        slot_start: '2026-08-26T11:00:00.000Z',
        slot_end: '2026-08-26T12:00:00.000Z',
        context_bucket: 'AF.wd.fresh',
        is_experiment: true,
        propensity: 0.5,
        rationale_key: 'experiment',
      }),
    ],
    unplaced: [{ task_id: taskIds[2], reason: 'deferred' }],
    infeasible: null,
    expired_recommendation_ids: [],
    ...over,
  };
}

describe('applyPlanResponse', () => {
  it('mirrors plan + recommendations verbatim and logs recommendation_shown per block', () => {
    const { db, close } = openDb();
    try {
      const ids = seedTasks(db);
      const plan = applyPlanResponse(db, {
        userId: USER,
        response: planned('plan-1', ids),
        trigger: 'first_open',
        now: NOW,
      });
      expect(plan.id).toBe('plan-1');
      expect(plan.engine).toBe('learned');
      expect(latestPlanForDay(db, USER, '2026-08-26')?.id).toBe('plan-1');
      const rows = planRecommendationsQuery(db, 'plan-1').all();
      expect(rows.map((r) => r.taskId)).toEqual([ids[0], ids[1]]);
      expect(rows[1]).toMatchObject({
        isExperiment: true,
        propensity: 0.5,
        contextBucket: 'AF.wd.fresh',
        modelVersion: 'recsys-p5.0',
        engine: 'learned',
        status: 'shown',
        userId: USER,
      });
      expect(rows[0]?.features).toHaveLength(17);
      expect(rows[0]?.slotStart).toEqual(new Date('2026-08-26T06:00:00.000Z'));
      const shown = db.select().from(events).where(eq(events.type, 'recommendation_shown')).all();
      expect(shown).toHaveLength(2);
      const experimentEvent = shown.find((e) => e.recommendationId === rows[1]?.id);
      expect(experimentEvent?.payload).toEqual({
        plan_id: 'plan-1',
        engine: 'learned',
        model_version: 'recsys-p5.0',
        is_experiment: true,
        propensity: 0.5,
        context_bucket: 'AF.wd.fresh',
        confidence: 0.7,
        chunk_index: 0,
      });
      expect(experimentEvent?.context).toMatchObject({ trigger: 'first_open', horizon: 'day' }); // + tz (P7)
      expect(JSON.stringify(shown)).not.toContain('write report');
      expect(unplacedOf(plan)).toEqual([{ task_id: ids[2], reason: 'deferred' }]);
      expect(isFallbackPlan(plan)).toBe(false);
    } finally {
      close();
    }
  });

  it('mirrors task status through the outbox: placed ⇒ scheduled, unplaced ⇒ inbox', () => {
    const { db, close } = openDb();
    try {
      const ids = seedTasks(db);
      applyPlanResponse(db, {
        userId: USER,
        response: planned('plan-1', ids),
        trigger: 'manual',
        now: NOW,
      });
      const status = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get()?.status;
      expect([status(ids[0]), status(ids[1]), status(ids[2])]).toEqual([
        'scheduled',
        'scheduled',
        'inbox',
      ]);
      const ops = db.select().from(opOutbox).where(eq(opOutbox.opType, 'task_upsert')).all();
      const statusOps = ops.filter(
        (op) => (op.payload as { status?: string }).status === 'scheduled',
      );
      expect(statusOps).toHaveLength(2);
      expect(statusOps[0]?.baseVersion).toBe(1);
      // a re-plan that drops task 1 sends it back to the inbox and expires the old row
      const replan = planned('plan-2', ids, {
        recommendations: [rec('plan-2', ids[0])],
        unplaced: [
          { task_id: ids[1], reason: 'deferred' },
          { task_id: ids[2], reason: 'deferred' },
        ],
        expired_recommendation_ids: [`rec-plan-1-${ids[0]}-0`, `rec-plan-1-${ids[1]}-0`],
      });
      applyPlanResponse(db, { userId: USER, response: replan, trigger: 'manual', now: NOW });
      expect([status(ids[0]), status(ids[1])]).toEqual(['scheduled', 'inbox']);
      expect(planRecommendationsQuery(db, 'plan-1').all()).toHaveLength(0);
      expect(
        db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, `rec-plan-1-${ids[1]}-0`))
          .get()?.status,
      ).toBe('expired');
      expect(latestPlanForDay(db, USER, '2026-08-26')?.id).toBe('plan-2');
    } finally {
      close();
    }
  });

  it('is idempotent on the plan id and flags fallback plans', () => {
    const { db, close } = openDb();
    try {
      const ids = seedTasks(db);
      const response = planned('plan-1', ids);
      (response.plan.telemetry as Record<string, unknown>).ef = { reason: 'fallback:timeout' };
      response.plan.engine = 'heuristic';
      applyPlanResponse(db, { userId: USER, response, trigger: 'new_day', now: NOW });
      applyPlanResponse(db, { userId: USER, response, trigger: 'new_day', now: NOW });
      expect(db.select().from(plans).all()).toHaveLength(1);
      expect(
        db.select().from(events).where(eq(events.type, 'recommendation_shown')).all(),
      ).toHaveLength(2);
      expect(isFallbackPlan(latestPlanForDay(db, USER, '2026-08-26'))).toBe(true);
      expect(isFallbackPlan(undefined)).toBe(false);
      expect(unplacedOf(undefined)).toEqual([]);
    } finally {
      close();
    }
  });
});
