/**
 * The binding contracts written down in P3 (src/sync/localUser.ts, src/sync/cursor.ts), plus
 * the P8 refinement (ADR-0012 §11):
 *
 * adoptLocalData — on FIRST sign-in (anonymous included), rewrite every row AND every
 * op_outbox payload whose user_id isLocalUserId() to the authenticated uid BEFORE any push;
 * missing the payload JSON would dead-letter the whole queue against RLS.
 *
 * wipeLocalMirror — on account CHANGE (a different uid signs in) with nothing unsynced, delete
 * the local mirror and reset the pull cursor: server_seq is a global sequence, so keeping the
 * old cursor would silently skip every row below the previous account's high-water mark.
 * Device identity and the op counter survive (op_ids must never be reused).
 *
 * Deferred wipe — when the previous account still has UNACKED ops, nothing is deleted: the
 * cursor resets, rows stay namespaced by user_id (every screen filters by currentUserId()),
 * the engine pushes only the signed-in identity's ops, and the Today banner offers Discard /
 * Keep. The previous account signing back in cancels the pending wipe.
 */
import { eq, isNull, like } from 'drizzle-orm';

import {
  calendarEvents,
  events,
  focusSessions,
  opOutbox,
  plans,
  profiles,
  recommendations,
  tasks,
} from '../db/schema';
import type { LocalDb } from '../db/writes';
import { useSyncStore } from '../state/sync';
import { appStorage, StorageKeys } from '../storage/mmkv';
import { resetSyncCursor } from '../sync/cursor';
import { isLocalUserId, LOCAL_USER_PREFIX } from '../sync/localUser';

const USER_TABLES = [
  tasks,
  recommendations,
  events,
  profiles,
  focusSessions,
  plans,
  calendarEvents,
] as const;

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
    for (const table of USER_TABLES) {
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
    for (const table of USER_TABLES) tx.delete(table).run();
  });
  resetSyncCursor();
}

/** Unacked ops that belong to `userId` (payload user_id; status ops carry none and count for nobody). */
export function unackedOpsFor(db: LocalDb, userId: string): number {
  const rows = db
    .select({ payload: opOutbox.payload })
    .from(opOutbox)
    .where(isNull(opOutbox.ackedAt))
    .all() as Array<{ payload: unknown }>;
  return rows.filter((r) => (r.payload as { user_id?: unknown } | null)?.user_id === userId).length;
}

/** Delete one identity's rows and ops; the other identities' data stays. */
export function wipeRowsOf(db: LocalDb, userId: string): void {
  db.transaction((tx) => {
    const ops = tx
      .select({ seq: opOutbox.seq, payload: opOutbox.payload })
      .from(opOutbox)
      .all() as Array<{ seq: number; payload: unknown }>;
    for (const op of ops) {
      if ((op.payload as { user_id?: unknown } | null)?.user_id === userId) {
        tx.delete(opOutbox).where(eq(opOutbox.seq, op.seq)).run();
      }
    }
    for (const table of USER_TABLES) tx.delete(table).where(eq(table.userId, userId)).run();
  });
}

/**
 * Account change (ADR-0012 §11): wipe now when nothing of the previous account is unsynced;
 * otherwise defer — reset the cursor only, remember the previous uid, surface the banner.
 */
export function transitionToAccount(db: LocalDb, previousUserId: string): void {
  const pending = unackedOpsFor(db, previousUserId);
  if (pending === 0) {
    wipeLocalMirror(db);
    return;
  }
  resetSyncCursor();
  appStorage.set(StorageKeys.pendingWipeUserId, previousUserId);
  useSyncStore.setState({ pendingWipe: { userId: previousUserId, ops: pending } });
}

export function pendingWipeUserId(): string | null {
  return appStorage.getString(StorageKeys.pendingWipeUserId) ?? null;
}

/** Re-surface (or clear) a deferred wipe at sign-in; the owner signing back in cancels it. */
export function reconcilePendingWipe(db: LocalDb, signedInUserId: string): void {
  const pending = pendingWipeUserId();
  if (pending === null) return;
  if (pending === signedInUserId) {
    appStorage.delete(StorageKeys.pendingWipeUserId);
    useSyncStore.setState({ pendingWipe: null });
    return;
  }
  const ops = unackedOpsFor(db, pending);
  if (ops === 0) {
    // everything of theirs already synced (or was discarded): nothing left to protect
    wipeRowsOf(db, pending);
    appStorage.delete(StorageKeys.pendingWipeUserId);
    useSyncStore.setState({ pendingWipe: null });
    return;
  }
  useSyncStore.setState({ pendingWipe: { userId: pending, ops } });
}

/** Banner "Discard them": drop the previous account's rows and ops. */
export function discardPendingWipe(db: LocalDb): void {
  const pending = pendingWipeUserId();
  if (pending !== null) wipeRowsOf(db, pending);
  appStorage.delete(StorageKeys.pendingWipeUserId);
  useSyncStore.setState({ pendingWipe: null });
}

/** Banner "Keep for now": the rows stay namespaced; the question is not asked again. */
export function keepPendingWipe(): void {
  appStorage.delete(StorageKeys.pendingWipeUserId);
  useSyncStore.setState({ pendingWipe: null });
}
