/** Edit-task sheet (FR-10). Loads the live row; a vanished id shows a calm empty state. */
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { db } from '../../src/db/client';
import { tasks } from '../../src/db/schema';
import type { TaskRow } from '../../src/db/tasks';
import { updateTaskAction } from '../../src/domain/taskActions';
import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';
import { TaskForm } from '../../src/ui/task/TaskForm';

export default function EditTaskScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useLiveQuery(
    db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id ?? '')),
  );
  const task = (data as TaskRow[] | undefined)?.[0];

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
