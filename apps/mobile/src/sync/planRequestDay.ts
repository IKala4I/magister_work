/**
 * The once-per-plan-day dedup key for the lazy UC-03 trigger ("exactly one plan request per
 * plan day"). It lives in MMKV, not in the Zustand UI store: the key must outlive the JS
 * process. Until the hardware pass it was ephemeral, and every cold start on the Pixel 7a
 * re-fired `first_open` while today's plan was persisted (2026-09-02 finding #15; day 1's 30
 * zero-block rows had the same cause). Only a request for the CURRENT calendar day writes it —
 * the evening ritual plans tomorrow and must never block today's request. Cleared on an
 * account change (src/auth/accountTransition.ts): one user's request must not gate another's.
 */
import { appStorage, StorageKeys } from '../storage/mmkv';

export function lastRequestedPlanDay(): string | null {
  return appStorage.getString(StorageKeys.lastPlanRequestDay) ?? null;
}

export function rememberRequestedPlanDay(day: string): void {
  appStorage.set(StorageKeys.lastPlanRequestDay, day);
}

export function forgetRequestedPlanDay(): void {
  appStorage.delete(StorageKeys.lastPlanRequestDay);
}
