/**
 * Today timeline (File 02 §3.5): blocks in slot order with a time gutter and a "Now" marker.
 * A row list rather than a pixel-proportional canvas [INFERRED]: rows grow with content, so
 * 200 % font scale and long rationales never overlap the next block (NFR-A2) and every block
 * is one accessible element in reading order (NFR-A1). Gaps between blocks are shown as a
 * thin spacer whose height is proportional to the gap, capped, so the day's shape still reads.
 */
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

import { formatClock, RecommendationCard } from './RecommendationCard';

export interface TimelineProps {
  recommendations: RecommendationRow[];
  titles: Map<string, string>;
  now: Date;
}

type Row =
  | { kind: 'block'; key: string; rec: RecommendationRow; chunkCount: number; gapMinutes: number }
  | { kind: 'now'; key: string };

export const GAP_PX_PER_MINUTE = 0.4;
export const GAP_MAX_PX = 48;

export function buildRows(recommendations: RecommendationRow[], now: Date): Row[] {
  const chunkCounts = new Map<string, number>();
  for (const r of recommendations) chunkCounts.set(r.taskId, (chunkCounts.get(r.taskId) ?? 0) + 1);
  const rows: Row[] = [];
  let nowPlaced = false;
  let prevEnd: Date | null = null;
  for (const rec of recommendations) {
    if (!nowPlaced && now < rec.slotStart && (prevEnd === null || now >= prevEnd)) {
      rows.push({ kind: 'now', key: 'now' });
      nowPlaced = true;
    }
    const gapMinutes =
      prevEnd === null ? 0 : Math.max(0, (rec.slotStart.getTime() - prevEnd.getTime()) / 60_000);
    rows.push({
      kind: 'block',
      key: rec.id,
      rec,
      chunkCount: chunkCounts.get(rec.taskId) ?? 1,
      gapMinutes,
    });
    prevEnd = rec.slotEnd;
  }
  return rows;
}

export function Timeline({ recommendations, titles, now }: TimelineProps) {
  const theme = useTheme();
  const rows = buildRows(recommendations, now);
  return (
    <FlashList
      data={rows}
      keyExtractor={(row) => row.key}
      contentContainerStyle={styles.list}
      renderItem={({ item }) =>
        item.kind === 'now' ? (
          <View style={styles.nowRow} accessibilityRole="text" accessibilityLabel={t('today.now')}>
            <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
              {t('today.now')}
            </ThemedText>
            <View style={[styles.nowLine, { backgroundColor: theme.colors.primary }]} />
          </View>
        ) : (
          <View style={{ marginTop: Math.min(item.gapMinutes * GAP_PX_PER_MINUTE, GAP_MAX_PX) }}>
            <View style={styles.row}>
              <View style={styles.gutter}>
                <ThemedText variant="caption" tone="secondary" mono>
                  {formatClock(item.rec.slotStart)}
                </ThemedText>
              </View>
              <View style={styles.card}>
                <RecommendationCard
                  recommendation={item.rec}
                  title={titles.get(item.rec.taskId) ?? t('task.notFound')}
                  chunkCount={item.chunkCount}
                />
              </View>
            </View>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  gutter: { width: 64, paddingTop: 16 },
  card: { flex: 1 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, minHeight: 24 },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
});
