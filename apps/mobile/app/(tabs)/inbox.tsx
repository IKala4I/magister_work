/**
 * Inbox — unscheduled tasks (FR-10/FR-11, UC-02). Reactive list straight from SQLite
 * (useLiveRows — the single source of truth; no duplicated view state), NL quick-add on
 * top, full task sheet via row tap or the header "+". Delete is soft with a 6 s undo.
 */
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { UndoSnackbar } from '../../src/ui/task/UndoSnackbar';

export default function InboxScreen() {
  const router = useRouter();
  const tasks = useLiveRows<TaskRow>(() => inboxTasksQuery(db as unknown as LocalDb), ['tasks']);
  const [pendingUndo, setPendingUndo] = useState<TaskRow | null>(null);

  const handleDelete = useCallback((task: TaskRow) => {
    // The undo bar sits at the bottom of the screen, where an open quick-add keyboard
    // would cover it — leaving a destructive action with no reachable undo (File 02 §3).
    // Deleting is not typing, so drop the keyboard.
    Keyboard.dismiss();
    deleteTaskAction(task.id);
    setPendingUndo(task);
  }, []);

  // The restore must NOT live inside a setState updater: updaters have to be pure, and
  // React is free to re-run them (StrictMode, concurrent re-render), which would replay
  // the write. Read the state, then write.
  const handleUndo = useCallback(() => {
    if (pendingUndo !== null) restoreTaskAction(pendingUndo.id);
    setPendingUndo(null);
  }, [pendingUndo]);

  const handleExpire = useCallback(() => setPendingUndo(null), []);

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
      {pendingUndo !== null ? (
        <UndoSnackbar
          message={t('inbox.undo.deleted')}
          onUndo={handleUndo}
          onExpire={handleExpire}
        />
      ) : null}
    </Screen>
  );
}
