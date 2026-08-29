/**
 * FR-40 energy heatmap — hour × weekday grid of the learned completion-probability model for
 * one category, coloured by OKLCH interpolation between the spec's `energyLow` and `energyHigh`
 * tokens; confidence = solidity (File 02 §3.1): a cell's colour is composited over the surface
 * at an alpha that grows with its effective evidence, so assumed hours look faint and observed
 * hours look solid. Plain Views rather than a canvas [INFERRED, ADR-0013 §5]: 126 rects need no
 * GPU path, every row grows with the font scale (NFR-A2), and the grid exposes ONE accessible
 * summary plus a text view — colour is never the only channel (NFR-A1).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskCategory } from '../../db/tasks';
import { TASK_CATEGORIES } from '../../db/schema';
import {
  buildHeatmapGrid,
  evidenceSolidity,
  type DayTypeSummary,
  type HeatmapCell,
  heatmapTextSummary,
} from '../../domain/heatmap';
import { t, type MessageKey } from '../../i18n';
import { Button, ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { CONFIDENCE_OPACITY_MAX, CONFIDENCE_OPACITY_MIN } from '../tokens/confidence';
import { blendOverHex } from '../tokens/contrast';
import { interpolateOklch } from '../tokens/oklch';

export interface EnergyHeatmapProps {
  cells: HeatmapCell[];
  category: TaskCategory;
  onCategoryChange: (category: TaskCategory) => void;
}

const CATEGORY_KEYS: Record<TaskCategory, MessageKey> = {
  deep: 'task.category.deep',
  admin: 'task.category.admin',
  physical: 'task.category.physical',
  learning: 'task.category.learning',
};
const DAYPART_KEYS = {
  EM: 'daypart.EM',
  MO: 'daypart.MO',
  MD: 'daypart.MD',
  AF: 'daypart.AF',
  EV: 'daypart.EV',
  NT: 'daypart.NT',
} as const satisfies Record<string, MessageKey>;

/** Opaque cell colour: the OKLCH ramp at `mean`, composited at the evidence solidity. */
export function cellColor(
  mean: number,
  nEffective: number,
  colors: { energyLow: string; energyHigh: string; surface: string },
): string {
  const alpha =
    CONFIDENCE_OPACITY_MIN +
    (CONFIDENCE_OPACITY_MAX - CONFIDENCE_OPACITY_MIN) * evidenceSolidity(nEffective);
  return blendOverHex(
    interpolateOklch(colors.energyLow, colors.energyHigh, mean),
    alpha,
    colors.surface,
  );
}

function summarySentence(s: DayTypeSummary): string {
  if (s.best === null || s.lowest === null) return t('heatmap.summary.none');
  return t(s.dayType === 'weekday' ? 'heatmap.summary.weekday' : 'heatmap.summary.weekend', {
    best: t(DAYPART_KEYS[s.best.daypart]),
    bestPercent: s.best.percent,
    lowest: t(DAYPART_KEYS[s.lowest.daypart]),
    lowestPercent: s.lowest.percent,
  });
}

export function EnergyHeatmap({ cells, category, onCategoryChange }: EnergyHeatmapProps) {
  const theme = useTheme();
  const [asText, setAsText] = useState(false);
  const grid = buildHeatmapGrid(cells, category);
  const summary = heatmapTextSummary(cells, category);
  const categoryLabel = t(CATEGORY_KEYS[category]);
  const gridLabel = t('heatmap.grid.a11y', {
    category: categoryLabel,
    summary: summary.map(summarySentence).join(' '),
  });
  const legend = [0, 0.25, 0.5, 0.75, 1].map((m) => cellColor(m, 100, theme.colors));

  return (
    <View style={styles.section}>
      <ThemedText variant="h2">{t('heatmap.title')}</ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {t('heatmap.subtitle', { category: categoryLabel })}
      </ThemedText>
      <View style={styles.chips} accessibilityRole="tablist">
        {TASK_CATEGORIES.map((c) => {
          const selected = c === category;
          return (
            <Pressable
              key={c}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t('heatmap.category.a11y', { category: t(CATEGORY_KEYS[c]) })}
              onPress={() => onCategoryChange(c)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.colors.primaryContainer : 'transparent',
                  borderColor: theme.colors.primaryContainer,
                },
              ]}
              testID={`heatmap-category-${c}`}
            >
              <ThemedText variant="caption">{t(CATEGORY_KEYS[c])}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {asText ? (
        <View style={styles.textView} accessibilityRole="list">
          {summary.map((s) => (
            <View key={s.dayType} style={styles.textBlock}>
              <ThemedText variant="body">
                {t(s.dayType === 'weekday' ? 'heatmap.text.weekday' : 'heatmap.text.weekend')}
              </ThemedText>
              {s.rows.length === 0 ? (
                <ThemedText variant="caption" tone="secondary">
                  {t('heatmap.summary.none')}
                </ThemedText>
              ) : (
                s.rows.map((r) => (
                  <ThemedText key={r.daypart} variant="caption" tone="secondary">
                    {t(r.personal ? 'heatmap.text.row.personal' : 'heatmap.text.row', {
                      daypart: t(DAYPART_KEYS[r.daypart]),
                      percent: r.percent,
                    })}
                  </ThemedText>
                ))
              )}
            </View>
          ))}
        </View>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={gridLabel}
          importantForAccessibility="yes"
          style={styles.grid}
          testID="heatmap-grid"
        >
          <View style={styles.row}>
            <View style={styles.hourCell} />
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <ThemedText
                key={d}
                variant="caption"
                tone="secondary"
                style={styles.dayLabel}
                importantForAccessibility="no"
              >
                {t(`weekday.${d}` as MessageKey)}
              </ThemedText>
            ))}
          </View>
          {grid.map((row) => (
            <View key={row.hour} style={styles.row}>
              <ThemedText variant="caption" tone="secondary" mono style={styles.hourCell}>
                {String(row.hour).padStart(2, '0')}
              </ThemedText>
              {row.cells.map((cell) => (
                <View
                  key={cell.weekday}
                  testID={`heatmap-cell-${row.hour}-${cell.weekday}`}
                  style={[
                    styles.cell,
                    {
                      backgroundColor:
                        cell.mean === null
                          ? 'transparent'
                          : cellColor(cell.mean, cell.nEffective, theme.colors),
                      borderColor: theme.colors.primaryContainer,
                    },
                    cell.personal && { borderColor: theme.colors.textSecondary },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        <ThemedText variant="caption" tone="secondary">
          {t('heatmap.legend.low')}
        </ThemedText>
        {legend.map((color, i) => (
          <View key={i} style={[styles.swatch, { backgroundColor: color }]} />
        ))}
        <ThemedText variant="caption" tone="secondary">
          {t('heatmap.legend.high')}
        </ThemedText>
      </View>
      <ThemedText variant="caption" tone="secondary">
        {t('heatmap.legend.solidity')}
      </ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {t('heatmap.legend.resolution')}
      </ThemedText>
      <Button
        label={asText ? t('heatmap.showGrid') : t('heatmap.showText')}
        kind="secondary"
        onPress={() => setAsText((v) => !v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  grid: { gap: 2, marginTop: 4 },
  row: { flexDirection: 'row', gap: 2, alignItems: 'stretch' },
  hourCell: { width: 32, textAlign: 'right', paddingRight: 4 },
  dayLabel: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 16, borderRadius: 3, borderWidth: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  swatch: { width: 22, height: 12, borderRadius: 3 },
  textView: { gap: 12, marginTop: 4 },
  textBlock: { gap: 2 },
});
