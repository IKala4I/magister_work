/**
 * Who owns new local rows right now. Resolution order:
 *   1. live session uid (signed in),
 *   2. last authenticated uid (signed out but this device's data belongs to them),
 *   3. the pre-auth local placeholder (src/sync/localUser.ts) — first launch only.
 * The account-transition contract (src/auth/accountTransition.ts) keeps 1↔3 consistent.
 */
import { appStorage, StorageKeys } from '../storage/mmkv';
import { getLocalUserId } from '../sync/localUser';

import { useSessionStore } from './session';

export function getLastUserId(): string | null {
  return appStorage.getString(StorageKeys.lastUserId) ?? null;
}

export function setLastUserId(userId: string): void {
  appStorage.set(StorageKeys.lastUserId, userId);
}

export function currentUserId(): string {
  return useSessionStore.getState().userId ?? getLastUserId() ?? getLocalUserId();
}
