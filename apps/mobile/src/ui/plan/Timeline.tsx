/**
 * Today timeline (File 02 §3.5): blocks in slot order with a time gutter and a "Now" marker.
 * A row list rather than a pixel-proportional canvas [INFERRED]: rows grow with content, so
 * 200 % font scale and long rationales never overlap the next block (NFR-A2) and every block
 * is one accessible element in reading order (NFR-A1). Gaps between blocks are shown as a
 * thin spacer whose height is proportional to the gap, capped, so the day's shape still reads.
 * From P8 the imported busy intervals (FR-03/UC-09) are interleaved as muted rows — the
 * meetings the plan routed around, in the same reading order.
 */
import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CalendarEventRow } from '../../db/calendar';
import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

import { formatClock, RecommendationCard } from './RecommendationCard';

export interface TimelineProps {
  recommendations: RecommendationRow[];
  titles: Map<string, string>;
  now: Date;
  /** Imported busy intervals of the day (P8), already filtered to busy + live rows. */
  busy?: CalendarEventRow[];
  /** Recommendation id with a running/paused focus session (P7). */
  activeRecommendationId?: string | null;
  /** Renders the P7 action row for a block; omitted on read-only renders. */
  renderActions?: (rec: RecommendationRow, title: string) => ReactNode;
}

type Row =
  | { kind: 'block'; key: string; rec: RecommendationRow; chunkCount: number; gapMinutes: number }
  | { kind: 'busy'; key: string; event: CalendarEventRow; gapMinutes: number }
  | { kind: 'now'; key: string };

export const GAP_PX_PER_MINUTE = 0.4;
export const GAP_MAX_PX = 48;

type Item =
  | { kind: 'block'; start: Date; end: Date; rec: RecommendationRow }
  | { kind: 'busy'; start: Date; end: Date; event: CalendarEventRow };

export function buildRows(
  recommendations: RecommendationRow[],
  now: Date,
  busy: CalendarEventRow[] = [],
): Row[] {
  const chunkCounts = new Map<string, number>();
  for (const r of recommendations) chunkCounts.set(r.taskId, (chunkCounts.get(r.taskId) ?? 0) + 1);
  const items: Item[] = [
    ...recommendations.map((rec): Item => ({
      kind: 'block',
      start: rec.slotStart,
      end: rec.slotEnd,
      rec,
    })),
    ...busy.map((event): Item => ({ kind: 'busy', start: event.startAt, end: event.endAt, event })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  const rows: Row[] = [];
  let nowPlaced = false;
  let prevEnd: Date | null = null;
  for (const item of items) {
    if (!nowPlaced && now < item.start && (prevEnd === null || now >= prevEnd)) {
      rows.push({ kind: 'now', key: 'now' });
      nowPlaced = true;
    }
    const gapMinutes =
      prevEnd === null ? 0 : Math.max(0, (item.start.getTime() - prevEnd.getTime()) / 60_000);
    if (item.kind === 'block') {
      rows.push({
        kind: 'block',
        key: item.rec.id,
        rec: item.rec,
        chunkCount: chunkCounts.get(item.rec.taskId) ?? 1,
        gapMinutes,
      });
    } else {
      rows.push({ kind: 'busy', key: `busy-${item.event.id}`, event: item.event, gapMinutes });
    }
    if (prevEnd === null || item.end.getTime() > prevEnd.getTime()) prevEnd = item.end;
  }
  return rows;
}

export function Timeline({
  recommendations,
  titles,
  now,
  busy = [],
  activeRecommendationId = null,
  renderActions,
}: TimelineProps) {
  const theme = useTheme();
  const rows = buildRows(recommendations, now, busy);
  return (
    <FlashList
      data={rows}
      keyExtractor={(row) => row.key}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        if (item.kind === 'now') {
          return (
            <View
              style={styles.nowRow}
              accessibilityRole="text"
              accessibilityLabel={t('today.now')}
            >
              <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
                {t('today.now')}
              </ThemedText>
              <View style={[styles.nowLine, { backgroundColor: theme.colors.primary }]} />
            </View>
          );
        }
        if (item.kind === 'busy') {
          const title = item.event.title ?? t('today.busy.untitled');
          return (
            <View style={{ marginTop: Math.min(item.gapMinutes * GAP_PX_PER_MINUTE, GAP_MAX_PX) }}>
              <View
                style={styles.row}
                accessibilityRole="text"
                accessibilityLabel={t('today.busy.a11y', {
                  title,
                  start: formatClock(item.event.startAt),
                  end: formatClock(item.event.endAt),
                })}
              >
                <View style={styles.gutter}>
                  <ThemedText variant="caption" tone="secondary" mono>
                    {formatClock(item.event.startAt)}
                  </ThemedText>
                </View>
                <View style={[styles.busyCard, { borderColor: theme.colors.textSecondary }]}>
                  <ThemedText tone="secondary" numberOfLines={2}>
                    {title}
                  </ThemedText>
                  <ThemedText variant="caption" tone="secondary" mono>
                    {t('today.block.time', {
                      start: formatClock(item.event.startAt),
                      end: formatClock(item.event.endAt),
                    })}
                  </ThemedText>
                </View>
              </View>
            </View>
          );
        }
        return (
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
                  active={item.rec.id === activeRecommendationId}
                  actions={renderActions?.(
                    item.rec,
                    titles.get(item.rec.taskId) ?? t('task.notFound'),
                  )}
                />
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  gutter: { width: 64, paddingTop: 16 },
  card: { flex: 1 },
  busyCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, minHeight: 24 },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
});
