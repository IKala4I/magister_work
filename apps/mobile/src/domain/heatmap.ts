/**
 * FR-40 energy heatmap — pure mapping from the `insights` document (Beta-cell posteriors per
 * category × daypart × day_type, specs/07 §5) to an hour × weekday grid, plus the text
 * alternative a screen reader gets instead of colour (NFR-A1). The model has six dayparts and
 * two day types (File 04 §3.2), so the 18 × 7 grid repeats a daypart's cell across its hours and
 * a day type's cells across its weekdays — the rendering says so in its legend rather than
 * pretending to hourly resolution. Hours 00–06 lie outside every daypart (sleep window default):
 * rendered as "no model".
 */
import type { TaskCategory } from '../db/tasks';

export type Daypart = 'EM' | 'MO' | 'MD' | 'AF' | 'EV' | 'NT';
export type DayType = 'weekday' | 'weekend';
export type BeliefLabel = 'correct' | 'incorrect' | 'none';

export interface HeatmapCell {
  category: TaskCategory;
  daypart: Daypart;
  day_type: DayType;
  mean: number;
  ci: [number, number];
  n_effective: number;
  personal: boolean;
}

export interface Belief {
  category: TaskCategory;
  day_type: DayType;
  daypart: Daypart;
  mean: number;
  factor: number;
  confidence: number;
  n_effective: number;
  personal: boolean;
  affinity: boolean;
  state_ref: string;
  label: Exclude<BeliefLabel, 'none'> | null;
}

export interface AdherenceWeek {
  week: string;
  par: number;
  n: number;
}

export interface InsightsDocument {
  heatmap: HeatmapCell[];
  beliefs: Belief[];
  adherence: AdherenceWeek[];
  learning_mode: boolean;
  labels: Array<{ state_ref: string; label: BeliefLabel; labeled_at: string }>;
  chronotype_class: 'DM' | 'MM' | 'INT' | 'ME' | 'DE' | null;
  survey_skipped: boolean;
  generated_at: string;
}

/** File 04 §3.2 daypart bounds (start hour inclusive, end exclusive). */
export const DAYPART_HOURS: ReadonlyArray<{ daypart: Daypart; start: number; end: number }> = [
  { daypart: 'EM', start: 6, end: 9 },
  { daypart: 'MO', start: 9, end: 12 },
  { daypart: 'MD', start: 12, end: 14 },
  { daypart: 'AF', start: 14, end: 17 },
  { daypart: 'EV', start: 17, end: 20 },
  { daypart: 'NT', start: 20, end: 24 },
];

export const DAYPART_ORDER: readonly Daypart[] = ['EM', 'MO', 'MD', 'AF', 'EV', 'NT'];
/** Grid rows: 06:00 … 23:00 (the modelled day). */
export const GRID_HOURS: readonly number[] = Array.from({ length: 18 }, (_, i) => i + 6);
/** Grid columns, Monday first (ISO), index 0..6. */
export const WEEKDAY_INDICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export function daypartOfHour(hour: number): Daypart | null {
  const band = DAYPART_HOURS.find((b) => hour >= b.start && hour < b.end);
  return band?.daypart ?? null;
}

/** ISO weekday index (0 = Monday … 6 = Sunday) → day type. */
export function dayTypeOf(weekdayIndex: number): DayType {
  return weekdayIndex >= 5 ? 'weekend' : 'weekday';
}

export interface GridCell {
  hour: number;
  weekday: number;
  daypart: Daypart | null;
  dayType: DayType;
  /** Posterior mean, null outside the modelled dayparts or when the cell is absent. */
  mean: number | null;
  nEffective: number;
  personal: boolean;
}

export type GridRow = { hour: number; cells: GridCell[] };

export function cellIndex(cells: readonly HeatmapCell[], category: TaskCategory) {
  const idx = new Map<string, HeatmapCell>();
  for (const c of cells) if (c.category === category) idx.set(`${c.daypart}.${c.day_type}`, c);
  return idx;
}

/** 18 rows (hours 06–23) × 7 columns (Mon–Sun) for one category. */
export function buildHeatmapGrid(cells: readonly HeatmapCell[], category: TaskCategory): GridRow[] {
  const idx = cellIndex(cells, category);
  return GRID_HOURS.map((hour) => ({
    hour,
    cells: WEEKDAY_INDICES.map((weekday): GridCell => {
      const daypart = daypartOfHour(hour);
      const dayType = dayTypeOf(weekday);
      const cell = daypart === null ? undefined : idx.get(`${daypart}.${dayType}`);
      return {
        hour,
        weekday,
        daypart,
        dayType,
        mean: cell?.mean ?? null,
        nEffective: cell?.n_effective ?? 0,
        personal: cell?.personal ?? false,
      };
    }),
  }));
}

/**
 * Solidity of a cell from its effective evidence (confidence = solidity, File 02 §3.1):
 * n / (n + N0) with N0 = the in-hours prior strength (File 04 §3.3, 8 h) — 0.5 exactly where
 * the evidence equals the prior, i.e. the rung-2 boundary (specs/07 §3.6). [INFERRED]
 */
export const SOLIDITY_N0 = 8;
export function evidenceSolidity(nEffective: number): number {
  const n = Number.isFinite(nEffective) ? Math.max(0, nEffective) : 0;
  return n / (n + SOLIDITY_N0);
}

export interface DayTypeSummary {
  dayType: DayType;
  best: { daypart: Daypart; percent: number } | null;
  lowest: { daypart: Daypart; percent: number } | null;
  /** Every daypart in order with its percent (the full table for a screen reader). */
  rows: Array<{ daypart: Daypart; percent: number; personal: boolean }>;
}

/** The screen-reader / "as text" alternative: per day type, best and lowest daypart + table. */
export function heatmapTextSummary(
  cells: readonly HeatmapCell[],
  category: TaskCategory,
): DayTypeSummary[] {
  const idx = cellIndex(cells, category);
  return (['weekday', 'weekend'] as const).map((dayType) => {
    const rows = DAYPART_ORDER.flatMap((daypart) => {
      const c = idx.get(`${daypart}.${dayType}`);
      return c === undefined
        ? []
        : [{ daypart, percent: Math.round(c.mean * 100), personal: c.personal }];
    });
    if (rows.length === 0) return { dayType, best: null, lowest: null, rows };
    const best = rows.reduce((a, b) => (b.percent > a.percent ? b : a));
    const lowest = rows.reduce((a, b) => (b.percent < a.percent ? b : a));
    return {
      dayType,
      best: { daypart: best.daypart, percent: best.percent },
      lowest: { daypart: lowest.daypart, percent: lowest.percent },
      rows,
    };
  });
}

/** Weekly review (FR-33/UC-08): the 2–3 learnings are the most confident beliefs. */
export const REVIEW_LEARNINGS = 3;
export function reviewLearnings(beliefs: readonly Belief[]): Belief[] {
  return [...beliefs]
    .sort((a, b) => b.confidence - a.confidence || b.factor - a.factor)
    .slice(0, REVIEW_LEARNINGS);
}

/** Adherence trend direction over the last two weeks with data (FR-33 "trend"). */
export function adherenceTrend(weeks: readonly AdherenceWeek[]): 'up' | 'down' | 'flat' | null {
  if (weeks.length < 2) return null;
  const last = weeks[weeks.length - 1]!.par;
  const prev = weeks[weeks.length - 2]!.par;
  const delta = last - prev;
  if (Math.abs(delta) < 0.05) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** Runtime guard for the edge-function document (the wire is untyped JSON). */
export function isInsightsDocument(v: unknown): v is InsightsDocument {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    Array.isArray(d.heatmap) &&
    Array.isArray(d.beliefs) &&
    Array.isArray(d.adherence) &&
    typeof d.learning_mode === 'boolean' &&
    typeof d.generated_at === 'string'
  );
}

/** ISO-8601 week label of a LOCAL date (Monday-first; week 1 holds January 4). */
export function isoWeekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
