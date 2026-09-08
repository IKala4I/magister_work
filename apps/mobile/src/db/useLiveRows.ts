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
 * The FIRST read is synchronous, in the initial state (the expo-sqlite driver is synchronous —
 * the profile hook has always read this way), and a change of the builder inputs (user, plan
 * day) re-reads synchronously in the same render: no render ever carries an empty or stale
 * row set that a screen could mistake for "nothing here". Before this, every caller's first
 * frame rendered its empty state — the Inbox empty, Focus "Nothing running" with a session
 * live, the task sheet "not found", Settings' calendar row unconnected — for one frame on every
 * open (hardware pass 2026-09-07 item 44, seen by the owner on both platforms). `ready` stays
 * for callers that gate a decision on it (the UC-03 trigger, hardware pass 2026-09-02 #15): it
 * is now true from the first render on.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

type SyncQuery<T> = { all(): T[] };

export interface LiveRows<T> {
  rows: T[];
  /**
   * Kept for callers that gate a decision on it (the UC-03 trigger): since the first read is
   * synchronous it is true on every render — `rows` are always for the current inputs.
   */
  ready: boolean;
}

interface ReadState<T> {
  rows: T[];
  /** The tables + deps the rows were read for. */
  readFor: readonly unknown[];
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
  // the first read, synchronously, so the first render already carries the rows
  const [state, setState] = useState<ReadState<T>>(() => ({
    rows: buildQuery().all(),
    readFor: inputs,
  }));
  // inputs changed since the last read: re-read in this render (the effect below persists it)
  const current: ReadState<T> = sameInputs(state.readFor, inputs)
    ? state
    : { rows: buildRef.current().all(), readFor: inputs };

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setState({ rows: buildRef.current().all(), readFor: inputs });
    };
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (tables.includes(tableName)) refresh();
    });
    // the render read predates this subscription by a frame; a write landing in that gap (a
    // pull's promise continuation) would be neither in the rows nor observed — read once more
    // now that the listener is attached (adversarial pass 2026-09-08 #8; one statement)
    refresh();
    return () => {
      alive = false;
      subscription.remove();
    };
    // The table names (plus the caller's builder inputs) ARE the deps: a deps array compares
    // element-wise, so a literal ['tasks'] at the call site never re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, inputs);

  return { rows: current.rows, ready: true };
}

export function useLiveRows<T>(
  buildQuery: () => SyncQuery<T>,
  tables: readonly string[],
  deps: readonly unknown[] = [],
): T[] {
  return useLiveRowsState(buildQuery, tables, deps).rows;
}
