/**
 * One glass recommendation block on the Today timeline (FR-21 rationale sentence, FR-22
 * confidence = solidity + "Experiment" label via ConfidenceBlock). Title/time/rationale wrap
 * freely so 200 % font scale grows the card instead of clipping (NFR-A2).
 *
 * Motion (ADR-0022): the block is wrapped in an `Animated.View` that plays the S2 arrival
 * settle (`useSettle`, `springs.emphasized`) once when the card is (re)bound to a block the
 * list just scrolled to. The wrapper carries no accessibility props — the `accessible` leaf
 * stays the block's own View, so the screen-reader tree is unchanged.
 *
 * THE RULE — a transition on a control-bearing surface never passes through an invisible or
 * non-interactive state. This card's Start / Done / Skip become facts (invariant 2), and the
 * blank-card defect (`e7bb05e`, corrections #53) was a card mounted but not painted whose
 * controls were live. Therefore: transforms only — never opacity; rest values assigned
 * synchronously on rebind; no `entering` / `exiting` (they hold the view at progress 0 and
 * misfire under recycling); nothing a dropped completion callback could leave half-way
 * invisible.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { RecommendationRow } from '../../db/plans';
import { rationaleSentence } from '../../domain/rationale';
import { formatTime, t } from '../../i18n';
import { useSettle } from '../motion';
import { ConfidenceBlock, ThemedText } from '../primitives';
import { resolveMotion, type SpringSpec } from '../tokens/motion';
import { type BlockAction, actionLabel, actionsFor } from './BlockActions';

/** No settle unless the timeline asks for one: a read-only render sits at rest. */
const STILL_SPRING: SpringSpec = resolveMotion(true).springs.emphasized;

export function formatClock(date: Date): string {
  return formatTime(date);
}

export interface RecommendationCardProps {
  recommendation: RecommendationRow;
  title: string;
  /** > 1 when the task is split into chunks (File 04 §1.3 C3). */
  chunkCount?: number;
  /** A focus session is running/paused on this block (P7). */
  active?: boolean;
  /** Action row (P7 BlockActions); omitted on read-only renders. */
  actions?: ReactNode;
  /**
   * The same handler the action row calls — offered to screen readers as custom actions on the
   * card, because the labelled card is a leaf for VoiceOver/TalkBack and the row's buttons are
   * unreachable (hardware pass 2026-09-07 item 35). Omitted on read-only renders.
   */
  onAction?: (action: BlockAction, recommendation: RecommendationRow) => void;
  /** Another block's session is running — Start is not offered. */
  busyElsewhere?: boolean;
  /**
   * `Date.now()` of the arrival this card should settle on (S2, ADR-0022); 0 = none. Plays
   * once per stamp, only when the card is (re)bound to this block inside the trigger window.
   */
  settleAt?: number;
  /** The settle spring, already resolved for reduced motion (duration 0 = assigned at rest). */
  settleSpring?: SpringSpec;
}

/**
 * Status caption (P7): neutral wording for every outcome — a lapse or a skip is a data point,
 * never a failure state (FR-23 "never as an error state"; no guilt UI, invariant 14).
 */
export function statusCaptionKey(
  status: RecommendationRow['status'],
  active: boolean,
):
  | 'block.status.active'
  | 'block.status.completed'
  | 'block.status.lapsed'
  | 'block.status.skipped'
  | 'block.status.moved'
  | 'block.status.displaced'
  | 'block.status.displacedPending'
  | null {
  if (active) return 'block.status.active';
  switch (status) {
    case 'displaced_pending':
      return 'block.status.displacedPending';
    case 'displaced':
      return 'block.status.displaced';
    case 'completed':
      return 'block.status.completed';
    case 'lapsed':
      return 'block.status.lapsed';
    case 'rejected':
      return 'block.status.skipped';
    case 'moved':
      return 'block.status.moved';
    default:
      return null;
  }
}

export function RecommendationCard({
  recommendation: r,
  title,
  chunkCount = 1,
  active = false,
  actions,
  onAction,
  busyElsewhere = false,
  settleAt = 0,
  settleSpring = STILL_SPRING,
}: RecommendationCardProps) {
  const settle = useSettle({ key: r.id, playedAt: settleAt, spring: settleSpring });
  const start = formatClock(r.slotStart);
  const end = formatClock(r.slotEnd);
  const captionKey = statusCaptionKey(r.status, active);
  const a11yActions =
    onAction === undefined
      ? undefined
      : actionsFor(r.status, active)
          .filter((action) => !(action === 'start' && busyElsewhere))
          .map((action) => ({ name: action, label: actionLabel(action) }));
  const rationale = rationaleSentence(
    r.rationaleKey ?? 'best_available',
    r.rationaleParams as Record<string, unknown> | null,
  );
  return (
    <Animated.View style={settle} testID={`block-settle-${r.id}`}>
      <ConfidenceBlock
        confidence={r.confidence}
        isExperiment={r.isExperiment}
        contentLabel={t('today.block.a11y', { title, start, end })}
        stateLabel={captionKey ? t(captionKey) : undefined}
        accessibilityActions={a11yActions}
        onAccessibilityAction={
          onAction === undefined ? undefined : (name) => onAction(name as BlockAction, r)
        }
      >
        <View style={styles.header}>
          <ThemedText variant="body" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText variant="caption" tone="secondary" mono>
            {t('today.block.time', { start, end })}
          </ThemedText>
        </View>
        {chunkCount > 1 ? (
          <ThemedText variant="caption" tone="secondary">
            {t('today.block.chunk', { n: r.chunkIndex + 1 })}
          </ThemedText>
        ) : null}
        <ThemedText variant="caption" tone="secondary" style={styles.rationale}>
          {rationale}
        </ThemedText>
        {captionKey ? (
          <ThemedText
            variant="caption"
            tone="secondary"
            // the state is in the words; success green fails AA as body text on the light surface
            // (2.4:1 — P10 a11y audit), so the caption keeps the secondary text colour
            style={styles.status}
          >
            {t(captionKey)}
          </ThemedText>
        ) : null}
        {actions}
      </ConfidenceBlock>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontFamily: 'Inter_600SemiBold' },
  rationale: { marginTop: 6 },
  status: { marginTop: 6 },
});
