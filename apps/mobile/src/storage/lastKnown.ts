/**
 * A native or network tri-state ("is the calendar connected?", "is the reminder permission
 * granted?") is `null` until its first asynchronous read. Rendering `null` as the NEGATIVE
 * branch shows a wrong state for a frame on every open — Settings flashed "Connect Google
 * Calendar" over a connected calendar, the reminders switch flashed OFF, on both platforms
 * (hardware pass 2026-09-07 item 44). The screen seeds its state from the value last persisted
 * in MMKV (`readLastKnown` in the state initialiser), refreshes it and persists the fresh value
 * (`writeLastKnown`); `null` (nothing known yet, first ever open) renders the NEUTRAL form —
 * never the negative branch. Account data (the calendar status) is keyed by the account
 * (`scope`), so a status fetched for one account never seeds another's first frame; device
 * facts (the OS permission, exact alarms) are unscoped and stay known across accounts.
 */
import { appStorage, StorageKeys } from './mmkv';

export interface LastKnownStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

function keyOf(name: string, scope: string | null): string {
  return scope === null
    ? `${StorageKeys.lastKnownPrefix}${name}`
    : `${StorageKeys.lastKnownPrefix}${scope}.${name}`;
}

export function readLastKnown<T>(
  name: string,
  scope: string | null = null,
  store: LastKnownStore = appStorage,
): T | null {
  const raw = store.getString(keyOf(name, scope));
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLastKnown<T>(
  name: string,
  value: T,
  scope: string | null = null,
  store: LastKnownStore = appStorage,
): void {
  store.set(keyOf(name, scope), JSON.stringify(value));
}

/** Erasure hygiene for a scoped reading (an account's calendar status). */
export function forgetLastKnown(
  name: string,
  scope: string | null = null,
  store: LastKnownStore = appStorage,
): void {
  store.delete(keyOf(name, scope));
}

/**
 * Sign-out / erasure / account switch: forget the leaving account's readings without pulling
 * the auth stack into the caller — the account is the one MMKV holds as the last signed-in user
 * (`StorageKeys.lastUserId`), still the leaving one at that point of the flows.
 */
export function forgetLastKnownOfLastUser(name: string, store: LastKnownStore = appStorage): void {
  const last = store.getString(StorageKeys.lastUserId);
  if (last !== undefined) forgetLastKnown(name, last, store);
}
