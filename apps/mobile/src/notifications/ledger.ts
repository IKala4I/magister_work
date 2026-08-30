/**
 * The conservative delivered-ledger (ADR-0014 §2). MMKV holds what the app last asked the OS to
 * schedule; on every scheduler run `settle(now)` counts every request whose fire time has
 * passed as DELIVERED for its day — whether or not the OS presented it — so the daily cap is a
 * ceiling that survives re-plans, settings changes and app restarts. Pure over an injected
 * key/value store so the arithmetic is unit-testable; the app passes the MMKV instance.
 */
import { localDayOf } from '../domain/localDay';
import { appStorage, StorageKeys } from '../storage/mmkv';

import type { NotificationSpec } from './plan';

export interface LedgerStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export interface LedgerState {
  /** Delivered notification ids per local day (deduplicated). */
  delivered: Record<string, string[]>;
  /** What the OS currently holds on our behalf, as last committed. */
  scheduled: Pick<NotificationSpec, 'id' | 'fireAt' | 'day' | 'kind'>[];
}

const EMPTY: LedgerState = { delivered: {}, scheduled: [] };
/** Days kept in the ledger (today and yesterday are all the cap ever needs). */
const KEEP_DAYS = 2;

function isState(v: unknown): v is LedgerState {
  if (v === null || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.delivered === 'object' && s.delivered !== null && Array.isArray(s.scheduled);
}

export function readLedger(store: LedgerStore = appStorage): LedgerState {
  const raw = store.getString(StorageKeys.notificationLedger);
  if (raw === undefined) return { delivered: {}, scheduled: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : { ...EMPTY };
  } catch {
    return { delivered: {}, scheduled: [] };
  }
}

function writeLedger(state: LedgerState, store: LedgerStore): void {
  store.set(StorageKeys.notificationLedger, JSON.stringify(state));
}

function daysBack(now: Date, n: number): Set<string> {
  const keep = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keep.add(localDayOf(d));
  }
  return keep;
}

/**
 * Move every scheduled request whose fire time is ≤ now into `delivered` (conservative), drop
 * days older than yesterday, and return the requests still ahead (to be cancelled and
 * re-planned). Persists the settled state.
 */
export function settleLedger(
  now: Date,
  store: LedgerStore = appStorage,
): { deliveredByDay: Map<string, number>; pending: LedgerState['scheduled'] } {
  const state = readLedger(store);
  const keep = daysBack(now, KEEP_DAYS);
  const delivered: Record<string, string[]> = {};
  for (const [day, ids] of Object.entries(state.delivered)) {
    if (keep.has(day)) delivered[day] = [...ids];
  }
  const pending: LedgerState['scheduled'] = [];
  for (const s of state.scheduled) {
    if (s.fireAt <= now.getTime()) {
      if (!keep.has(s.day)) continue;
      const list = delivered[s.day] ?? [];
      if (!list.includes(s.id)) list.push(s.id);
      delivered[s.day] = list;
    } else {
      pending.push(s);
    }
  }
  writeLedger({ delivered, scheduled: pending }, store);
  const deliveredByDay = new Map<string, number>();
  for (const [day, ids] of Object.entries(delivered)) deliveredByDay.set(day, ids.length);
  return { deliveredByDay, pending };
}

/** Record what was just handed to the OS (replaces the pending set). */
export function commitScheduled(
  schedule: readonly NotificationSpec[],
  store: LedgerStore = appStorage,
): void {
  const state = readLedger(store);
  writeLedger(
    {
      delivered: state.delivered,
      scheduled: schedule.map((s) => ({ id: s.id, fireAt: s.fireAt, day: s.day, kind: s.kind })),
    },
    store,
  );
}

/** Sign-out / erasure: forget everything (the OS side is cancelled by the caller). */
export function resetLedger(store: LedgerStore = appStorage): void {
  store.delete(StorageKeys.notificationLedger);
}
