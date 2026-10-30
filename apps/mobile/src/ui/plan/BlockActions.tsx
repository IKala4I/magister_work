/**
 * Quiet action row under a Today block (FR-23/25/30, UC-04/06/07). Every action is a fact the
 * client logs, never a judgement: "Skip" is a plain secondary button (never red — File 02 §3.4),
 * a lapsed block offers "I did it" (UC-04 A1) instead of a reproach. ≥ 44 px targets (NFR-A1);
 * labels wrap at 200 % font scale; the row is one line when it fits and an even grid when not.
 */
import { useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { useFontScale } from '../useFontScale';

export type BlockAction = 'start' | 'done' | 'skip' | 'move' | 'did_it';

export interface BlockActionsProps {
  recommendation: RecommendationRow;
  title: string;
  /** A focus session is running/paused on this block. */
  active: boolean;
  /** Another block's session is running — Start is not offered. */
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

/** The visible label of an action (shared with the card's custom accessibility actions). */
export function actionLabel(action: BlockAction): string {
  return t(LABELS[action]);
}

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

const GAP = 8;

/**
 * How the row lays out at a given width: one natural row when every button fits, otherwise an
 * even grid — two equal columns, or one when even two no longer fit (large font scale). A plain
 * `flexWrap` row broke unevenly ("Start Done Skip" / "Move…" alone on a second line, рис. 3.4
 * shots 2026-10-30). Pure, so the rule is tested without a layout engine.
 */
export function actionColumns(widths: number[], rowWidth: number, gap = GAP): number | null {
  if (widths.length === 0 || rowWidth <= 0) return null;
  const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
  if (total <= rowWidth) return null;
  return 2 * Math.max(...widths) + gap <= rowWidth ? 2 : 1;
}

export function BlockActions({
  recommendation,
  title,
  active,
  busyElsewhere,
  onAction,
}: BlockActionsProps) {
  const theme = useTheme();
  const fontScale = useFontScale();
  // Start is not offered while another block's session runs — the same rule as the card's
  // screen-reader actions; a dimmed button nobody can press only pushed the row onto two lines.
  const actions = actionsFor(recommendation.status, active).filter(
    (action) => !(action === 'start' && busyElsewhere),
  );
  const key = `${actions.join(',')}@${fontScale}`;
  const [rowWidth, setRowWidth] = useState(0);
  // natural button widths, measured once per action set and font scale (before any grid sizing)
  const natural = useRef<{ key: string; widths: number[] }>({ key: '', widths: [] });
  const [measuredKey, setMeasuredKey] = useState('');
  if (actions.length === 0) return null;
  const measured = measuredKey === key && natural.current.key === key;
  const columns = measured ? actionColumns(natural.current.widths, rowWidth) : null;
  const cellWidth =
    columns === null ? undefined : Math.floor((rowWidth - GAP * (columns - 1)) / columns);
  const onRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);
  const onButtonLayout = (i: number) => (e: LayoutChangeEvent) => {
    if (measured) return;
    if (natural.current.key !== key) natural.current = { key, widths: [] };
    natural.current.widths[i] = e.nativeEvent.layout.width;
    if (natural.current.widths.filter((w) => w > 0).length === actions.length) setMeasuredKey(key);
  };
  return (
    <View style={styles.row} onLayout={onRowLayout}>
      {actions.map((action, i) => {
        const label = actionLabel(action);
        const primary = action === 'start' || action === 'did_it';
        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={t('block.action.a11y', { action: label, title })}
            onPress={() => onAction(action, recommendation)}
            onLayout={onButtonLayout(i)}
            style={({ pressed }) => [
              styles.button,
              cellWidth !== undefined && { width: cellWidth },
              primary && { backgroundColor: theme.colors.primaryContainer },
              pressed && styles.dimmed,
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 10 },
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
