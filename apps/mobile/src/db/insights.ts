/**
 * P9 trust-surface FACTS on the local mirror (FR-24, FR-33, FR-41, UC-05, UC-08; ADR-0013).
 * The client is a fact logger (invariant 1): a belief toggle is an append-only `belief_label`
 * event through the outbox — the server materialises it into a correction and the service
 * rebuilds; nothing here computes or caches model state. A trade-off decision is the chosen
 * option applied as an ordinary task edit (class-2 op) plus a `tradeoff_decision` fact; "keep as
 * is" is a `tradeoff_rejected` fact. Every write is one SQLite transaction.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import type { BeliefLabel, Daypart, DayType } from '../domain/heatmap';
import type { TradeOffOption } from '../domain/tradeoff';
import type { TaskCategory } from './tasks';

import { events, recommendations, tasks } from './schema';
import { taskOpPayload } from './tasks';
import type { TaskRow } from './tasks';
import { appendEvent, enqueueOp } from './writes';
import type { LocalDb } from './writes';

export type EventRow = typeof events.$inferSelect;

export const stateRefOf = (category: TaskCategory, daypart: Daypart, dayType: DayType) =>
  `beta:${category}.${daypart}.${dayType}`;

// --- FR-41 / FR-33 belief labels ---------------------------------------------------------------

/** Local `belief_label` events, newest first (feeds useLiveRows for the toggle state). */
export function beliefLabelsQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, 'belief_label')))
    .orderBy(desc(events.clientTs), desc(events.localId));
}

export interface LocalLabel {
  label: BeliefLabel;
  at: number;
  /** Not yet acknowledged by the server (server_ts is set when the op is acked). */
  pending: boolean;
}

/** The label in force per state_ref from the device's own facts (latest wins). */
export function latestLocalLabels(rows: readonly EventRow[]): Map<string, LocalLabel> {
  const out = new Map<string, LocalLabel>();
  for (const r of rows) {
    const p = (r.payload ?? {}) as { state_ref?: unknown; label?: unknown };
    if (typeof p.state_ref !== 'string') continue;
    const label = p.label;
    if (label !== 'correct' && label !== 'incorrect' && label !== 'none') continue;
    const at = r.clientTs.getTime();
    const cur = out.get(p.state_ref);
    if (cur === undefined || at > cur.at) {
      out.set(p.state_ref, { label, at, pending: r.serverTs === null });
    }
  }
  return out;
}

export function labelBelief(
  db: LocalDb,
  input: {
    userId: string;
    stateRef: string;
    label: BeliefLabel;
    surface: 'beliefs' | 'review' | 'picker';
    now?: Date;
  },
): string {
  if (
    !/^beta:(deep|admin|physical|learning)\.(EM|MO|MD|AF|EV|NT)\.(weekday|weekend)$/.test(
      input.stateRef,
    )
  ) {
    throw new Error(`invalid state_ref ${input.stateRef}`);
  }
  const now = input.now ?? new Date();
  return db.transaction((tx) =>
    appendEvent(tx, {
      userId: input.userId,
      type: 'belief_label',
      payload: { state_ref: input.stateRef, label: input.label, surface: input.surface },
      now,
    }),
  );
}

// --- UC-08 weekly review ---------------------------------------------------------------------

export function weeklyReviewsQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, 'weekly_review_completed')))
    .orderBy(desc(events.clientTs))
    .limit(1);
}

export function recordWeeklyReview(
  db: LocalDb,
  input: {
    userId: string;
    week: string;
    learnings: number;
    labelsSet: number;
    trend: 'up' | 'down' | 'flat' | null;
    now?: Date;
  },
): string {
  const now = input.now ?? new Date();
  return db.transaction((tx) =>
    appendEvent(tx, {
      userId: input.userId,
      type: 'weekly_review_completed',
      payload: {
        week: input.week,
        learnings: input.learnings,
        labels_set: input.labelsSet,
        trend: input.trend,
      },
      now,
    }),
  );
}

// --- FR-24 / UC-05 trade-off decisions ------------------------------------------------------

export function tradeoffDecisionsQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.type, ['tradeoff_decision', 'tradeoff_rejected']),
      ),
    )
    .orderBy(desc(events.clientTs))
    .limit(50);
}

/** Plan ids whose sheet was already answered (chosen or rejected) on this device. */
export function decidedPlanIds(rows: readonly EventRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const p = (r.payload ?? {}) as { plan_id?: unknown };
    if (typeof p.plan_id === 'string') out.add(p.plan_id);
  }
  return out;
}

function requireTask(tx: LocalDb, id: string): TaskRow {
  const row = tx.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow | undefined;
  if (row === undefined) throw new Error(`task ${id} not found`);
  return row;
}

function writeTask(tx: LocalDb, current: TaskRow, patch: Partial<TaskRow>, now: Date): TaskRow {
  const next: TaskRow = { ...current, ...patch, version: current.version + 1, updatedAt: now };
  tx.update(tasks)
    .set({ ...patch, version: next.version, updatedAt: now })
    .where(eq(tasks.id, current.id))
    .run();
  enqueueOp(tx, {
    opType: 'task_upsert',
    entityId: current.id,
    payload: taskOpPayload(next),
    baseVersion: current.version,
    now,
  });
  return next;
}

/** Local midnight of the day after `now` (a dropped task is "not today", File 02 FR-24). */
export function nextDayStart(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

const MS_PER_MINUTE = 60_000;

/**
 * Apply the chosen option as the matching task edit and log the decision. Returns what changed
 * so the caller can explain it. `unpin` releases the task's pinned block back to `accepted`.
 */
export function applyTradeoffOption(
  db: LocalDb,
  input: {
    userId: string;
    planId: string;
    option: TradeOffOption;
    rank: number;
    options: readonly TradeOffOption[];
    now?: Date;
  },
): { task: TaskRow | null; unpinned: string | null } {
  const now = input.now ?? new Date();
  const { option } = input;
  return db.transaction((tx) => {
    let task: TaskRow | null = null;
    let unpinned: string | null = null;
    switch (option.kind) {
      case 'drop': {
        const current = requireTask(tx, option.task_id);
        task = writeTask(
          tx,
          current,
          {
            earliestStart: nextDayStart(now),
            postponeCount: current.postponeCount + 1,
            status: current.status === 'scheduled' ? 'inbox' : current.status,
          },
          now,
        );
        break;
      }
      case 'shrink': {
        const current = requireTask(tx, option.task_id);
        const delta = Math.max(option.delta_minutes ?? 0, 0);
        task = writeTask(
          tx,
          current,
          { estMinutes: Math.max(current.estMinutes - delta, 15) },
          now,
        );
        break;
      }
      case 'move_past_deadline': {
        const current = requireTask(tx, option.task_id);
        const slip = Math.max(option.delta_minutes ?? 0, 15);
        const base = current.deadline ?? now;
        task = writeTask(
          tx,
          current,
          { deadline: new Date(base.getTime() + slip * MS_PER_MINUTE) },
          now,
        );
        break;
      }
      case 'unpin': {
        const pinned = tx
          .select()
          .from(recommendations)
          .where(
            and(
              eq(recommendations.taskId, option.task_id),
              eq(recommendations.planId, input.planId),
              eq(recommendations.status, 'pinned'),
            ),
          )
          .all() as Array<typeof recommendations.$inferSelect>;
        for (const rec of pinned) {
          tx.update(recommendations)
            .set({ status: 'accepted', updatedAt: now })
            .where(eq(recommendations.id, rec.id))
            .run();
          enqueueOp(tx, {
            opType: 'recommendation_status',
            entityId: rec.id,
            payload: { id: rec.id, user_id: rec.userId, status: 'accepted', version: rec.version },
            baseVersion: rec.version,
            now,
          });
          unpinned = rec.id;
        }
        break;
      }
    }
    appendEvent(tx, {
      userId: input.userId,
      type: 'tradeoff_decision',
      taskId: option.task_id,
      payload: {
        plan_id: input.planId,
        kind: option.kind,
        rank: input.rank,
        delta_minutes: option.delta_minutes,
        consequence: option.consequence,
        // the alternatives the user saw, by kind — categorical only (NFR-S3)
        alternatives: input.options.map((o) => ({ kind: o.kind, metric: o.consequence.metric })),
      },
      now,
    });
    return { task, unpinned };
  });
}

/** UC-05 A1: the user rejects every option — manual edit mode; the overload state is logged. */
export function rejectTradeoffs(
  db: LocalDb,
  input: { userId: string; planId: string; options: readonly TradeOffOption[]; now?: Date },
): string {
  const now = input.now ?? new Date();
  return db.transaction((tx) =>
    appendEvent(tx, {
      userId: input.userId,
      type: 'tradeoff_rejected',
      payload: {
        plan_id: input.planId,
        options: input.options.map((o) => ({ kind: o.kind, metric: o.consequence.metric })),
      },
      now,
    }),
  );
}
