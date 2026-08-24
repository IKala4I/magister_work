/**
 * Pull cursor for push-then-pull sync (invariant 8; specs/07 §4): the cursor is
 * "max `server_seq` seen", so it only ever advances — a stale pull can never rewind it.
 * server_seq is a Postgres bigint; JS numbers are exact to 2^53-1, far beyond any
 * realistic sequence value, and the guard below refuses non-integers outright.
 *
 * ACCOUNT-SCOPE CONTRACT (P4/P8 — binding): this cursor is install-scoped. `sync_seq` is a
 * GLOBAL server sequence, so when auth lands, any account change (sign-out, sign-in as a
 * different user, anonymous→full conversion to a DIFFERENT uid) MUST call resetSyncCursor()
 * (and wipe the local mirror) — otherwise the new account silently skips every row below
 * the previous account's cursor. Recorded in docs/HANDOFF.md; P4 must test this path.
 */
import { appStorage, StorageKeys } from '../storage/mmkv';

/** 0 means "never synced" — the first pull fetches everything. */
export function getSyncCursor(): number {
  return appStorage.getNumber(StorageKeys.syncCursor) ?? 0;
}

/**
 * Max-semantics advance: returns the cursor after the call. Values at or below the
 * current cursor are ignored (idempotent replay of an old pull is a no-op).
 */
export function advanceSyncCursor(serverSeq: number): number {
  if (!Number.isSafeInteger(serverSeq) || serverSeq < 0) {
    throw new RangeError(`server_seq must be a non-negative safe integer, got ${serverSeq}`);
  }
  const current = getSyncCursor();
  if (serverSeq <= current) return current;
  appStorage.set(StorageKeys.syncCursor, serverSeq);
  return serverSeq;
}

/** Full local resync (sign-out, integrity failure). Deliberately explicit — never automatic. */
export function resetSyncCursor(): void {
  appStorage.delete(StorageKeys.syncCursor);
}
