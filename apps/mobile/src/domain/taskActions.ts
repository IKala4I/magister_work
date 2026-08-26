/**
 * UI-facing task actions: DAO write (SQLite + outbox + event — the durable facts) plus
 * the PostHog mirror of `task_created` (NFR-O1 telemetry; categorical only, NFR-S3).
 * Imports the device database, so tests exercise the DAO directly (src/db/tasks.ts) and
 * mock this module in component tests.
 */
import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { createTask, restoreTask, softDeleteTask, updateTask } from '../db/tasks';
import type { QuickAddMeta, TaskDraft, TaskRow } from '../db/tasks';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';

const localDb = db as unknown as LocalDb;

export function createTaskAction(draft: TaskDraft, meta: QuickAddMeta): TaskRow {
  const row = createTask(localDb, { userId: currentUserId(), draft, meta });
  track('task_created', {
    source: meta.source,
    nl_parse_used: meta.nlParseUsed,
    has_deadline: draft.deadline !== null,
    has_duration: true, // estMinutes is required by FR-10; kept for catalog stability
  });
  return row;
}

export function updateTaskAction(id: string, draft: TaskDraft): TaskRow {
  return updateTask(localDb, { id, draft });
}

export function deleteTaskAction(id: string): TaskRow {
  return softDeleteTask(localDb, { id });
}

export function restoreTaskAction(id: string): TaskRow {
  return restoreTask(localDb, { id });
}
