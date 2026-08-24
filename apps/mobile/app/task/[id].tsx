/** Edit-task sheet (FR-10). Loads the live row; a vanished id shows a calm empty state. */
import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { db } from '../../src/db/client';
import { tasks } from '../../src/db/schema';
import type { TaskRow } from '../../src/db/tasks';
import { useLiveRows } from '../../src/db/useLiveRows';
import { updateTaskAction } from '../../src/domain/taskActions';
import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';
import { TaskForm } from '../../src/ui/task/TaskForm';

export default function EditTaskScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rows = useLiveRows<TaskRow>(
    () =>
      db
        .select()
        .from(tasks)
        .where(eq(tasks.id, id ?? '')),
    ['tasks'],
  );
  const task = rows[0];

  if (task === undefined || task.deletedAt !== null) {
    return (
      <Screen>
        <EmptyState title={t('inbox.empty.title')} body={t('task.notFound')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TaskForm
          initial={task}
          submitLabel={t('task.save')}
          onSubmit={(draft) => {
            updateTaskAction(task.id, draft);
            router.back();
          }}
        />
      </ScrollView>
    </Screen>
  );
}
