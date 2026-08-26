/**
 * One glass recommendation block on the Today timeline (FR-21 rationale sentence, FR-22
 * confidence = solidity + "Experiment" label via ConfidenceBlock). Title/time/rationale wrap
 * freely so 200 % font scale grows the card instead of clipping (NFR-A2).
 */
import { StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { rationaleSentence } from '../../domain/rationale';
import { t } from '../../i18n';
import { ConfidenceBlock, ThemedText } from '../primitives';

export function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface RecommendationCardProps {
  recommendation: RecommendationRow;
  title: string;
  /** > 1 when the task is split into chunks (File 04 §1.3 C3). */
  chunkCount?: number;
}

export function RecommendationCard({
  recommendation: r,
  title,
  chunkCount = 1,
}: RecommendationCardProps) {
  const start = formatClock(r.slotStart);
  const end = formatClock(r.slotEnd);
  const rationale = rationaleSentence(
    r.rationaleKey ?? 'best_available',
    r.rationaleParams as Record<string, unknown> | null,
  );
  return (
    <ConfidenceBlock
      confidence={r.confidence}
      isExperiment={r.isExperiment}
      contentLabel={t('today.block.a11y', { title, start, end })}
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
    </ConfidenceBlock>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontFamily: 'Inter_600SemiBold' },
  rationale: { marginTop: 6 },
});
