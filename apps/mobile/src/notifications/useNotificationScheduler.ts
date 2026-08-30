/**
 * Mounts the FR-50 scheduler in the tab shell: a run on mount, on every foreground, and
 * (debounced) after any change to the tables the plan depends on. The device database is the
 * single source of truth — the scheduler re-derives everything from it, so a change listener
 * is all the wiring there is.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { runNotificationScheduler } from './scheduler';

const TABLES: ReadonlySet<string> = new Set(['plans', 'recommendations', 'tasks', 'profiles']);
export const RESCHEDULE_DEBOUNCE_MS = 1_000;

export function useNotificationScheduler(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runNotificationScheduler();
      }, RESCHEDULE_DEBOUNCE_MS);
    };
    void runNotificationScheduler();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runNotificationScheduler();
    });
    const changes = addDatabaseChangeListener(({ tableName }) => {
      if (TABLES.has(tableName)) schedule();
    });
    return () => {
      app.remove();
      changes.remove();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);
}
