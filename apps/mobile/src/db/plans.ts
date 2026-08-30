/**
 * Plans + recommendations on the local mirror (FR-20/21/22, UC-03). Rows are SERVER-authored
 * (the plan-request edge function persists them; the client only mirrors — invariant 1: the
 * client renders and logs facts). Applying a plan is one transaction:
 *   plan row + recommendation rows + superseded rows → `expired` +
 *   `recommendation_shown` events (NFR-O1: model version, engine, experiment flag,
 *   propensity — never task text) + task status mirror (placed ⇒ `scheduled`, previously
 *   scheduled-but-unplaced ⇒ back to `inbox`), the latter through the outbox like every other
 *   task write so P8 replays it.
 */
import { and, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm';

import type { PlanRequestResponse, RecommendationRow as ServerRecommendation } from '../sync/types';

import { plans, recommendations, tasks } from './schema';
import { taskOpPayload } from './tasks';
import type { TaskRow } from './tasks';
import { appendEvent, enqueueOp } from './writes';
import type { LocalDb } from './writes';

export type PlanRow = typeof plans.$inferSelect;
export type RecommendationRow = typeof recommendations.$inferSelect;
export type PlanTrigger = 'first_open' | 'new_day' | 'manual' | 'evening_ritual';

export type UnplacedEntry = {
  task_id: string;
  reason: 'no_feasible_start' | 'deferred' | 'infeasible';
};

/** The user's most recent plan of any date — feeds the UC-03 trigger (first_open vs new_day). */
export function latestPlanAnyQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.horizon, 'day')))
    .orderBy(desc(plans.generatedAt))
    .limit(1);
}

/** Latest plan for a local day (the one the Today screen renders) — fed to useLiveRows. */
export function latestPlanQuery(db: LocalDb, userId: string, planDate: string) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.planDate, planDate), eq(plans.horizon, 'day')))
    .orderBy(desc(plans.generatedAt))
    .limit(1);
}

export function latestPlanForDay(
  db: LocalDb,
  userId: string,
  planDate: string,
): PlanRow | undefined {
  return latestPlanQuery(db, userId, planDate).get() as PlanRow | undefined;
}

/** Non-expired recommendations of one plan, in slot order — fed to useLiveRows. */
export function planRecommendationsQuery(db: LocalDb, planId: string) {
  return db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.planId, planId), ne(recommendations.status, 'expired')))
    .orderBy(recommendations.slotStart, recommendations.chunkIndex);
}

/**
 * Open placements starting in [from, to) across plans — what the FR-50 scheduler reminds about
 * (P10). Status filter happens in the pure planner; this just bounds the read.
 */
export function upcomingRecommendationsQuery(db: LocalDb, userId: string, from: Date, to: Date) {
  return db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        gte(recommendations.slotStart, from),
        lt(recommendations.slotStart, to),
      ),
    )
    .orderBy(recommendations.slotStart, recommendations.chunkIndex);
}

/** The `unplaced` list the edge function stored in plan telemetry (empty when absent). */
export function unplacedOf(plan: PlanRow | undefined): UnplacedEntry[] {
  const raw = (plan?.telemetry as { unplaced?: unknown } | null)?.unplaced;
  return Array.isArray(raw) ? (raw as UnplacedEntry[]) : [];
}

/** NFR-R2 provenance: true only for a fallback plan (never for the study's arm A). */
export function isFallbackPlan(plan: PlanRow | undefined): boolean {
  const reason = (plan?.telemetry as { ef?: { reason?: string } } | null)?.ef?.reason;
  return typeof reason === 'string' && reason.startsWith('fallback:');
}

function toLocalRecommendation(
  userId: string,
  r: ServerRecommendation,
): typeof recommendations.$inferInsert {
  return {
    id: r.id,
    userId,
    planId: r.plan_id,
    taskId: r.task_id,
    chunkIndex: r.chunk_index,
    slotStart: new Date(r.slot_start),
    slotEnd: new Date(r.slot_end),
    contextBucket: r.context_bucket,
    features: r.features,
    qHat: r.q_hat,
    confidence: r.confidence,
    rationaleKey: r.rationale_key,
    rationaleParams: r.rationale_params,
    isExperiment: r.is_experiment,
    engine: r.engine,
    modelVersion: r.model_version,
    status: 'shown',
    attributedAt: null,
    propensity: r.propensity,
    conflictFlag: r.conflict_flag,
    version: r.version,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    serverSeq: r.server_seq,
  };
}

export interface ApplyPlanInput {
  userId: string;
  response: Extract<PlanRequestResponse, { status: 'planned' }>;
  trigger: PlanTrigger;
  now?: Date;
}

/**
 * Mirror a `planned` response. Idempotent on the plan id (a replayed response is a no-op).
 * Returns the local plan row.
 */
export function applyPlanResponse(db: LocalDb, input: ApplyPlanInput): PlanRow {
  const now = input.now ?? new Date();
  const { userId, response } = input;
  const existing = db.select().from(plans).where(eq(plans.id, response.plan.id)).get() as
    PlanRow | undefined;
  if (existing) return existing;
  return db.transaction((tx) => {
    const planRow: typeof plans.$inferInsert = {
      id: response.plan.id,
      userId,
      planDate: response.plan.plan_date,
      horizon: response.plan.horizon,
      engine: response.plan.engine,
      modelVersion: response.plan.model_version,
      arm: response.plan.arm,
      solverStatus: response.plan.solver_status,
      telemetry: response.plan.telemetry,
      generatedAt: new Date(response.plan.generated_at),
      serverSeq: response.plan.server_seq,
    };
    tx.insert(plans).values(planRow).run();
    for (const r of response.recommendations) {
      tx.insert(recommendations).values(toLocalRecommendation(userId, r)).run();
    }
    if (response.expired_recommendation_ids.length > 0) {
      tx.update(recommendations)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            inArray(recommendations.id, response.expired_recommendation_ids),
            eq(recommendations.status, 'shown'),
          ),
        )
        .run();
    }

    // Task status mirror (File 02 §3.5: Inbox = unscheduled tasks). Placed ⇒ scheduled; a task
    // that was scheduled by a superseded plan and is now unplaced ⇒ inbox. Through the outbox.
    const placedIds = new Set(response.recommendations.map((r) => r.task_id));
    const unplacedIds = new Set(response.unplaced.map((u) => u.task_id));
    const rows = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.status, ['inbox', 'scheduled'])))
      .all() as Array<typeof tasks.$inferSelect>;
    for (const row of rows) {
      if (row.deletedAt !== null) continue;
      const next_ = placedIds.has(row.id) ? 'scheduled' : unplacedIds.has(row.id) ? 'inbox' : null;
      if (next_ === null || next_ === row.status) continue;
      const next: TaskRow = { ...row, status: next_, version: row.version + 1, updatedAt: now };
      tx.update(tasks)
        .set({ status: next.status, version: next.version, updatedAt: now })
        .where(eq(tasks.id, row.id))
        .run();
      // full server-shaped row like every other task op (P8 replays it unchanged)
      enqueueOp(tx, {
        opType: 'task_upsert',
        entityId: row.id,
        payload: taskOpPayload(next),
        baseVersion: row.version,
        now,
      });
    }

    // UC-03 post-condition: recommendation_shown with model version + feature snapshot ref.
    for (const r of response.recommendations) {
      appendEvent(tx, {
        userId,
        type: 'recommendation_shown',
        taskId: r.task_id,
        recommendationId: r.id,
        payload: {
          plan_id: r.plan_id,
          engine: r.engine,
          model_version: r.model_version,
          is_experiment: r.is_experiment,
          propensity: r.propensity,
          context_bucket: r.context_bucket,
          confidence: r.confidence,
          chunk_index: r.chunk_index,
        },
        context: { trigger: input.trigger, horizon: response.plan.horizon },
        now,
      });
    }
    return tx.select().from(plans).where(eq(plans.id, response.plan.id)).get() as PlanRow;
  });
}
