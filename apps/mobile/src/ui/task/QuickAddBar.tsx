/**
 * NL quick-add bar (FR-11, UC-02): input → live structured preview chip → confirm.
 * Every recognized ambiguity renders as disambiguation chips (UC-02 A1) — bare weekday,
 * am/pm-less clock time, multiple dates, multiple durations — and picking one overrides
 * the parsed value; nothing is guessed silently, and a deadline that carries a clock time
 * shows it in the preview. Quick-add fills what the text carries; unstated FR-10 fields
 * take the documented defaults (category admin, priority normal, 30 min) and stay
 * editable in the task sheet afterwards.
 *
 * The NL example lives in a caption UNDER the input while it is empty (it swaps with the
 * preview row once typing starts), not in the placeholder: on Android a single-line
 * TextInput wraps a long hint and clips the second line, and at 200 % font scale no example
 * fits one line on any phone (hardware pass 2026-09-01 #7, NFR-A2).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { TaskDraft } from '../../db/tasks';
import { DAY_END, parseQuickAdd, type QuickAddAmbiguity } from '../../domain/quickAdd';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

const DEFAULT_MINUTES = 30;

export interface QuickAddBarProps {
  onSubmit: (draft: TaskDraft, nlParseUsed: boolean) => void;
  /**
   * Show the NL example caption under an empty input (default). Off where the surrounding copy
   * already teaches the example (the onboarding seed step), so a screen reader hears it once.
   */
  showExample?: boolean;
}

function formatDeadline(date: Date): string {
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  // 23:59 is the end-of-day convention (quickAdd/TaskForm): day-granular, no clock time.
  if (date.getHours() === DAY_END.hour && date.getMinutes() === DAY_END.minute) return day;
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

type DateChoice = { key: string; label: string; date: Date };

function dateChoicesFor(ambiguity: QuickAddAmbiguity): DateChoice[] {
  switch (ambiguity.kind) {
    case 'weekday_today_or_next':
      return [
        { key: 'today', label: t('inbox.chip.today'), date: ambiguity.today },
        { key: 'nextWeek', label: t('inbox.chip.nextWeek'), date: ambiguity.nextWeek },
      ];
    case 'am_or_pm':
      return [
        { key: 'am', label: formatDeadline(ambiguity.am), date: ambiguity.am },
        { key: 'pm', label: formatDeadline(ambiguity.pm), date: ambiguity.pm },
      ];
    case 'multiple_dates':
      return ambiguity.candidates.map((candidate, index) => ({
        key: `candidate-${index}`,
        label: formatDeadline(candidate),
        date: candidate,
      }));
    case 'multiple_durations':
      return [];
  }
}

export function QuickAddBar({ onSubmit, showExample = true }: QuickAddBarProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [deadlineOverride, setDeadlineOverride] = useState<Date | null>(null);
  const [minutesOverride, setMinutesOverride] = useState<number | null>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const deadline = deadlineOverride ?? parsed.deadline;
  const estMinutes = minutesOverride ?? parsed.estMinutes;
  const canSubmit = parsed.title.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(
      {
        title: parsed.title,
        category: 'admin',
        estMinutes: estMinutes ?? DEFAULT_MINUTES,
        value: 2,
        splittable: false,
        deadline,
        earliestStart: null,
      },
      parsed.parsed,
    );
    setText('');
    setDeadlineOverride(null);
    setMinutesOverride(null);
  };

  const durationAmbiguity = parsed.ambiguities.find(
    (a): a is Extract<QuickAddAmbiguity, { kind: 'multiple_durations' }> =>
      a.kind === 'multiple_durations',
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={(next) => {
            setText(next);
            // an edit invalidates previous chip choices
            setDeadlineOverride(null);
            setMinutesOverride(null);
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

      {text.trim().length === 0 ? (
        showExample ? (
          <ThemedText variant="caption" tone="secondary" testID="quick-add-example">
            {t('inbox.quickAdd.example')}
          </ThemedText>
        ) : null
      ) : (
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
          {estMinutes !== null ? (
            <PreviewChip label={t('inbox.preview.duration', { minutes: estMinutes })} />
          ) : null}
          {deadline !== null ? (
            <PreviewChip label={t('inbox.preview.deadline', { date: formatDeadline(deadline) })} />
          ) : null}
        </View>
      )}

      {deadlineOverride === null
        ? parsed.ambiguities.map((ambiguity) => {
            const choices = dateChoicesFor(ambiguity);
            if (choices.length === 0) return null;
            return (
              <View key={ambiguity.kind} style={styles.previewRow}>
                {choices.map((choice) => (
                  <ChoiceChip
                    key={choice.key}
                    label={choice.label}
                    a11yLabel={t('inbox.chip.date.a11y', { date: formatDeadline(choice.date) })}
                    onPress={() => setDeadlineOverride(choice.date)}
                  />
                ))}
              </View>
            );
          })
        : null}

      {minutesOverride === null && durationAmbiguity !== undefined ? (
        <View style={styles.previewRow}>
          {durationAmbiguity.candidatesMinutes.map((minutes, index) => (
            <ChoiceChip
              key={`minutes-${index}`}
              label={t('inbox.preview.duration', { minutes })}
              a11yLabel={t('inbox.chip.duration.a11y', { minutes })}
              onPress={() => setMinutesOverride(minutes)}
            />
          ))}
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
    // 1 px, not hairline: Android draws a sub-pixel border unevenly around rounded corners
    // (the "border looks off at the sides" note from the same attended slice)
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    textAlignVertical: 'center',
  },
  addButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 18 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  previewTitle: { flexShrink: 1 },
  chip: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  choiceChip: { borderWidth: 1, minHeight: 44 },
});
