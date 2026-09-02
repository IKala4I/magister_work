/**
 * Reactive reads from the device database (File 03 §1.2 single reactive source of truth).
 *
 * Not drizzle's useLiveQuery: on this stack (expo-sqlite sync driver) its refresh path
 * proved dead on device — change events DO reach JS (verified in the P3 pass with a
 * direct addDatabaseChangeListener probe: docs/verification/p3-manual-verification.md),
 * but the hook re-awaits its one memoized prepared statement and routes whatever goes
 * wrong into an error state callers rarely read, leaving the list silently stale.
 * This hook subscribes directly and builds a FRESH query per refresh, so every read is a
 * clean prepared statement and a failure would throw where tests can see it.
 *
 * The first read happens in an effect, so the FIRST render carries no rows yet. Callers that
 * must not mistake "not read yet" for "empty" (the UC-03 trigger: an empty plan read looks
 * like "never planned" — hardware pass 2026-09-02 finding #15) use `useLiveRowsState`, which
 * says whether the read has resolved; `useLiveRows` keeps the plain-rows signature.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

type SyncQuery<T> = { all(): T[] };

export interface LiveRows<T> {
  rows: T[];
  /** False until the first read for this subscription has resolved (rows = [] meanwhile). */
  ready: boolean;
}

export function useLiveRowsState<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  /** Builder inputs that must re-run the query when they change (e.g. the plan day). */
  deps: readonly unknown[] = [],
): LiveRows<T> {
  const buildRef = useRef(buildQuery);
  buildRef.current = buildQuery;
  const [state, setState] = useState<LiveRows<T>>(() => ({ rows: [], ready: false }));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setState({ rows: buildRef.current().all(), ready: true });
    };
    refresh();
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (tables.includes(tableName)) refresh();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
    // The table names (plus the caller's builder inputs) ARE the deps: a deps array compares
    // element-wise, so a literal ['tasks'] at the call site never re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...tables, ...deps]);

  return state;
}

export function useLiveRows<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  deps: readonly unknown[] = [],
): T[] {
  return useLiveRowsState(buildQuery, tables, deps).rows;
}
