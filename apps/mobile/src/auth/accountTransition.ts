/**
 * The two binding contracts written down in P3 (src/sync/localUser.ts, src/sync/cursor.ts):
 *
 * adoptLocalData — on FIRST sign-in (anonymous included), rewrite every row AND every
 * op_outbox payload whose user_id isLocalUserId() to the authenticated uid BEFORE any push;
 * missing the payload JSON would dead-letter the whole queue against RLS.
 *
 * wipeLocalMirror — on account CHANGE (a different uid signs in), delete the local mirror
 * and reset the pull cursor: server_seq is a global sequence, so keeping the old cursor
 * would silently skip every row below the previous account's high-water mark. Device
 * identity and the op counter survive (op_ids must never be reused).
 */
import { eq, like } from 'drizzle-orm';

import { events, opOutbox, profiles, recommendations, tasks } from '../db/schema';
import type { LocalDb } from '../db/writes';
import { resetSyncCursor } from '../sync/cursor';
import { isLocalUserId, LOCAL_USER_PREFIX } from '../sync/localUser';

/** Rewrite pre-auth placeholder ownership to `newUserId`. Idempotent. */
export function adoptLocalData(db: LocalDb, newUserId: string): void {
  db.transaction((tx) => {
    for (const table of [tasks, recommendations, events, profiles] as const) {
      tx.update(table)
        .set({ userId: newUserId })
        .where(like(table.userId, `${LOCAL_USER_PREFIX}%`))
        .run();
    }
    const ops = tx
      .select({ seq: opOutbox.seq, payload: opOutbox.payload })
      .from(opOutbox)
      .all() as { seq: number; payload: unknown }[];
    for (const op of ops) {
      const payload = op.payload as Record<string, unknown> | null;
      if (payload && typeof payload.user_id === 'string' && isLocalUserId(payload.user_id)) {
        tx.update(opOutbox)
          .set({ payload: { ...payload, user_id: newUserId } })
          .where(eq(opOutbox.seq, op.seq))
          .run();
      }
    }
  });
}

/**
 * Destroy this device's mirror + queue + cursor. Only for a DIFFERENT uid signing in —
 * never on plain sign-out (the data still belongs to the last account on this device).
 */
export function wipeLocalMirror(db: LocalDb): void {
  db.transaction((tx) => {
    tx.delete(opOutbox).run();
    tx.delete(events).run();
    tx.delete(recommendations).run();
    tx.delete(tasks).run();
    tx.delete(profiles).run();
  });
  resetSyncCursor();
}
