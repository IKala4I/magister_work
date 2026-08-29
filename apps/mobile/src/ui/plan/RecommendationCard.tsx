/**
 * One glass recommendation block on the Today timeline (FR-21 rationale sentence, FR-22
 * confidence = solidity + "Experiment" label via ConfidenceBlock). Title/time/rationale wrap
 * freely so 200 % font scale grows the card instead of clipping (NFR-A2).
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { rationaleSentence } from '../../domain/rationale';
import { t } from '../../i18n';
import { ConfidenceBlock, ThemedText } from '../primitives';
import { useTheme } from '../theme';

export function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
}: RecommendationCardProps) {
  const theme = useTheme();
  const start = formatClock(r.slotStart);
  const end = formatClock(r.slotEnd);
  const captionKey = statusCaptionKey(r.status, active);
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
      {captionKey ? (
        <ThemedText
          variant="caption"
          style={[
            styles.status,
            {
              color:
                captionKey === 'block.status.completed'
                  ? theme.colors.success
                  : theme.colors.textSecondary,
            },
          ]}
        >
          {t(captionKey)}
        </ThemedText>
      ) : null}
      {actions}
    </ConfidenceBlock>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontFamily: 'Inter_600SemiBold' },
  rationale: { marginTop: 6 },
  status: { marginTop: 6 },
});
