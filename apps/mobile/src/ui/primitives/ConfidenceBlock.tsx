/**
 * Recommendation-block primitive — the confidence-=-solidity semantic (File 02 §3.1,
 * FR-22): the panel background tracks model confidence; ε-slice blocks get a dashed border
 * and an "Experiment" tag. Copy always renders at full opacity (NFR-A1) — solidity lives
 * in the chrome, never the text.
 *
 * Accessibility: the block reads as ONE element (a recommendation card), with a composed
 * label — `contentLabel` (what/when, supplied by the caller from P6 on) + experiment tag +
 * confidence percentage — because opacity is invisible to screen readers (NFR-A1).
 *
 * Related UI contracts (File 02 §3.4, CLAUDE.md invariant 14): skip is never red; the
 * danger color is reserved for destructive actions and missed hard deadlines.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

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
}

export function ConfidenceBlock({
  confidence,
  isExperiment = false,
  contentLabel,
  children,
}: ConfidenceBlockProps) {
  const theme = useTheme();
  const percent =
    confidence === null ? null : Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const label = [
    contentLabel,
    isExperiment ? t('block.experiment') : undefined,
    percent === null ? undefined : t('block.confidence.a11y', { percent }),
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ');

  return (
    <View accessible accessibilityLabel={label}>
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
