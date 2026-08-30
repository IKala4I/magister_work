/**
 * FR-42 / UC-10 erasure from the device (ADR-0014 §8–§9): call `delete-account` under the user's
 * session; on the server's confirmation forget everything on this install — every mirrored row,
 * the outbox, the sync cursor, the insights cache, the notification ledger and every pending
 * notification — then drop the (now dead) session locally. The reference the server returns is
 * the user's proof of erasure (the `deletion_audit` id).
 */
import { supabase } from '../auth/client';
import { wipeLocalMirror } from '../auth/accountTransition';
import { db } from '../db/client';
import type { LocalDb } from '../db/writes';
import { clearAllNotifications } from '../notifications/setup';
import { track } from '../observability/analytics';
import { appStorage, StorageKeys } from '../storage/mmkv';
import { resetSyncCursor } from '../sync/cursor';
import { gcalStatus } from '../sync/gcal';
import { clearInsightsCache } from '../sync/insights';
import { invokeFunction } from '../sync/invoke';

export type DeleteResult =
  | { ok: true; reference: string; completedAt: string }
  | { ok: false; code: 'no_session' | 'offline' | 'failed' };

interface DeleteResponse {
  status: 'deleted';
  reference: string;
  completed_at: string;
}

export interface DeleteDeps {
  requestErasure(): Promise<
    { kind: 'ok'; data: DeleteResponse } | { kind: 'no-session' | 'offline' | 'failed' | 'http' }
  >;
  forgetLocal(): Promise<void>;
  hadCalendar: boolean;
}

export async function deleteAccount(deps: DeleteDeps): Promise<DeleteResult> {
  const res = await deps.requestErasure();
  if (res.kind !== 'ok' || res.data.status !== 'deleted') {
    return {
      ok: false,
      code:
        res.kind === 'no-session' ? 'no_session' : res.kind === 'offline' ? 'offline' : 'failed',
    };
  }
  track('account_deleted', { had_calendar: deps.hadCalendar }); // the install's last event
  await deps.forgetLocal();
  return { ok: true, reference: res.data.reference, completedAt: res.data.completed_at };
}

/** Everything this install remembers about the account (the server side is already gone). */
export async function forgetLocalState(): Promise<void> {
  await clearAllNotifications();
  wipeLocalMirror(db as unknown as LocalDb);
  resetSyncCursor();
  clearInsightsCache();
  appStorage.delete(StorageKeys.lastUserId);
  appStorage.delete(StorageKeys.lastSyncAt);
  appStorage.delete(StorageKeys.pendingWipeUserId);
  appStorage.delete(StorageKeys.remindersPromptDismissed);
  appStorage.delete(StorageKeys.lastNotificationResponse);
  if (supabase) {
    // the server already deleted the user; the token is dead — drop it locally only
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

export async function deleteAccountAction(): Promise<DeleteResult> {
  // categorical context for the last event; the server tears the connection down itself
  const status = await gcalStatus().catch(() => null);
  const hadCalendar = status !== null && status.ok && status.status.connected;
  return deleteAccount({
    requestErasure: async () => {
      const r = await invokeFunction<DeleteResponse>('delete-account', { mode: 'self' });
      return r.kind === 'ok' ? { kind: 'ok', data: r.data } : { kind: r.kind };
    },
    forgetLocal: forgetLocalState,
    hadCalendar,
  });
}
