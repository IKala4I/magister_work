/**
 * P6 bridge push for TASK rows (mirrors src/sync/profilePush.ts, ADR-0006 pattern): the
 * plan-request edge function assembles its context from the SERVER's tasks table, and until
 * P8's op-replay engine lands, nothing else moves tasks off the device. So before every plan
 * request the pending `task_upsert`/`task_delete` ops are drained by upserting the CURRENT
 * local row of each touched task (newest state supersedes queued history; all pending ops of
 * that task are acked together). Own rows only, through RLS with the user's JWT — no service
 * key on the client (NFR-S1). Last-write-wins; P8 replaces this with base_version replay.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { supabase } from '../auth/client';
import { db } from '../db/client';
import { opOutbox, tasks } from '../db/schema';
import type { TaskRow } from '../db/tasks';
import type { LocalDb } from '../db/writes';

export type TaskPushResult = 'pushed' | 'nothing-pending' | 'no-session' | 'failed';

function serverRow(row: TaskRow) {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    category: row.category,
    est_minutes: row.estMinutes,
    deadline: row.deadline?.toISOString() ?? null,
    value: row.value,
    splittable: row.splittable,
    earliest_start: row.earliestStart?.toISOString() ?? null,
    recurrence: row.recurrence as never,
    status: row.status,
    done_at: row.doneAt?.toISOString() ?? null,
    postpone_count: row.postponeCount,
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export async function pushTasksIfPossible(): Promise<TaskPushResult> {
  if (!supabase) return 'no-session';
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return 'no-session';

  const localDb = db as unknown as LocalDb;
  const pending = localDb
    .select()
    .from(opOutbox)
    .where(and(inArray(opOutbox.opType, ['task_upsert', 'task_delete']), isNull(opOutbox.ackedAt)))
    .all();
  if (pending.length === 0) return 'nothing-pending';

  const ids = [
    ...new Set(pending.map((op) => op.entityId).filter((id): id is string => id !== null)),
  ];
  const rows = (
    ids.length === 0
      ? []
      : (localDb.select().from(tasks).where(inArray(tasks.id, ids)).all() as TaskRow[])
  ).filter((row) => row.userId === uid);
  if (rows.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .upsert(rows.map(serverRow), { onConflict: 'id' });
    if (error) {
      const newest = pending[pending.length - 1];
      if (newest) {
        localDb
          .update(opOutbox)
          .set({ attempts: newest.attempts + 1, lastError: error.message })
          .where(eq(opOutbox.seq, newest.seq))
          .run();
      }
      return 'failed';
    }
  }
  const now = new Date();
  const pushedIds = new Set(rows.map((r) => r.id));
  localDb.transaction((tx) => {
    for (const op of pending) {
      // Ops whose row belongs to another identity (pre-adopt placeholder) stay queued.
      if (op.entityId !== null && !pushedIds.has(op.entityId)) continue;
      tx.update(opOutbox).set({ sentAt: now, ackedAt: now }).where(eq(opOutbox.seq, op.seq)).run();
    }
  });
  return 'pushed';
}
