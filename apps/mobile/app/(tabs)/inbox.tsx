/**
 * Inbox — unscheduled tasks (FR-10/FR-11, UC-02). Reactive list straight from SQLite
 * (useLiveRows — the single source of truth; no duplicated view state), NL quick-add on
 * top, full task sheet via row tap or the header "+". Delete is soft with a 6 s undo.
 */
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { db } from '../../src/db/client';
import { inboxTasksQuery } from '../../src/db/tasks';
import type { TaskRow } from '../../src/db/tasks';
import { useLiveRows } from '../../src/db/useLiveRows';
import type { LocalDb } from '../../src/db/writes';
import {
  createTaskAction,
  deleteTaskAction,
  restoreTaskAction,
} from '../../src/domain/taskActions';
import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';
import { QuickAddBar } from '../../src/ui/task/QuickAddBar';
import { TaskListRow } from '../../src/ui/task/TaskListRow';
import { UNDO_WINDOW_MS, UndoSnackbar } from '../../src/ui/task/UndoSnackbar';

export default function InboxScreen() {
  const router = useRouter();
  const tasks = useLiveRows<TaskRow>(() => inboxTasksQuery(db as unknown as LocalDb), ['tasks']);
  // One undo entry and one timer per deleted row: consecutive deletes must not shorten
  // each other's 6 s window (File 02 §3), so a single shared bar timer is not enough.
  const [pendingUndos, setPendingUndos] = useState<TaskRow[]>([]);
  const undoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = undoTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const handleDelete = useCallback((task: TaskRow) => {
    // The undo bar sits at the bottom of the screen, where an open quick-add keyboard
    // would cover it — leaving a destructive action with no reachable undo (File 02 §3).
    // Deleting is not typing, so drop the keyboard.
    Keyboard.dismiss();
    deleteTaskAction(task.id);
    setPendingUndos((prev) => [...prev.filter((p) => p.id !== task.id), task]);
    const existing = undoTimers.current.get(task.id);
    if (existing !== undefined) clearTimeout(existing);
    undoTimers.current.set(
      task.id,
      setTimeout(() => {
        undoTimers.current.delete(task.id);
        setPendingUndos((prev) => prev.filter((p) => p.id !== task.id));
      }, UNDO_WINDOW_MS),
    );
  }, []);

  // The restore must NOT live inside a setState updater: updaters have to be pure, and
  // React is free to re-run them (StrictMode, concurrent re-render), which would replay
  // the write. Read the state, then write. Undo restores everything still undoable.
  const handleUndo = useCallback(() => {
    for (const task of pendingUndos) restoreTaskAction(task.id);
    for (const timer of undoTimers.current.values()) clearTimeout(timer);
    undoTimers.current.clear();
    setPendingUndos([]);
  }, [pendingUndos]);

  return (
    <Screen>
      <QuickAddBar
        onSubmit={(draft, nlParseUsed) =>
          createTaskAction(draft, { source: 'quick_add', nlParseUsed })
        }
      />
      {tasks.length === 0 ? (
        <EmptyState title={t('inbox.empty.title')} body={t('inbox.empty.body')} />
      ) : (
        <FlashList
          data={tasks}
          // Without this the quick-add keyboard eats the first tap on a row (FlashList is a
          // ScrollView, whose default is "never"), so the row after a quick-add needed two
          // taps to open. Found in the P3 on-device walk.
          keyboardShouldPersistTaps="handled"
          keyExtractor={(task) => task.id}
          renderItem={({ item }) => (
            <TaskListRow
              task={item}
              onPress={(task) => router.push(`/task/${task.id}`)}
              onDelete={handleDelete}
            />
          )}
        />
      )}
      {pendingUndos.length > 0 ? (
        <UndoSnackbar
          message={
            pendingUndos.length === 1
              ? t('inbox.undo.deleted')
              : t('inbox.undo.deletedMany', { count: pendingUndos.length })
          }
          onUndo={handleUndo}
        />
      ) : null}
    </Screen>
  );
}
