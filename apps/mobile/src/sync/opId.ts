/**
 * Client-monotonic op ids (invariant 8; specs/07 §4 events UNIQUE(user_id, op_id)).
 *
 * Format: `<deviceId>-<counter>` where deviceId is a UUID minted once per install and the
 * counter is a zero-padded, monotonically increasing integer persisted in MMKV. Ids from
 * one device therefore sort lexicographically in creation order, and two devices of the
 * same user can never collide. Replaying the same op keeps the same id — idempotent on the
 * server's unique constraint.
 */
import { randomUUID } from 'expo-crypto';

import { appStorage, StorageKeys } from '../storage/mmkv';

/**
 * Zero-pad width: lexicographic order == numeric order while the counter has ≤12 digits
 * (10^12 ops per install; a device logging 1000 ops/day crosses it after ~2.7M years).
 * The hard overflow guard below only fires at 2^53 — between 10^12 and 2^53 ids stay
 * unique and monotonic numerically, just not lexicographically. Consumers MUST order by
 * the outbox `seq` column, not by string-sorting op ids.
 */
const COUNTER_PAD = 12;

export function getDeviceId(): string {
  const existing = appStorage.getString(StorageKeys.deviceId);
  if (existing !== undefined) return existing;
  const minted = randomUUID();
  appStorage.set(StorageKeys.deviceId, minted);
  return minted;
}

export function nextOpId(): string {
  const next = (appStorage.getNumber(StorageKeys.opCounter) ?? 0) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new RangeError('op counter overflow');
  }
  appStorage.set(StorageKeys.opCounter, next);
  return `${getDeviceId()}-${String(next).padStart(COUNTER_PAD, '0')}`;
}
