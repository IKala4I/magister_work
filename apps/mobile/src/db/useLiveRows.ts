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
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

type SyncQuery<T> = { all(): T[] };

export function useLiveRows<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  /** Builder inputs that must re-run the query when they change (e.g. the plan day). */
  deps: readonly unknown[] = [],
): T[] {
  const buildRef = useRef(buildQuery);
  buildRef.current = buildQuery;
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setRows(buildRef.current().all());
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

  return rows;
}
