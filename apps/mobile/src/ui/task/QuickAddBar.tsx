/**
 * NL quick-add bar (FR-11, UC-02): input → live structured preview chip → confirm.
 * Ambiguities render as disambiguation chips (UC-02 A1) — picking one overrides the
 * parsed deadline; nothing is guessed silently. Quick-add fills what the text carries;
 * unstated FR-10 fields take the documented defaults (category admin, priority normal,
 * 30 min) and stay editable in the task sheet afterwards.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { TaskDraft } from '../../db/tasks';
import { parseQuickAdd } from '../../domain/quickAdd';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

const DEFAULT_MINUTES = 30;

export interface QuickAddBarProps {
  onSubmit: (draft: TaskDraft, nlParseUsed: boolean) => void;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function QuickAddBar({ onSubmit }: QuickAddBarProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [deadlineOverride, setDeadlineOverride] = useState<Date | null>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const deadline = deadlineOverride ?? parsed.deadline;
  const canSubmit = parsed.title.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(
      {
        title: parsed.title,
        category: 'admin',
        estMinutes: parsed.estMinutes ?? DEFAULT_MINUTES,
        value: 2,
        splittable: false,
        deadline,
        earliestStart: null,
      },
      parsed.parsed,
    );
    setText('');
    setDeadlineOverride(null);
  };

  const weekdayAmbiguity = parsed.ambiguities.find((a) => a.kind === 'weekday_today_or_next');

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={(next) => {
            setText(next);
            setDeadlineOverride(null); // an edit invalidates a previous chip choice
          }}
          placeholder={t('inbox.quickAdd.placeholder')}
          placeholderTextColor={theme.colors.textSecondary}
          accessibilityLabel={t('inbox.quickAdd.input.a11y')}
          onSubmitEditing={submit}
          returnKeyType="done"
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('inbox.quickAdd.add')}
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={submit}
          style={[
            styles.addButton,
            {
              // primaryContainer + textPrimary is the AA-proven pairing in both themes
              backgroundColor: theme.colors.primaryContainer,
              borderRadius: theme.radii.pill,
              opacity: canSubmit ? 1 : 0.45,
            },
          ]}
        >
          <ThemedText>{t('inbox.quickAdd.add')}</ThemedText>
        </Pressable>
      </View>

      {text.trim().length > 0 ? (
        <View style={styles.previewRow}>
          {canSubmit ? (
            <ThemedText variant="caption" numberOfLines={1} style={styles.previewTitle}>
              {parsed.title}
            </ThemedText>
          ) : (
            <ThemedText variant="caption" tone="secondary">
              {t('inbox.quickAdd.noTitleHint')}
            </ThemedText>
          )}
          {parsed.estMinutes !== null ? (
            <PreviewChip label={t('inbox.preview.duration', { minutes: parsed.estMinutes })} />
          ) : null}
          {deadline !== null ? (
            <PreviewChip label={t('inbox.preview.deadline', { date: formatDay(deadline) })} />
          ) : null}
        </View>
      ) : null}

      {weekdayAmbiguity?.kind === 'weekday_today_or_next' && deadlineOverride === null ? (
        <View style={styles.previewRow}>
          <ChoiceChip
            label={t('inbox.chip.today')}
            a11yLabel={t('inbox.chip.date.a11y', { date: formatDay(weekdayAmbiguity.today) })}
            onPress={() => setDeadlineOverride(weekdayAmbiguity.today)}
          />
          <ChoiceChip
            label={t('inbox.chip.nextWeek')}
            a11yLabel={t('inbox.chip.date.a11y', { date: formatDay(weekdayAmbiguity.nextWeek) })}
            onPress={() => setDeadlineOverride(weekdayAmbiguity.nextWeek)}
          />
        </View>
      ) : null}
    </View>
  );
}

function PreviewChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.colors.primaryContainer, borderRadius: theme.radii.pill },
      ]}
    >
      <ThemedText variant="caption">{label}</ThemedText>
    </View>
  );
}

function ChoiceChip({
  label,
  a11yLabel,
  onPress,
}: {
  label: string;
  a11yLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={[
        styles.chip,
        styles.choiceChip,
        { borderColor: theme.colors.primary, borderRadius: theme.radii.pill },
      ]}
    >
      <ThemedText variant="caption">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  addButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 18 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  previewTitle: { flexShrink: 1 },
  chip: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  choiceChip: { borderWidth: 1, minHeight: 44 },
});
