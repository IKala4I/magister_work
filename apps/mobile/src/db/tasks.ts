/**
 * Task CRUD (FR-10) on the local mirror — offline-first by construction (NFR-R1):
 * every mutation is one SQLite transaction containing the task row, its sync op, and
 * (on create) the `task_created` event. Deletes are soft (`deleted_at` tombstone) so
 * "undo" within the 6-second window (File 02 §3 — destructive actions undoable) is a
 * second first-class op, not a timing game: both ops replay idempotently in P8.
 */
import { randomUUID } from 'expo-crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { tasks, TASK_CATEGORIES } from './schema';
import { appendEvent, enqueueOp } from './writes';
import type { LocalDb } from './writes';

export type TaskRow = typeof tasks.$inferSelect;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/** All user-editable FR-10 fields. */
export type TaskDraft = {
  title: string;
  category: TaskCategory;
  estMinutes: number;
  /** Value/priority 1–3 (FR-10). */
  value: number;
  splittable: boolean;
  deadline: Date | null;
  earliestStart: Date | null;
};

export type QuickAddMeta = {
  source: 'quick_add' | 'form';
  nlParseUsed: boolean;
};

export function assertValidDraft(draft: TaskDraft): void {
  if (draft.title.trim().length === 0) throw new Error('task title must not be empty');
  if (!Number.isInteger(draft.estMinutes) || draft.estMinutes <= 0) {
    throw new Error('estimated minutes must be a positive integer');
  }
  if (!Number.isInteger(draft.value) || draft.value < 1 || draft.value > 3) {
    throw new Error('value must be 1, 2, or 3');
  }
  if (draft.deadline && draft.earliestStart && draft.earliestStart > draft.deadline) {
    throw new Error('earliest start must not be after the deadline');
  }
}

/** Server-shaped op payload (snake_case, epoch-ms) so P8 replays without renaming. */
export function taskOpPayload(row: TaskRow): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    category: row.category,
    est_minutes: row.estMinutes,
    deadline: row.deadline?.getTime() ?? null,
    value: row.value,
    splittable: row.splittable,
    earliest_start: row.earliestStart?.getTime() ?? null,
    recurrence: row.recurrence ?? null,
    status: row.status,
    done_at: row.doneAt?.getTime() ?? null,
    postpone_count: row.postponeCount,
    deleted_at: row.deletedAt?.getTime() ?? null,
    version: row.version,
    created_at: row.createdAt.getTime(),
    updated_at: row.updatedAt.getTime(),
  };
}

export function createTask(
  db: LocalDb,
  input: { userId: string; draft: TaskDraft; meta: QuickAddMeta; now?: Date },
): TaskRow {
  assertValidDraft(input.draft);
  const now = input.now ?? new Date();
  const row: TaskRow = {
    id: randomUUID(),
    userId: input.userId,
    title: input.draft.title.trim(),
    category: input.draft.category,
    estMinutes: input.draft.estMinutes,
    deadline: input.draft.deadline,
    value: input.draft.value,
    splittable: input.draft.splittable,
    earliestStart: input.draft.earliestStart,
    recurrence: null,
    status: 'inbox',
    doneAt: null,
    postponeCount: 0,
    deletedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    serverSeq: null,
  };
  db.transaction((tx) => {
    tx.insert(tasks).values(row).run();
    enqueueOp(tx, {
      opType: 'task_upsert',
      entityId: row.id,
      payload: taskOpPayload(row),
      baseVersion: null, // create: no concurrency base to check
      now,
    });
    // Behavioral fact (UC-02 post-condition). Categorical only — never the title (NFR-S3).
    appendEvent(tx, {
      userId: row.userId,
      type: 'task_created',
      taskId: row.id,
      payload: {
        source: input.meta.source,
        nl_parse_used: input.meta.nlParseUsed,
        category: row.category,
        est_minutes: row.estMinutes,
        has_deadline: row.deadline !== null,
        has_earliest_start: row.earliestStart !== null,
        value: row.value,
        splittable: row.splittable,
      },
      now,
    });
  });
  return row;
}

function requireTask(tx: LocalDb, id: string): TaskRow {
  const row = tx.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow | undefined;
  if (row === undefined) throw new Error(`task ${id} not found`);
  return row;
}

export function updateTask(
  db: LocalDb,
  input: { id: string; draft: TaskDraft; now?: Date },
): TaskRow {
  assertValidDraft(input.draft);
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const current = requireTask(tx, input.id);
    if (current.deletedAt !== null) throw new Error(`task ${input.id} is deleted`);
    const next: TaskRow = {
      ...current,
      title: input.draft.title.trim(),
      category: input.draft.category,
      estMinutes: input.draft.estMinutes,
      deadline: input.draft.deadline,
      value: input.draft.value,
      splittable: input.draft.splittable,
      earliestStart: input.draft.earliestStart,
      version: current.version + 1,
      updatedAt: now,
    };
    tx.update(tasks)
      .set({
        title: next.title,
        category: next.category,
        estMinutes: next.estMinutes,
        deadline: next.deadline,
        value: next.value,
        splittable: next.splittable,
        earliestStart: next.earliestStart,
        version: next.version,
        updatedAt: next.updatedAt,
      })
      .where(eq(tasks.id, input.id))
      .run();
    enqueueOp(tx, {
      opType: 'task_upsert',
      entityId: next.id,
      payload: taskOpPayload(next),
      baseVersion: current.version,
      now,
    });
    return next;
  });
}

export function softDeleteTask(db: LocalDb, input: { id: string; now?: Date }): TaskRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const current = requireTask(tx, input.id);
    if (current.deletedAt !== null) return current; // idempotent
    const next: TaskRow = {
      ...current,
      deletedAt: now,
      version: current.version + 1,
      updatedAt: now,
    };
    tx.update(tasks)
      .set({ deletedAt: now, version: next.version, updatedAt: now })
      .where(eq(tasks.id, input.id))
      .run();
    enqueueOp(tx, {
      opType: 'task_delete',
      entityId: next.id,
      payload: {
        id: next.id,
        user_id: next.userId,
        deleted_at: now.getTime(),
        version: next.version,
      },
      baseVersion: current.version,
      now,
    });
    return next;
  });
}

/** Undo within the 6 s window (File 02 §3) — a first-class restore op, not a rollback. */
export function restoreTask(db: LocalDb, input: { id: string; now?: Date }): TaskRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const current = requireTask(tx, input.id);
    if (current.deletedAt === null) return current; // idempotent
    const next: TaskRow = {
      ...current,
      deletedAt: null,
      version: current.version + 1,
      updatedAt: now,
    };
    tx.update(tasks)
      .set({ deletedAt: null, version: next.version, updatedAt: now })
      .where(eq(tasks.id, input.id))
      .run();
    enqueueOp(tx, {
      opType: 'task_upsert',
      entityId: next.id,
      payload: taskOpPayload(next),
      baseVersion: current.version,
      now,
    });
    return next;
  });
}

/** Every live task of a user (Today needs titles for scheduled tasks; P6). */
export function activeTasksQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
}

/** Inbox list (FR-10 read path) — also the query fed to useLiveQuery on the Inbox tab. */
export function inboxTasksQuery(db: LocalDb) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, 'inbox'), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.createdAt));
}
