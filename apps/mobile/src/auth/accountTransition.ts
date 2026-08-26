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
    // profiles is keyed by user_id: if a row for newUserId already coexists with a stale
    // local: row (a previously failed adopt followed by re-onboarding under the uid), the
    // rewrite would hit the PK and fail on EVERY launch (finding m7). The uid row is the
    // newer, authoritative one — drop the placeholder row instead of colliding.
    if (
      tx
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.userId, newUserId))
        .get()
    ) {
      tx.delete(profiles)
        .where(like(profiles.userId, `${LOCAL_USER_PREFIX}%`))
        .run();
    }
    for (const table of [tasks, recommendations, events, profiles] as const) {
      tx.update(table)
        .set({ userId: newUserId })
        .where(like(table.userId, `${LOCAL_USER_PREFIX}%`))
        .run();
    }
    const ops = tx
      .select({ seq: opOutbox.seq, payload: opOutbox.payload, entityId: opOutbox.entityId })
      .from(opOutbox)
      .all() as { seq: number; payload: unknown; entityId: string | null }[];
    for (const op of ops) {
      const payload = op.payload as Record<string, unknown> | null;
      const payloadIsLocal =
        payload != null && typeof payload.user_id === 'string' && isLocalUserId(payload.user_id);
      const entityIsLocal = op.entityId != null && isLocalUserId(op.entityId);
      if (payloadIsLocal || entityIsLocal) {
        tx.update(opOutbox)
          .set({
            payload: payloadIsLocal ? { ...payload, user_id: newUserId } : payload,
            entityId: entityIsLocal ? newUserId : op.entityId,
          })
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
