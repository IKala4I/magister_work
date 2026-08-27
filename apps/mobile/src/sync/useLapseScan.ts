/**
 * Lazy lapse detection on open/foreground (File 05 §1; invariant 7: no correctness depends on
 * background execution). Runs the local scan, then the facts bridge so the server learns about
 * the day so far; the 23:55 job stays the authority. Surfaces the UC-04 A2 diagnostic when a task
 * reaches its third consecutive skip/lapse.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { abandonStaleSessions, lapseScan } from '../db/feedback';
import type { TaskRow } from '../db/tasks';
import type { LocalDb } from '../db/writes';

import { pushFactsIfPossible } from './factsPush';

export function runLapseScan(now: Date = new Date()): TaskRow[] {
  const localDb = db as unknown as LocalDb;
  const userId = currentUserId();
  abandonStaleSessions(localDb, { userId, now });
  const result = lapseScan(localDb, { userId, now });
  void pushFactsIfPossible();
  return result.diagnosticDue;
}

export function useLapseScan(): {
  diagnosticTask: TaskRow | null;
  dismissDiagnostic: () => void;
} {
  const [diagnosticTask, setDiagnosticTask] = useState<TaskRow | null>(null);
  const scan = useCallback(() => {
    const due = runLapseScan();
    if (due.length > 0) setDiagnosticTask(due[0] ?? null);
  }, []);
  useEffect(() => {
    scan();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scan();
    });
    return () => sub.remove();
  }, [scan]);
  return { diagnosticTask, dismissDiagnostic: () => setDiagnosticTask(null) };
}
