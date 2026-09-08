/**
 * A native or network tri-state ("is the calendar connected?", "is the reminder permission
 * granted?") is `null` until its first asynchronous read. Rendering `null` as the NEGATIVE
 * branch shows a wrong state for a frame on every open — Settings flashed "Connect Google
 * Calendar" over a connected calendar, the reminders switch flashed OFF, on both platforms
 * (hardware pass 2026-09-07 item 44). This hook seeds the state from the value last persisted
 * in MMKV, refreshes it, and persists the fresh value; callers render `null` (nothing known
 * yet, first ever open) as the NEUTRAL form — never the negative branch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { appStorage, StorageKeys } from './mmkv';

export interface LastKnownStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

function keyOf(name: string): string {
  return `${StorageKeys.lastKnownPrefix}${name}`;
}

export function readLastKnown<T>(name: string, store: LastKnownStore = appStorage): T | null {
  const raw = store.getString(keyOf(name));
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
  store: LastKnownStore = appStorage,
): void {
  store.set(keyOf(name), JSON.stringify(value));
}

/** Sign-out / erasure: the next account starts from "nothing known". */
export function forgetLastKnown(name: string, store: LastKnownStore = appStorage): void {
  store.delete(keyOf(name));
}

/**
 * `[value, refresh]` — `value` is the last persisted reading until the fetch resolves, then
 * the fresh one; `refresh()` re-runs the fetch (the caller wires it to AppState / focus).
 * A fetch that resolves `null` leaves the last-known value in place.
 */
export function useLastKnown<T>(
  name: string,
  fetch: () => Promise<T | null> | T | null,
  store: LastKnownStore = appStorage,
): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(() => readLastKnown<T>(name, store));
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const alive = useRef(true);
  const refresh = useCallback(() => {
    void Promise.resolve(fetchRef.current()).then((fresh) => {
      if (fresh === null || !alive.current) return;
      writeLastKnown(name, fresh, store);
      setValue(fresh);
    });
  }, [name, store]);
  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  return [value, refresh];
}
