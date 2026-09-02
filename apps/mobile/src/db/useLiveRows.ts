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
 * The first read happens in an effect, so the FIRST render carries no rows yet — and after the
 * builder inputs change (user, plan day) the next render still carries the PREVIOUS inputs'
 * rows until the effect re-reads. Callers that must not mistake either for "empty" (the UC-03
 * trigger: an empty plan read looks like "never planned" — hardware pass 2026-09-02 finding
 * #15) use `useLiveRowsState`, whose `ready` is true only when the rows were read for the
 * CURRENT inputs; `useLiveRows` keeps the plain-rows signature.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

type SyncQuery<T> = { all(): T[] };

export interface LiveRows<T> {
  rows: T[];
  /**
   * True only when `rows` were read for the current tables + deps. False on the first render
   * (rows = []) and for the render after a deps change (rows = the previous inputs' read).
   */
  ready: boolean;
}

interface ReadState<T> {
  rows: T[];
  /** The tables + deps the rows were read for; null before the first read. */
  readFor: readonly unknown[] | null;
}

function sameInputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

export function useLiveRowsState<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  /** Builder inputs that must re-run the query when they change (e.g. the plan day). */
  deps: readonly unknown[] = [],
): LiveRows<T> {
  const buildRef = useRef(buildQuery);
  buildRef.current = buildQuery;
  const inputs: readonly unknown[] = [...tables, ...deps];
  const [state, setState] = useState<ReadState<T>>(() => ({ rows: [], readFor: null }));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setState({ rows: buildRef.current().all(), readFor: inputs });
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
  }, inputs);

  return {
    rows: state.rows,
    ready: state.readFor !== null && sameInputs(state.readFor, inputs),
  };
}

export function useLiveRows<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  deps: readonly unknown[] = [],
): T[] {
  return useLiveRowsState(buildQuery, tables, deps).rows;
}
