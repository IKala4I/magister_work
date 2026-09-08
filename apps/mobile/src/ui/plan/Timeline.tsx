/**
 * Today timeline (File 02 §3.5): blocks in slot order with a time gutter and a "Now" marker.
 * A row list rather than a pixel-proportional canvas [INFERRED]: rows grow with content, so
 * 200 % font scale and long rationales never overlap the next block (NFR-A2) and every block
 * is one accessible element in reading order (NFR-A1). Gaps between blocks are shown as a
 * thin spacer whose height is proportional to the gap, capped, so the day's shape still reads.
 * From P8 the imported busy intervals (FR-03/UC-09) are interleaved as muted rows — the
 * meetings the plan routed around, in the same reading order.
 *
 * Motion (ADR-0022, File 02 §3.4): two transitions and nothing else. S1 — after Done / Skip /
 * I did it the rows below the shrinking card settle into the gap on a cell `layout` spring
 * (`springs.standard`) that is registered only while `layoutSettling` is true (the tap opens a
 * LAYOUT_SETTLE_MS window on the screen). S2 — a moved block keeps its row id, and FlashList v2
 * keeps a cell's render key for an unchanged stable id across a reorder, so the same spring
 * animates the real travel; when the destination is off screen the list scrolls to it
 * (`scrollToIndex`, instant under reduced motion) and the card (re)bound there plays an arrival
 * settle (`RecommendationCard` `settleAt`). Outside the window the `layout` prop is `undefined`,
 * so a recycle during scroll registers no transition — the 60 fps rows (NFR-P2) are untouched.
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type LinearTransition } from 'react-native-reanimated';

import type { CalendarEventRow } from '../../db/calendar';
import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { layoutTransitionFor } from '../motion';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { type MotionConfig, resolveMotion } from '../tokens/motion';
import { useFontScale } from '../useFontScale';

import type { BlockAction } from './BlockActions';
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
  /** The action row's handler, offered on each card as custom accessibility actions. */
  onBlockAction?: (action: BlockAction, rec: RecommendationRow) => void;
  busyElsewhere?: boolean;
  /**
   * Motion resolved once per screen (`resolveMotion(useReducedMotion())`); the default is the
   * still configuration, so a read-only render registers no transition.
   */
  motion?: MotionConfig;
  /** While true the cell `layout` spring is registered (the S1/S2 window, ADR-0022). */
  layoutSettling?: boolean;
  /**
   * The block just confirmed as moved (S2): once the rows carry its new slot, the list scrolls
   * to it if the slot is off screen and the card (re)bound there settles; on screen the cell
   * travels on the layout spring and nothing else plays.
   */
  moved?: MovedBlock | null;
}

export interface MovedBlock {
  id: string;
  /** `Date.now()` at the confirm — a new stamp per move, even to the same slot. */
  at: number;
  /** The slot the write produced (the DAO snaps into the future), as epoch ms. */
  slotStart: number;
}

/** Where the moved block lands in the viewport after `scrollToIndex` (0 = top, 1 = bottom). */
export const MOVED_VIEW_POSITION = 0.3;

/** The cell `layout` transition of the moment — `undefined` outside the settle window. */
export const CellLayoutContext = createContext<LinearTransition | undefined>(undefined);

/**
 * One module-scope cell renderer: FlashList hands it `ref`, `onLayout`, `style`
 * (`position: absolute; top`) and `index`; the `layout` prop comes from context, so changing it
 * re-renders the cells without a new component identity. A component created inside Timeline's
 * render would remount every cell on every render — the kind of bug the simulator flatters.
 */
export function TimelineCell(props: ComponentProps<typeof Animated.View>) {
  const layout = useContext(CellLayoutContext);
  return <Animated.View {...props} layout={layout} />;
}

const STILL = resolveMotion(true);

type Row =
  | { kind: 'block'; key: string; rec: RecommendationRow; chunkCount: number; gapMinutes: number }
  | { kind: 'busy'; key: string; event: CalendarEventRow; gapMinutes: number }
  | { kind: 'now'; key: string };

export const GAP_PX_PER_MINUTE = 0.4;
export const GAP_MAX_PX = 48;
/** Time-gutter width at 1× — fits the widest en-US clock ("12:00 PM") in the caption mono. */
export const GUTTER_WIDTH_PX = 64;

/**
 * The gutter grows with the (capped) font scale so the clock string never wraps mid-token:
 * at 200 % a fixed 64 px gutter broke "12:00 PM" into "12:0" / "0 PM" on the Pixel 7a
 * (hardware pass 2026-09-02 #14, NFR-A2). A minimum, not a fixed width: a longer locale
 * clock widens its own gutter rather than clipping.
 */
export function gutterWidthFor(fontScale: number): number {
  return Math.ceil(GUTTER_WIDTH_PX * fontScale);
}

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
  onBlockAction,
  busyElsewhere = false,
  motion = STILL,
  layoutSettling = false,
  moved = null,
}: TimelineProps) {
  const theme = useTheme();
  const gutterStyle = { minWidth: gutterWidthFor(useFontScale()) };
  const rows = buildRows(recommendations, now, busy);
  const listRef = useRef<FlashListRef<Row>>(null);
  const cellLayout = layoutSettling ? layoutTransitionFor(motion.springs.standard) : undefined;

  // S2: the moved block's row once the rows reflect the write (the slot the DAO produced)
  const movedIndex =
    moved === null
      ? -1
      : rows.findIndex(
          (row) =>
            row.kind === 'block' &&
            row.rec.id === moved.id &&
            row.rec.slotStart.getTime() === moved.slotStart,
        );
  const handledMoveAt = useRef(0);
  const movePending = moved !== null && movedIndex >= 0 && handledMoveAt.current !== moved.at;
  if (movePending) {
    // FlashList's documented one-shot for layout animations (no recycling on the next render),
    // armed on the render that reorders the rows: it is consumed by the first commit after the
    // call, and the screen re-renders once (the picker closing) before the change event lands.
    listRef.current?.prepareForLayoutAnimationRender();
  }
  // the arrival stamp: set when the scroll lands, so the card bound to the moved id settles then
  const [arrival, setArrival] = useState<{ id: string; at: number } | null>(null);
  const reduceMotion = motion.reduceMotion;
  useEffect(() => {
    if (!movePending || moved === null) return;
    handledMoveAt.current = moved.at;
    const list = listRef.current;
    if (list === null) return;
    const { startIndex, endIndex } = list.computeVisibleIndices();
    if (movedIndex >= startIndex && movedIndex <= endIndex) return; // on screen: the cell travelled
    const id = moved.id;
    let live = true;
    void list
      .scrollToIndex({
        index: movedIndex,
        animated: !reduceMotion,
        viewPosition: MOVED_VIEW_POSITION,
      })
      .then(() => {
        if (live) setArrival({ id, at: Date.now() });
      });
    return () => {
      live = false;
    };
  }, [movePending, moved, movedIndex, reduceMotion]);

  return (
    <CellLayoutContext.Provider value={cellLayout}>
      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        CellRendererComponent={TimelineCell}
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
              <View
                style={{ marginTop: Math.min(item.gapMinutes * GAP_PX_PER_MINUTE, GAP_MAX_PX) }}
              >
                <View
                  style={styles.row}
                  accessibilityRole="text"
                  accessibilityLabel={t('today.busy.a11y', {
                    title,
                    start: formatClock(item.event.startAt),
                    end: formatClock(item.event.endAt),
                  })}
                >
                  <View style={[styles.gutter, gutterStyle]} testID={`timeline-gutter-${item.key}`}>
                    <ThemedText variant="caption" tone="secondary" mono numberOfLines={1}>
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
                <View style={[styles.gutter, gutterStyle]} testID={`timeline-gutter-${item.key}`}>
                  <ThemedText variant="caption" tone="secondary" mono numberOfLines={1}>
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
                    onAction={onBlockAction}
                    busyElsewhere={busyElsewhere}
                    settleAt={arrival !== null && arrival.id === item.rec.id ? arrival.at : 0}
                    settleSpring={motion.springs.emphasized}
                  />
                </View>
              </View>
            </View>
          );
        }}
      />
    </CellLayoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  // width comes from gutterWidthFor(fontScale) at render; never shrinks under the card
  gutter: { flexShrink: 0, paddingTop: 16 },
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
