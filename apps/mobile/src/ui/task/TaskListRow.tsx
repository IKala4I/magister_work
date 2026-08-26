/**
 * Inbox row (FR-10 read path). Tap opens the edit sheet; the trash affordance soft-deletes
 * with the 6-second undo window handled by the screen. Category/deadline render as calm
 * metadata — no urgency styling in the Inbox (File 02 §2: no guilt UI).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskRow } from '../../db/tasks';
import { t, type MessageKey } from '../../i18n';
import type { TaskCategory } from '../../db/tasks';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

export const CATEGORY_LABELS: Record<TaskCategory, MessageKey> = {
  deep: 'task.category.deep',
  admin: 'task.category.admin',
  physical: 'task.category.physical',
  learning: 'task.category.learning',
};

export interface TaskListRowProps {
  task: TaskRow;
  onPress: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
}

function formatDeadline(deadline: Date): string {
  return deadline.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function TaskListRow({ task, onPress, onDelete }: TaskListRowProps) {
  const theme = useTheme();
  const categoryLabel = t(CATEGORY_LABELS[task.category]);
  // A sighted user sees the deadline chip; the composed label must carry it too (NFR-A1).
  const rowLabel = task.deadline
    ? t('inbox.row.a11y.deadline', {
        title: task.title,
        category: categoryLabel,
        minutes: task.estMinutes,
        date: formatDeadline(task.deadline),
      })
    : t('inbox.row.a11y', {
        title: task.title,
        category: categoryLabel,
        minutes: task.estMinutes,
      });
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surfaceElevated.color, borderRadius: theme.radii.card },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        onPress={() => onPress(task)}
        style={styles.body}
      >
        <ThemedText numberOfLines={2}>{task.title}</ThemedText>
        <View style={styles.metaRow}>
          <ThemedText variant="caption" tone="secondary">
            {categoryLabel}
          </ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {t('inbox.preview.duration', { minutes: task.estMinutes })}
          </ThemedText>
          {task.deadline ? (
            <ThemedText variant="caption" tone="secondary">
              {t('inbox.preview.deadline', { date: formatDeadline(task.deadline) })}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('inbox.row.delete.a11y', { title: task.title })}
        hitSlop={8}
        onPress={() => onDelete(task)}
        style={styles.deleteButton}
      >
        <Ionicons name="trash-outline" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingRight: 4,
  },
  body: { flex: 1, minHeight: 60, justifyContent: 'center', padding: 14, gap: 4 },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
