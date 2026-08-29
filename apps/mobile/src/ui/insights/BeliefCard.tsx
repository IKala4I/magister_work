/**
 * FR-41 "What Hourwell believes about you" — one learned belief in plain language with a ✓/✗
 * toggle (direct model feedback). Phrasing follows the cold-start rung (specs/07 §3.6, ADR-0010
 * §11): population wording ("people like you…") while the cell is still prior-dominated,
 * personal wording ("you…") once it is. Solidity = the belief's confidence (File 02 §3.1). A
 * label is a fact the server applies as a high-weight correction (ADR-0013); the card says so
 * without a percentage claim.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import type { Belief, BeliefLabel } from '../../domain/heatmap';
import { t, type MessageKey } from '../../i18n';
import { GlassPanel, ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { confidenceOpacity } from '../tokens/confidence';

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

export function beliefStatement(b: Belief): string {
  const params = {
    category: t(CATEGORY_KEYS[b.category]).toLowerCase(),
    daypart: t(DAYPART_KEYS[b.daypart]),
    dayType: t(b.day_type === 'weekday' ? 'beliefs.dayType.weekday' : 'beliefs.dayType.weekend'),
  };
  if (!b.affinity) return t('beliefs.statement.weak', params);
  return t(b.personal ? 'beliefs.statement.personal' : 'beliefs.statement.population', params);
}

export interface BeliefCardProps {
  belief: Belief;
  /** The label in force (server's, or the device's newer local fact). */
  label: Exclude<BeliefLabel, 'none'> | null;
  /** True while a local label has not been acknowledged by a sync yet. */
  pending?: boolean;
  onLabel: (label: BeliefLabel) => void;
}

export function BeliefCard({ belief, label, pending = false, onLabel }: BeliefCardProps) {
  const theme = useTheme();
  const statement = beliefStatement(belief);
  const evidence =
    belief.n_effective >= 0.5
      ? t('beliefs.evidence', { count: Math.round(belief.n_effective) })
      : t('beliefs.evidence.none');
  const labelState =
    label === 'correct'
      ? t('beliefs.labeled.correct')
      : label === 'incorrect'
        ? t('beliefs.labeled.incorrect')
        : '';
  // the statement is ONE readable element carrying evidence + label state; the toggles stay
  // separate focusable siblings — a wrapper marked `accessible` would swallow them on iOS
  // (P9 adversarial #4)
  return (
    <View style={styles.wrap}>
      <GlassPanel solidity={confidenceOpacity(belief.confidence)} style={styles.panel}>
        <ThemedText
          variant="body"
          accessibilityRole="text"
          accessibilityLabel={t('beliefs.a11y', { statement, evidence, labelState })}
        >
          {statement}
        </ThemedText>
        <View style={styles.meta}>
          {belief.affinity ? (
            <ThemedText variant="caption" tone="secondary">
              {t('beliefs.factor', { percent: Math.round((belief.factor - 1) * 100) })}
            </ThemedText>
          ) : null}
          <ThemedText variant="caption" tone="secondary">
            {evidence}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: label === 'correct' }}
            accessibilityLabel={t('beliefs.correct.a11y', { statement })}
            onPress={() => onLabel(label === 'correct' ? 'none' : 'correct')}
            style={[
              styles.toggle,
              { borderColor: theme.colors.primaryContainer },
              label === 'correct' && { backgroundColor: theme.colors.primaryContainer },
            ]}
            testID={`belief-correct-${belief.state_ref}`}
          >
            <ThemedText variant="body">✓</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: label === 'incorrect' }}
            accessibilityLabel={t('beliefs.incorrect.a11y', { statement })}
            onPress={() => onLabel(label === 'incorrect' ? 'none' : 'incorrect')}
            style={[
              styles.toggle,
              { borderColor: theme.colors.primaryContainer },
              label === 'incorrect' && { backgroundColor: theme.colors.primaryContainer },
            ]}
            testID={`belief-incorrect-${belief.state_ref}`}
          >
            <ThemedText variant="body">✗</ThemedText>
          </Pressable>
          {labelState ? (
            <ThemedText
              variant="caption"
              tone="secondary"
              style={styles.labelState}
              importantForAccessibility="no"
            >
              {labelState}
              {pending ? ` ${t('beliefs.pending')}` : ''}
            </ThemedText>
          ) : null}
        </View>
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  panel: { gap: 6 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  toggle: {
    minWidth: 48,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelState: { flex: 1, flexBasis: 160 },
});
