/** New-task sheet (FR-10 full form; File 02 §3.5 "Task sheet"). */
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { createTaskAction } from '../../src/domain/taskActions';
import { t } from '../../src/i18n';
import { Screen } from '../../src/ui/primitives';
import { TaskForm } from '../../src/ui/task/TaskForm';

export default function NewTaskScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TaskForm
          submitLabel={t('task.create')}
          onSubmit={(draft) => {
            createTaskAction(draft, { source: 'form', nlParseUsed: false });
            router.back();
          }}
        />
      </ScrollView>
    </Screen>
  );
}
