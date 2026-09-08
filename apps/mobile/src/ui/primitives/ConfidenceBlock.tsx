/**
 * Recommendation-block primitive — the confidence-=-solidity semantic (File 02 §3.1,
 * FR-22): the panel background tracks model confidence; ε-slice blocks get a dashed border
 * and an "Experiment" tag. Copy always renders at full opacity (NFR-A1) — solidity lives
 * in the chrome, never the text.
 *
 * Accessibility: the block reads as ONE element (a recommendation card), with a composed
 * label — `contentLabel` (what/when, supplied by the caller from P6 on) + experiment tag +
 * confidence percentage + `stateLabel` (the fact on the card: "Not done — back in your Inbox")
 * — because opacity is invisible to screen readers (NFR-A1). A labelled `accessible` container
 * is a LEAF for VoiceOver and TalkBack: nothing inside it is reachable, so the action row must
 * be offered as custom accessibility actions (`accessibilityActions` + `onAccessibilityAction`
 * — the VoiceOver rotor / the TalkBack actions menu). Found on the iPhone 12 (hardware pass
 * 2026-09-07 items 35, 41; 2026-09-08 item 58 for the state): a screen-reader user could plan
 * but never start, finish, skip or move a block, and heard a lapsed block as a plan.
 *
 * Related UI contracts (File 02 §3.4, CLAUDE.md invariant 14): skip is never red; the
 * danger color is reserved for destructive actions and missed hard deadlines.
 */
import type { PropsWithChildren } from 'react';
import { type AccessibilityActionEvent, StyleSheet, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../theme';
import { confidenceOpacity, EXPERIMENT_BORDER, NULL_CONFIDENCE_RENDER } from '../tokens/confidence';
import { GlassPanel } from './GlassPanel';
import { ThemedText } from './ThemedText';

export interface ConfidenceBlockProps extends PropsWithChildren {
  /** Model confidence ∈ [0,1] (recommendations.confidence); null on heuristic rows. */
  confidence: number | null;
  /** ε-slice exploration block (recommendations.is_experiment, FR-22). */
  isExperiment?: boolean;
  /** Screen-reader description of the block content ("Deep work, 9:00–10:30"). */
  contentLabel?: string;
  /** The block's current state, spoken after the confidence ("Not done — back in your Inbox"). */
  stateLabel?: string;
  /** Custom accessibility actions (the action row for screen readers). */
  accessibilityActions?: readonly { name: string; label: string }[];
  onAccessibilityAction?: (name: string) => void;
}

export function ConfidenceBlock({
  confidence,
  isExperiment = false,
  contentLabel,
  stateLabel,
  accessibilityActions,
  onAccessibilityAction,
  children,
}: ConfidenceBlockProps) {
  const theme = useTheme();
  const percent =
    confidence === null ? null : Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const label = [
    contentLabel,
    isExperiment ? t('block.experiment') : undefined,
    percent === null ? undefined : t('block.confidence.a11y', { percent }),
    stateLabel,
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ');
  const actions =
    accessibilityActions !== undefined && accessibilityActions.length > 0
      ? accessibilityActions
      : undefined;

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityActions={actions}
      onAccessibilityAction={
        actions === undefined || onAccessibilityAction === undefined
          ? undefined
          : (e: AccessibilityActionEvent) => onAccessibilityAction(e.nativeEvent.actionName)
      }
    >
      <GlassPanel
        solidity={confidenceOpacity(confidence ?? NULL_CONFIDENCE_RENDER)}
        style={
          isExperiment
            ? {
                borderStyle: EXPERIMENT_BORDER.style,
                borderWidth: EXPERIMENT_BORDER.width,
                borderColor: theme.colors.textSecondary,
              }
            : undefined
        }
      >
        {isExperiment ? (
          <ThemedText variant="caption" tone="secondary" style={styles.experimentTag}>
            {t('block.experiment')}
          </ThemedText>
        ) : null}
        {children}
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  experimentTag: { marginBottom: 4 },
});
