/**
 * Working hours + sleep window (FR-02; UC-01 A2 — these self-declared hours ARE the MVP's
 * scheduling window, decision 5). Steppers instead of a custom time picker: fully
 * screen-reader operable, no gesture-only control (NFR-A1).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  DAY_KEYS,
  DEFAULT_WORKING_HOURS,
  formatMinutes,
  isValidWorkingHours,
  MINUTES_PER_DAY,
  type DayKey,
  type MinuteRange,
} from '../../src/domain/workingHours';
import { t, type MessageKey } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { useOnboardingStore } from '../../src/state/onboarding';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const STEP = 30;

function Stepper(props: { onPress: () => void; a11yLabel: string; icon: 'remove' | 'add' }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.a11yLabel}
      onPress={props.onPress}
      hitSlop={6}
      style={styles.stepper}
    >
      <Ionicons name={props.icon} size={18} color={theme.colors.primary} />
    </Pressable>
  );
}

function dayLabel(day: DayKey): string {
  return t(`onboarding.hours.day.${day}` as MessageKey);
}

export default function HoursScreen() {
  const router = useRouter();
  const workingHours = useOnboardingStore((s) => s.workingHours);
  const sleepWindow = useOnboardingStore((s) => s.sleepWindow);
  const setWorkingHours = useOnboardingStore((s) => s.setWorkingHours);
  const setSleepWindow = useOnboardingStore((s) => s.setSleepWindow);

  const setDay = (day: DayKey, range: MinuteRange | undefined) => {
    const next = { ...workingHours };
    if (range) next[day] = range;
    else delete next[day];
    setWorkingHours(next);
  };

  const nudge = (day: DayKey, edge: 0 | 1, delta: number) => {
    const range = workingHours[day];
    if (!range) return;
    const next: [number, number] = [...range] as [number, number];
    next[edge] = Math.min(MINUTES_PER_DAY, Math.max(0, next[edge] + delta));
    if (next[0] < next[1]) setDay(day, next);
  };

  const nudgeSleep = (edge: 0 | 1, delta: number) => {
    const next: [number, number] = [...sleepWindow] as [number, number];
    next[edge] = (((next[edge] + delta) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (next[0] !== next[1]) setSleepWindow(next);
  };

  const valid = isValidWorkingHours(workingHours);

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedText variant="caption">
          {t('onboarding.step.a11y', { current: 2, total: 4 })}
        </ThemedText>
        <ThemedText variant="h1">{t('onboarding.hours.title')}</ThemedText>
        <ThemedText style={styles.intro}>{t('onboarding.hours.intro')}</ThemedText>

        {DAY_KEYS.map((day) => {
          const range = workingHours[day];
          return (
            <View
              key={day}
              style={styles.dayRow}
              accessible
              accessibilityLabel={
                range
                  ? t('onboarding.hours.workingDay.a11y', {
                      day: dayLabel(day),
                      start: formatMinutes(range[0]),
                      end: formatMinutes(range[1]),
                    })
                  : t('onboarding.hours.dayOff.a11y', { day: dayLabel(day) })
              }
            >
              <Switch
                accessibilityLabel={t('onboarding.hours.toggle.a11y', { day: dayLabel(day) })}
                value={range !== undefined}
                onValueChange={(on) =>
                  setDay(day, on ? (DEFAULT_WORKING_HOURS.mon as MinuteRange) : undefined)
                }
              />
              <ThemedText style={styles.dayName}>{dayLabel(day)}</ThemedText>
              {range ? (
                <View style={styles.rangeControls}>
                  <Stepper
                    icon="remove"
                    a11yLabel={t('onboarding.hours.startEarlier', { day: dayLabel(day) })}
                    onPress={() => nudge(day, 0, -STEP)}
                  />
                  <ThemedText variant="caption">{formatMinutes(range[0])}</ThemedText>
                  <Stepper
                    icon="add"
                    a11yLabel={t('onboarding.hours.startLater', { day: dayLabel(day) })}
                    onPress={() => nudge(day, 0, STEP)}
                  />
                  <ThemedText variant="caption">–</ThemedText>
                  <Stepper
                    icon="remove"
                    a11yLabel={t('onboarding.hours.endEarlier', { day: dayLabel(day) })}
                    onPress={() => nudge(day, 1, -STEP)}
                  />
                  <ThemedText variant="caption">{formatMinutes(range[1])}</ThemedText>
                  <Stepper
                    icon="add"
                    a11yLabel={t('onboarding.hours.endLater', { day: dayLabel(day) })}
                    onPress={() => nudge(day, 1, STEP)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        <ThemedText variant="h2" style={styles.sleepTitle}>
          {t('onboarding.hours.sleep.title')}
        </ThemedText>
        <View
          style={styles.dayRow}
          accessible
          accessibilityLabel={t('onboarding.hours.sleep.a11y', {
            start: formatMinutes(sleepWindow[0]),
            end: formatMinutes(sleepWindow[1]),
          })}
        >
          <View style={styles.rangeControls}>
            <Stepper
              icon="remove"
              a11yLabel={t('onboarding.hours.sleep.startEarlier')}
              onPress={() => nudgeSleep(0, -STEP)}
            />
            <ThemedText variant="caption">{formatMinutes(sleepWindow[0])}</ThemedText>
            <Stepper
              icon="add"
              a11yLabel={t('onboarding.hours.sleep.startLater')}
              onPress={() => nudgeSleep(0, STEP)}
            />
            <ThemedText variant="caption">–</ThemedText>
            <Stepper
              icon="remove"
              a11yLabel={t('onboarding.hours.sleep.endEarlier')}
              onPress={() => nudgeSleep(1, -STEP)}
            />
            <ThemedText variant="caption">{formatMinutes(sleepWindow[1])}</ThemedText>
            <Stepper
              icon="add"
              a11yLabel={t('onboarding.hours.sleep.endLater')}
              onPress={() => nudgeSleep(1, STEP)}
            />
          </View>
        </View>

        {!valid ? (
          <ThemedText variant="caption" style={styles.error}>
            {t('onboarding.hours.error')}
          </ThemedText>
        ) : null}
        <Button
          label={t('onboarding.continue')}
          disabled={!valid}
          onPress={() => {
            track('onboarding_step_completed', { step: 'hours' });
            router.push('/onboarding/categories');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 10, paddingBottom: 32 },
  intro: { marginBottom: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8, flexWrap: 'wrap' },
  dayName: { width: 92 },
  rangeControls: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  stepper: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sleepTitle: { marginTop: 16 },
  error: { marginTop: 4 },
});
