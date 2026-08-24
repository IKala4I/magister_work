/**
 * Inbox — unscheduled tasks (FR-10/FR-11, UC-02). Reactive list straight from SQLite
 * (useLiveQuery — the single source of truth; no duplicated view state), NL quick-add on
 * top, full task sheet via row tap or the header "+". Delete is soft with a 6 s undo.
 */
import { FlashList } from '@shopify/flash-list';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { db } from '../../src/db/client';
import { inboxTasksQuery } from '../../src/db/tasks';
import type { TaskRow } from '../../src/db/tasks';
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
  const { data: tasks } = useLiveQuery(inboxTasksQuery(db as unknown as LocalDb));
  const [pendingUndo, setPendingUndo] = useState<TaskRow | null>(null);

  const handleDelete = useCallback((task: TaskRow) => {
    deleteTaskAction(task.id);
    setPendingUndo(task);
  }, []);

  const handleUndo = useCallback(() => {
    setPendingUndo((pending) => {
      if (pending !== null) restoreTaskAction(pending.id);
      return null;
    });
  }, []);

  const handleExpire = useCallback(() => setPendingUndo(null), []);

  return (
    <Screen>
      <QuickAddBar
        onSubmit={(draft, nlParseUsed) =>
          createTaskAction(draft, { source: 'quick_add', nlParseUsed })
        }
      />
      {tasks === undefined || tasks.length === 0 ? (
        <EmptyState title={t('inbox.empty.title')} body={t('inbox.empty.body')} />
      ) : (
        <FlashList
          data={tasks as TaskRow[]}
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
