/**
 * FR-33 / UC-08 weekly review: adherence trend (PAR per ISO week from the `insights` document —
 * File 06 §1.4, never a reward), the 2–3 most confident learnings with ✓/✗ toggles (corrections
 * become high-weight labels, ADR-0013), a "tell Hourwell" picker for the spec's own example
 * ("actually, I *am* a morning person" = a ✓ on the morning cell), and a done button that logs
 * the review-completed event. Neutral tone throughout: a dip is data, not a verdict (no guilt
 * UI, invariant 14).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TASK_CATEGORIES } from '../../db/schema';
import type { TaskCategory } from '../../db/tasks';
import {
  type AdherenceWeek,
  adherenceTrend,
  type Belief,
  type BeliefLabel,
  DAYPART_ORDER,
  type Daypart,
  reviewLearnings,
} from '../../domain/heatmap';
import { t, type MessageKey } from '../../i18n';
import { Button, ThemedText } from '../primitives';
import { useTheme } from '../theme';

import { BeliefCard } from './BeliefCard';

const CATEGORY_KEYS = {
  deep: 'task.category.deep',
  admin: 'task.category.admin',
  physical: 'task.category.physical',
  learning: 'task.category.learning',
} as const satisfies Record<string, MessageKey>;
const DAYPART_KEYS = {
  EM: 'daypart.EM',
  MO: 'daypart.MO',
  MD: 'daypart.MD',
  AF: 'daypart.AF',
  EV: 'daypart.EV',
  NT: 'daypart.NT',
} as const satisfies Record<string, MessageKey>;

export interface WeeklyReviewProps {
  adherence: AdherenceWeek[];
  beliefs: Belief[];
  labelOf: (stateRef: string) => Exclude<BeliefLabel, 'none'> | null;
  pendingOf: (stateRef: string) => boolean;
  onLabel: (belief: Belief, label: BeliefLabel) => void;
  onTell: (category: TaskCategory, daypart: Daypart) => void;
  onDone: (summary: { learnings: number; trend: ReturnType<typeof adherenceTrend> }) => void;
  /** Already completed for the current week → the thanks line instead of the button. */
  doneThisWeek: boolean;
}

export function WeeklyReview({
  adherence,
  beliefs,
  labelOf,
  pendingOf,
  onLabel,
  onTell,
  onDone,
  doneThisWeek,
}: WeeklyReviewProps) {
  const theme = useTheme();
  const learnings = reviewLearnings(beliefs);
  const trend = adherenceTrend(adherence);
  const [tellCategory, setTellCategory] = useState<TaskCategory>('deep');
  const [told, setTold] = useState<{ category: TaskCategory; daypart: Daypart } | null>(null);

  return (
    <View style={styles.section}>
      <ThemedText variant="h2">{t('review.title')}</ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {t('review.subtitle')}
      </ThemedText>

      <ThemedText variant="body" style={styles.heading}>
        {t('review.adherence.title')}
      </ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {t('review.adherence.body')}
      </ThemedText>
      {adherence.length === 0 ? (
        <ThemedText variant="caption" tone="secondary">
          {t('review.adherence.empty')}
        </ThemedText>
      ) : (
        <View style={styles.weeks} accessibilityRole="list">
          {adherence.map((w) => {
            const percent = Math.round(w.par * 100);
            return (
              <View
                key={w.week}
                accessible
                accessibilityLabel={t('review.adherence.week.a11y', {
                  week: w.week,
                  percent,
                  count: w.n,
                })}
                style={styles.weekRow}
              >
                <ThemedText variant="caption" tone="secondary" mono style={styles.weekLabel}>
                  {w.week.slice(5)}
                </ThemedText>
                <View style={[styles.track, { backgroundColor: theme.colors.primaryContainer }]}>
                  <View
                    style={[
                      styles.bar,
                      { width: `${percent}%`, backgroundColor: theme.colors.primary },
                    ]}
                  />
                </View>
                <ThemedText variant="caption" mono style={styles.weekValue}>
                  {t('review.adherence.week', { percent, count: w.n })}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}
      {trend !== null ? (
        <ThemedText variant="caption" tone="secondary">
          {t(
            trend === 'up'
              ? 'review.trend.up'
              : trend === 'down'
                ? 'review.trend.down'
                : 'review.trend.flat',
          )}
        </ThemedText>
      ) : null}

      <ThemedText variant="body" style={styles.heading}>
        {t('review.learnings.title')}
      </ThemedText>
      {learnings.length === 0 ? (
        <ThemedText variant="caption" tone="secondary">
          {t('review.learnings.empty')}
        </ThemedText>
      ) : (
        learnings.map((b) => (
          <BeliefCard
            key={`review-${b.state_ref}`}
            belief={b}
            label={labelOf(b.state_ref)}
            pending={pendingOf(b.state_ref)}
            onLabel={(label) => onLabel(b, label)}
          />
        ))
      )}

      <ThemedText variant="body" style={styles.heading}>
        {t('review.tell.title')}
      </ThemedText>
      <View style={styles.chips} accessibilityRole="tablist">
        {TASK_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="tab"
            accessibilityState={{ selected: c === tellCategory }}
            accessibilityLabel={t(CATEGORY_KEYS[c])}
            onPress={() => setTellCategory(c)}
            style={[
              styles.chip,
              {
                backgroundColor: c === tellCategory ? theme.colors.primaryContainer : 'transparent',
                borderColor: theme.colors.primaryContainer,
              },
            ]}
          >
            <ThemedText variant="caption">{t(CATEGORY_KEYS[c])}</ThemedText>
          </Pressable>
        ))}
      </View>
      <ThemedText variant="caption" tone="secondary">
        {t('review.tell.body', { category: t(CATEGORY_KEYS[tellCategory]).toLowerCase() })}
      </ThemedText>
      <View style={styles.chips}>
        {DAYPART_ORDER.map((dp) => (
          <Pressable
            key={dp}
            accessibilityRole="button"
            accessibilityLabel={t('review.tell.pick.a11y', {
              category: t(CATEGORY_KEYS[tellCategory]).toLowerCase(),
              daypart: t(DAYPART_KEYS[dp]),
            })}
            onPress={() => {
              setTold({ category: tellCategory, daypart: dp });
              onTell(tellCategory, dp);
            }}
            style={[styles.chip, { borderColor: theme.colors.primaryContainer }]}
            testID={`tell-${tellCategory}-${dp}`}
          >
            <ThemedText variant="caption">{t(DAYPART_KEYS[dp])}</ThemedText>
          </Pressable>
        ))}
      </View>
      {told ? (
        <ThemedText variant="caption" tone="secondary">
          {t('review.tell.done', {
            category: t(CATEGORY_KEYS[told.category]).toLowerCase(),
            daypart: t(DAYPART_KEYS[told.daypart]),
          })}
        </ThemedText>
      ) : null}

      {doneThisWeek ? (
        <ThemedText variant="caption" tone="secondary" style={styles.heading}>
          {t('review.done.thanks')}
        </ThemedText>
      ) : (
        <Button
          label={t('review.done')}
          onPress={() => onDone({ learnings: learnings.length, trend })}
          style={styles.heading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 24 },
  heading: { marginTop: 8 },
  weeks: { gap: 6 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekLabel: { width: 36 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  weekValue: { minWidth: 120 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
