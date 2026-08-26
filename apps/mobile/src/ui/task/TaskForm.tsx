/**
 * Task sheet form (FR-10 — every field: title, category, estimated duration, deadline,
 * value/priority 1–3, splittable, earliest-start). Date fields are day-granular in the
 * form (deadline normalizes to end-of-day, earliest start to start-of-day); precise
 * clock times come from the NL path ("by 3pm"). Chips reuse the AA-proven
 * primaryContainer/textPrimary pairing in both themes.
 */
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { TASK_CATEGORIES } from '../../db/schema';
import type { TaskCategory, TaskDraft, TaskRow } from '../../db/tasks';
import { t, type MessageKey } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { CATEGORY_LABELS } from './TaskListRow';

const VALUE_LABELS: Record<1 | 2 | 3, MessageKey> = {
  1: 'task.value.1',
  2: 'task.value.2',
  3: 'task.value.3',
};

const MINUTE_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export interface TaskFormProps {
  initial?: TaskRow;
  submitLabel: string;
  onSubmit: (draft: TaskDraft) => void;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 0, 0);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TaskForm({ initial, submitLabel, onSubmit }: TaskFormProps) {
  const theme = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'admin');
  const [minutesText, setMinutesText] = useState(String(initial?.estMinutes ?? 30));
  const [value, setValue] = useState<number>(initial?.value ?? 2);
  const [splittable, setSplittable] = useState(initial?.splittable ?? false);
  const [deadline, setDeadline] = useState<Date | null>(initial?.deadline ?? null);
  const [earliestStart, setEarliestStart] = useState<Date | null>(initial?.earliestStart ?? null);

  const estMinutes = Number.parseInt(minutesText, 10);
  // Cross-field rule mirrored from assertValidDraft: enforcing it here keeps the DAO's
  // throw unreachable from the UI (an uncaught throw in onPress is a fatal error).
  const rangeValid =
    deadline === null || earliestStart === null || earliestStart.getTime() <= deadline.getTime();
  const valid =
    title.trim().length > 0 && Number.isInteger(estMinutes) && estMinutes > 0 && rangeValid;

  const chipStyle = (selected: boolean) => [
    styles.chip,
    {
      borderRadius: theme.radii.pill,
      backgroundColor: selected ? theme.colors.primaryContainer : 'transparent',
      borderColor: selected ? theme.colors.primary : theme.colors.textSecondary,
    },
  ];

  return (
    <View style={styles.form}>
      <ThemedText variant="caption" tone="secondary">
        {t('task.field.title')}
      </ThemedText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('task.field.title.placeholder')}
        placeholderTextColor={theme.colors.textSecondary}
        accessibilityLabel={t('task.field.title')}
        maxFontSizeMultiplier={2}
        style={[
          styles.input,
          {
            borderColor: theme.colors.textSecondary,
            color: theme.colors.textPrimary,
            borderRadius: theme.radii.card,
            fontFamily: theme.fontFamilies.regular,
          },
        ]}
      />

      <ThemedText variant="caption" tone="secondary">
        {t('task.field.category')}
      </ThemedText>
      <View accessibilityRole="radiogroup" style={styles.chipRow}>
        {TASK_CATEGORIES.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: option === category }}
            accessibilityLabel={t(CATEGORY_LABELS[option])}
            onPress={() => setCategory(option)}
            style={chipStyle(option === category)}
          >
            <ThemedText variant="caption">{t(CATEGORY_LABELS[option])}</ThemedText>
          </Pressable>
        ))}
      </View>

      <ThemedText variant="caption" tone="secondary">
        {t('task.field.duration')}
      </ThemedText>
      <View style={styles.chipRow}>
        <TextInput
          value={minutesText}
          onChangeText={setMinutesText}
          keyboardType="number-pad"
          accessibilityLabel={t('task.field.duration')}
          maxFontSizeMultiplier={2}
          style={[
            styles.input,
            styles.minutesInput,
            {
              borderColor: theme.colors.textSecondary,
              color: theme.colors.textPrimary,
              borderRadius: theme.radii.card,
              fontFamily: theme.fontFamilies.mono,
            },
          ]}
        />
        {MINUTE_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            accessibilityRole="button"
            accessibilityLabel={t('inbox.preview.duration', { minutes: preset })}
            onPress={() => setMinutesText(String(preset))}
            style={chipStyle(estMinutes === preset)}
          >
            <ThemedText variant="caption" mono>
              {String(preset)}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <ThemedText variant="caption" tone="secondary">
        {t('task.field.value')}
      </ThemedText>
      <View accessibilityRole="radiogroup" style={styles.chipRow}>
        {([1, 2, 3] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: option === value }}
            accessibilityLabel={t(VALUE_LABELS[option])}
            onPress={() => setValue(option)}
            style={chipStyle(option === value)}
          >
            <ThemedText variant="caption">{t(VALUE_LABELS[option])}</ThemedText>
          </Pressable>
        ))}
      </View>

      <DateField
        label={t('task.field.deadline')}
        noneLabel={t('task.field.deadline.none')}
        clearLabel={t('task.field.deadline.clear')}
        value={deadline}
        normalize={endOfDay}
        onChange={setDeadline}
      />
      <DateField
        label={t('task.field.earliestStart')}
        noneLabel={t('task.field.earliestStart.none')}
        clearLabel={t('task.field.earliestStart.clear')}
        value={earliestStart}
        normalize={startOfDay}
        onChange={setEarliestStart}
      />
      {!rangeValid ? (
        <ThemedText variant="caption">{t('task.field.range.error')}</ThemedText>
      ) : null}

      <View style={styles.switchRow}>
        <ThemedText>{t('task.field.splittable')}</ThemedText>
        <Switch
          value={splittable}
          onValueChange={setSplittable}
          accessibilityLabel={t('task.field.splittable')}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: !valid }}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            title: title.trim(),
            category,
            estMinutes,
            value,
            splittable,
            deadline,
            earliestStart,
          })
        }
        style={[
          styles.submit,
          {
            backgroundColor: theme.colors.primaryContainer,
            borderRadius: theme.radii.card,
            opacity: valid ? 1 : 0.45,
          },
        ]}
      >
        <ThemedText>{submitLabel}</ThemedText>
      </Pressable>
    </View>
  );
}

function DateField({
  label,
  noneLabel,
  clearLabel,
  value,
  normalize,
  onChange,
}: {
  label: string;
  noneLabel: string;
  clearLabel: string;
  value: Date | null;
  normalize: (date: Date) => Date;
  onChange: (date: Date | null) => void;
}) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePicked = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setPickerOpen(false);
    if (event.type === 'dismissed' || picked === undefined) return;
    onChange(normalize(picked));
  };

  return (
    <View style={styles.dateField}>
      <ThemedText variant="caption" tone="secondary">
        {label}
      </ThemedText>
      <View style={styles.chipRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => setPickerOpen((open) => !open)}
          style={[
            styles.chip,
            styles.dateChip,
            { borderColor: theme.colors.textSecondary, borderRadius: theme.radii.pill },
          ]}
        >
          <ThemedText variant="caption">{value ? formatDay(value) : noneLabel}</ThemedText>
        </Pressable>
        {value !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            onPress={() => onChange(null)}
            style={[
              styles.chip,
              { borderColor: theme.colors.textSecondary, borderRadius: theme.radii.pill },
            ]}
          >
            <ThemedText variant="caption" tone="secondary">
              {clearLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {pickerOpen ? (
        <DateTimePicker
          value={value ?? normalize(new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handlePicked}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10, paddingBottom: 32 },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  minutesInput: { minWidth: 76, flexGrow: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  dateChip: { minWidth: 120, alignItems: 'center' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  dateField: { gap: 6 },
  submit: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
