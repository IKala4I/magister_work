/**
 * Recommendation-block primitive — the confidence-=-solidity semantic (File 02 §3.1,
 * FR-22): opacity tracks model confidence; ε-slice blocks get a dashed border and an
 * "Experiment" tag. Solidity is announced to screen readers as a percentage, because
 * opacity alone is invisible to them (NFR-A1).
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../theme';
import { confidenceOpacity, EXPERIMENT_BORDER } from '../tokens/confidence';
import { GlassPanel } from './GlassPanel';
import { ThemedText } from './ThemedText';

export interface ConfidenceBlockProps extends PropsWithChildren {
  /** Model confidence ∈ [0,1] (recommendations.confidence). */
  confidence: number;
  /** ε-slice exploration block (recommendations.is_experiment, FR-22). */
  isExperiment?: boolean;
}

export function ConfidenceBlock({
  confidence,
  isExperiment = false,
  children,
}: ConfidenceBlockProps) {
  const theme = useTheme();
  const percent = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  return (
    <View
      accessible
      accessibilityLabel={t('block.confidence.a11y', { percent })}
      style={{ opacity: confidenceOpacity(confidence) }}
    >
      <GlassPanel
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
