/**
 * Quiet action row under a Today block (FR-23/25/30, UC-04/06/07). Every action is a fact the
 * client logs, never a judgement: "Skip" is a plain secondary button (never red — File 02 §3.4),
 * a lapsed block offers "I did it" (UC-04 A1) instead of a reproach. ≥ 44 px targets (NFR-A1);
 * labels wrap at 200 % font scale.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

export type BlockAction = 'start' | 'done' | 'skip' | 'move' | 'did_it';

export interface BlockActionsProps {
  recommendation: RecommendationRow;
  title: string;
  /** A focus session is running/paused on this block. */
  active: boolean;
  /** Another block's session is running — starting here is disabled. */
  busyElsewhere: boolean;
  onAction: (action: BlockAction, recommendation: RecommendationRow) => void;
}

const LABELS: Record<
  BlockAction,
  | 'block.action.start'
  | 'block.action.done'
  | 'block.action.skip'
  | 'block.action.move'
  | 'block.action.didIt'
> = {
  start: 'block.action.start',
  done: 'block.action.done',
  skip: 'block.action.skip',
  move: 'block.action.move',
  did_it: 'block.action.didIt',
};

export function actionsFor(status: RecommendationRow['status'], active: boolean): BlockAction[] {
  if (active) return [];
  switch (status) {
    case 'shown':
    case 'accepted':
    case 'pinned':
    case 'moved':
      return ['start', 'done', 'skip', 'move'];
    case 'lapsed':
      return ['did_it'];
    default:
      return [];
  }
}

export function BlockActions({
  recommendation,
  title,
  active,
  busyElsewhere,
  onAction,
}: BlockActionsProps) {
  const theme = useTheme();
  const actions = actionsFor(recommendation.status, active);
  if (actions.length === 0) return null;
  return (
    <View style={styles.row}>
      {actions.map((action) => {
        const label = t(LABELS[action]);
        const primary = action === 'start' || action === 'did_it';
        const disabled = action === 'start' && busyElsewhere;
        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={t('block.action.a11y', { action: label, title })}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onAction(action, recommendation)}
            style={({ pressed }) => [
              styles.button,
              primary && { backgroundColor: theme.colors.primaryContainer },
              (pressed || disabled) && styles.dimmed,
            ]}
          >
            <ThemedText variant="caption" tone={primary ? 'primary' : 'secondary'}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.6 },
});
