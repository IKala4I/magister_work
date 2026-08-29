/**
 * The pull half on the device (File 05 §2 "merge pull payload in one transaction, advance
 * cursor"; ADR-0012 §5): one SQLite transaction per page; rows upsert by primary key; an entity
 * with an UNACKED local op is skipped (the push resolves it — pushing first is what makes this
 * safe); a pulled `displaced` placement (the final state — a pending one may still be worked,
 * facts beat plans) mirrors its task back to the Inbox (status only, through the outbox); a
 * completion that raced a meeting (`conflict_flag`) surfaces the File 05 §2 toast. Pure over
 * `LocalDb`, so `pull.test.ts` runs it on real SQLite.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { calendarEvents, opOutbox, plans, profiles, recommendations, tasks } from '../db/schema';
import { taskOpPayload } from '../db/tasks';
import type { TaskRow } from '../db/tasks';
import { enqueueOp } from '../db/writes';
import type { LocalDb } from '../db/writes';

import type { PullRow } from './types';

export interface PullReport {
  applied: number;
  skipped: number;
  /** Completions the server kept despite a concurrent meeting (File 05 §2 toast). */
  meetingsKept: number;
  /** Placements displaced by an imported meeting (task back to the Inbox). */
  displaced: number;
}

/** Only the FINAL displacement moves the task (adversarial #4): pending may still be worked. */
const DISPLACED = new Set(['displaced']);

const date = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? new Date(n) : null;
};
const dateReq = (v: unknown, fallback: Date): Date => date(v) ?? fallback;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

type OpType = (typeof opOutbox.$inferSelect)['opType'];

/** Entities with an unacked op of the given types — the push owns them for now. */
function pendingEntityIds(tx: LocalDb, opTypes: readonly OpType[]): Set<string> {
  const rows = tx
    .select({ entityId: opOutbox.entityId, payload: opOutbox.payload })
    .from(opOutbox)
    .where(and(inArray(opOutbox.opType, [...opTypes]), isNull(opOutbox.ackedAt)))
    .all() as Array<{ entityId: string | null; payload: unknown }>;
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.entityId !== null) ids.add(r.entityId);
    const id = (r.payload as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

function applyTask(tx: LocalDb, userId: string, row: Record<string, unknown>, now: Date): void {
  const id = str(row.id);
  if (id === null || row.user_id !== userId) return;
  const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow | undefined;
  const values = {
    id,
    userId,
    title: str(row.title) ?? existing?.title ?? '',
    category: (str(row.category) ?? existing?.category ?? 'admin') as TaskRow['category'],
    estMinutes: num(row.est_minutes) ?? existing?.estMinutes ?? 30,
    deadline: date(row.deadline),
    value: num(row.value) ?? existing?.value ?? 2,
    splittable: row.splittable === true,
    earliestStart: date(row.earliest_start),
    recurrence: row.recurrence ?? null,
    status: (str(row.status) ?? 'inbox') as TaskRow['status'],
    doneAt: date(row.done_at),
    postponeCount: num(row.postpone_count) ?? 0,
    // local-only counter survives the pull (never in the payload)
    skipStreak: existing?.skipStreak ?? 0,
    deletedAt: date(row.deleted_at),
    version: num(row.version) ?? 1,
    createdAt: dateReq(row.created_at, existing?.createdAt ?? now),
    updatedAt: dateReq(row.updated_at, now),
    serverSeq: num(row.server_seq),
  };
  if (existing) tx.update(tasks).set(values).where(eq(tasks.id, id)).run();
  else tx.insert(tasks).values(values).run();
}

function applyProfile(tx: LocalDb, userId: string, row: Record<string, unknown>, now: Date): void {
  if (row.user_id !== userId) return;
  const existing = tx.select().from(profiles).where(eq(profiles.userId, userId)).get();
  const values = {
    timezone: str(row.timezone) ?? 'UTC',
    locale: str(row.locale) ?? 'en',
    workingHours: row.working_hours ?? {},
    sleepWindow: row.sleep_window ?? {},
    rmeqScore: num(row.rmeq_score),
    chronotypeClass: str(row.chronotype_class) as 'DM' | 'MM' | 'INT' | 'ME' | 'DE' | null,
    surveySkipped: row.survey_skipped === true,
    topCategories: Array.isArray(row.top_categories) ? row.top_categories : [],
    onboardingCompletedAt: date(row.onboarding_completed_at),
    settings: row.settings ?? null,
    version: num(row.version) ?? 1,
    updatedAt: dateReq(row.updated_at, now),
    serverSeq: num(row.server_seq),
  };
  if (existing) tx.update(profiles).set(values).where(eq(profiles.userId, userId)).run();
  else
    tx.insert(profiles)
      .values({ userId, ...values })
      .run();
}

function applyPlan(tx: LocalDb, userId: string, row: Record<string, unknown>, now: Date): void {
  const id = str(row.id);
  if (id === null || row.user_id !== userId) return;
  const values = {
    id,
    userId,
    planDate: str(row.plan_date) ?? '',
    horizon: (str(row.horizon) ?? 'day') as 'day' | 'week',
    engine: (str(row.engine) ?? 'heuristic') as 'learned' | 'heuristic',
    modelVersion: str(row.model_version),
    arm: str(row.arm),
    solverStatus: str(row.solver_status),
    telemetry: row.telemetry ?? {},
    generatedAt: dateReq(row.generated_at, now),
    serverSeq: num(row.server_seq),
  };
  const existing = tx.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).get();
  if (existing) tx.update(plans).set(values).where(eq(plans.id, id)).run();
  else tx.insert(plans).values(values).run();
}

function applyRecommendation(
  tx: LocalDb,
  userId: string,
  row: Record<string, unknown>,
  now: Date,
  report: PullReport,
): void {
  const id = str(row.id);
  if (id === null || row.user_id !== userId) return;
  const existing = tx.select().from(recommendations).where(eq(recommendations.id, id)).get() as
    typeof recommendations.$inferSelect | undefined;
  const status = (str(row.status) ?? 'shown') as typeof recommendations.$inferSelect.status;
  const values = {
    id,
    userId,
    planId: str(row.plan_id) ?? existing?.planId ?? '',
    taskId: str(row.task_id) ?? existing?.taskId ?? '',
    chunkIndex: num(row.chunk_index) ?? 0,
    slotStart: dateReq(row.slot_start, existing?.slotStart ?? now),
    slotEnd: dateReq(row.slot_end, existing?.slotEnd ?? now),
    contextBucket: str(row.context_bucket) ?? existing?.contextBucket ?? '',
    features: Array.isArray(row.features) ? row.features : (existing?.features ?? null),
    qHat: num(row.q_hat),
    confidence: num(row.confidence),
    rationaleKey: str(row.rationale_key),
    rationaleParams: row.rationale_params ?? null,
    isExperiment: row.is_experiment === true,
    engine: str(row.engine) as 'learned' | 'heuristic' | null,
    modelVersion: str(row.model_version),
    status,
    attributedAt: date(row.attributed_at),
    propensity: num(row.propensity),
    conflictFlag: row.conflict_flag === true,
    version: num(row.version) ?? 1,
    createdAt: dateReq(row.created_at, existing?.createdAt ?? now),
    updatedAt: dateReq(row.updated_at, now),
    serverSeq: num(row.server_seq),
  };
  if (existing) tx.update(recommendations).set(values).where(eq(recommendations.id, id)).run();
  else tx.insert(recommendations).values(values).run();

  if (values.conflictFlag && status === 'completed' && !(existing?.conflictFlag ?? false)) {
    report.meetingsKept++;
  }
  if (DISPLACED.has(status) && !(existing && DISPLACED.has(existing.status))) {
    report.displaced++;
    // UC-09 / File 05 §2: the task returns to the Inbox for the next planning event — status
    // only (a displacement is not the user's postponement), through the outbox like every write
    const task = tx.select().from(tasks).where(eq(tasks.id, values.taskId)).get() as
      TaskRow | undefined;
    if (task && task.status === 'scheduled' && task.deletedAt === null) {
      const next: TaskRow = { ...task, status: 'inbox', version: task.version + 1, updatedAt: now };
      tx.update(tasks)
        .set({ status: 'inbox', version: next.version, updatedAt: now })
        .where(eq(tasks.id, task.id))
        .run();
      enqueueOp(tx, {
        opType: 'task_upsert',
        entityId: task.id,
        payload: taskOpPayload(next),
        baseVersion: task.version,
        now,
      });
    }
  }
}

function applyCalendarEvent(
  tx: LocalDb,
  userId: string,
  row: Record<string, unknown>,
  now: Date,
): void {
  const id = str(row.id);
  if (id === null || row.user_id !== userId) return;
  const values = {
    id,
    userId,
    source: str(row.source) ?? 'google',
    externalId: str(row.external_id) ?? id,
    startAt: dateReq(row.start_at, now),
    endAt: dateReq(row.end_at, now),
    title: str(row.title),
    busy: row.busy === true,
    deletedAt: date(row.deleted_at),
    updatedAt: dateReq(row.updated_at, now),
    serverSeq: num(row.server_seq),
  };
  const existing = tx
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .get();
  if (existing) tx.update(calendarEvents).set(values).where(eq(calendarEvents.id, id)).run();
  else tx.insert(calendarEvents).values(values).run();
}

/** Apply one pull page in one transaction. Idempotent: re-applying a page changes nothing. */
export function applyPull(
  db: LocalDb,
  input: { userId: string; rows: readonly PullRow[]; now?: Date },
): PullReport {
  const now = input.now ?? new Date();
  const report: PullReport = { applied: 0, skipped: 0, meetingsKept: 0, displaced: 0 };
  if (input.rows.length === 0) return report;
  db.transaction((tx) => {
    const pendingTasks = pendingEntityIds(tx, ['task_upsert', 'task_delete']);
    const pendingProfiles = pendingEntityIds(tx, ['profile_update']);
    const pendingRecs = pendingEntityIds(tx, ['recommendation_status']);
    for (const r of input.rows) {
      const id = typeof r.row.id === 'string' ? r.row.id : null;
      switch (r.tbl) {
        case 'tasks':
          if (id !== null && pendingTasks.has(id)) {
            report.skipped++;
            continue;
          }
          applyTask(tx, input.userId, r.row, now);
          break;
        case 'profiles':
          if (pendingProfiles.has(input.userId)) {
            report.skipped++;
            continue;
          }
          applyProfile(tx, input.userId, r.row, now);
          break;
        case 'plans':
          applyPlan(tx, input.userId, r.row, now);
          break;
        case 'recommendations':
          if (id !== null && pendingRecs.has(id)) {
            report.skipped++;
            continue;
          }
          applyRecommendation(tx, input.userId, r.row, now, report);
          break;
        case 'calendar_events':
          applyCalendarEvent(tx, input.userId, r.row, now);
          break;
        default:
          report.skipped++;
          continue;
      }
      report.applied++;
    }
  });
  return report;
}
