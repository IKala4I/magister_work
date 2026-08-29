/**
 * FR-40 grid mapping + the screen-reader alternative, evidence solidity (rung-2 boundary at 0.5),
 * review learnings, adherence trend, ISO weeks (P9, ADR-0013).
 */
import type { TaskCategory } from '../../db/tasks';
import {
  adherenceTrend,
  buildHeatmapGrid,
  DAYPART_ORDER,
  daypartOfHour,
  dayTypeOf,
  evidenceSolidity,
  GRID_HOURS,
  heatmapTextSummary,
  type HeatmapCell,
  isInsightsDocument,
  isoWeekOf,
  reviewLearnings,
  SOLIDITY_N0,
  type Belief,
} from '../heatmap';

function cells(category: TaskCategory = 'deep'): HeatmapCell[] {
  const means: Record<string, number> = { EM: 0.7, MO: 0.74, MD: 0.5, AF: 0.55, EV: 0.4, NT: 0.3 };
  return (['weekday', 'weekend'] as const).flatMap((day_type) =>
    DAYPART_ORDER.map((daypart) => ({
      category,
      daypart,
      day_type,
      mean: day_type === 'weekend' ? means[daypart]! - 0.1 : means[daypart]!,
      ci: [0.3, 0.8] as [number, number],
      n_effective: daypart === 'MO' && day_type === 'weekday' ? 12 : 0,
      personal: daypart === 'MO' && day_type === 'weekday',
    })),
  );
}

describe('daypart / day type mapping (File 04 §3.2)', () => {
  it('maps hours to the six dayparts and leaves 00–06 unmodelled', () => {
    expect(daypartOfHour(6)).toBe('EM');
    expect(daypartOfHour(8)).toBe('EM');
    expect(daypartOfHour(9)).toBe('MO');
    expect(daypartOfHour(13)).toBe('MD');
    expect(daypartOfHour(16)).toBe('AF');
    expect(daypartOfHour(19)).toBe('EV');
    expect(daypartOfHour(23)).toBe('NT');
    expect(daypartOfHour(3)).toBeNull();
    expect(daypartOfHour(24)).toBeNull();
  });
  it('Saturday and Sunday are the weekend (ISO indices 5, 6)', () => {
    expect([0, 1, 2, 3, 4].map(dayTypeOf)).toEqual(Array(5).fill('weekday'));
    expect([5, 6].map(dayTypeOf)).toEqual(['weekend', 'weekend']);
  });
});

describe('buildHeatmapGrid', () => {
  it('is 18 hours × 7 weekdays, repeating a daypart across its hours and a day type across its days', () => {
    const grid = buildHeatmapGrid(cells(), 'deep');
    expect(grid).toHaveLength(GRID_HOURS.length);
    expect(grid[0]!.hour).toBe(6);
    expect(grid[17]!.hour).toBe(23);
    expect(grid.every((r) => r.cells.length === 7)).toBe(true);
    const nine = grid.find((r) => r.hour === 9)!;
    const eleven = grid.find((r) => r.hour === 11)!;
    expect(nine.cells[0]!.mean).toBe(0.74);
    expect(eleven.cells[0]!.mean).toBe(0.74);
    expect(nine.cells[4]!.mean).toBe(0.74); // Friday = weekday
    expect(nine.cells[5]!.mean).toBeCloseTo(0.64); // Saturday = weekend
    expect(nine.cells[0]!.personal).toBe(true);
    expect(nine.cells[5]!.personal).toBe(false);
  });
  it('an absent category yields null cells (renders as "not modelled")', () => {
    const grid = buildHeatmapGrid(cells('deep'), 'admin');
    expect(grid.every((r) => r.cells.every((c) => c.mean === null))).toBe(true);
  });
});

describe('heatmapTextSummary (screen-reader alternative)', () => {
  it('names the best and lowest daypart per day type and lists every row', () => {
    const [weekday, weekend] = heatmapTextSummary(cells(), 'deep');
    expect(weekday!.best).toEqual({ daypart: 'MO', percent: 74 });
    expect(weekday!.lowest).toEqual({ daypart: 'NT', percent: 30 });
    expect(weekday!.rows).toHaveLength(6);
    expect(weekday!.rows[1]).toEqual({ daypart: 'MO', percent: 74, personal: true });
    expect(weekend!.best).toEqual({ daypart: 'MO', percent: 64 });
  });
  it('is empty-safe', () => {
    expect(heatmapTextSummary([], 'deep')).toEqual([
      { dayType: 'weekday', best: null, lowest: null, rows: [] },
      { dayType: 'weekend', best: null, lowest: null, rows: [] },
    ]);
  });
});

describe('evidenceSolidity (confidence = solidity)', () => {
  it('is 0 without evidence, 0.5 at the prior strength (rung-2 boundary), → 1 with evidence', () => {
    expect(evidenceSolidity(0)).toBe(0);
    expect(evidenceSolidity(SOLIDITY_N0)).toBe(0.5);
    expect(evidenceSolidity(1000)).toBeGreaterThan(0.99);
    expect(evidenceSolidity(Number.NaN)).toBe(0);
    expect(evidenceSolidity(-3)).toBe(0);
  });
});

function belief(over: Partial<Belief>): Belief {
  return {
    category: 'deep',
    day_type: 'weekday',
    daypart: 'MO',
    mean: 0.7,
    factor: 1.2,
    confidence: 0.5,
    n_effective: 3,
    personal: false,
    affinity: true,
    state_ref: 'beta:deep.MO.weekday',
    label: null,
    ...over,
  };
}

describe('reviewLearnings / adherenceTrend', () => {
  it('picks the 3 most confident beliefs (ties by factor)', () => {
    const picked = reviewLearnings([
      belief({ state_ref: 'a', confidence: 0.2 }),
      belief({ state_ref: 'b', confidence: 0.9 }),
      belief({ state_ref: 'c', confidence: 0.5, factor: 1.1 }),
      belief({ state_ref: 'd', confidence: 0.5, factor: 1.4 }),
    ]);
    expect(picked.map((b) => b.state_ref)).toEqual(['b', 'd', 'c']);
  });
  it('trend needs two weeks; ±5 points is flat', () => {
    expect(adherenceTrend([])).toBeNull();
    expect(adherenceTrend([{ week: 'w', par: 0.5, n: 4 }])).toBeNull();
    expect(
      adherenceTrend([
        { week: 'a', par: 0.5, n: 4 },
        { week: 'b', par: 0.53, n: 4 },
      ]),
    ).toBe('flat');
    expect(
      adherenceTrend([
        { week: 'a', par: 0.5, n: 4 },
        { week: 'b', par: 0.6, n: 4 },
      ]),
    ).toBe('up');
    expect(
      adherenceTrend([
        { week: 'a', par: 0.5, n: 4 },
        { week: 'b', par: 0.3, n: 4 },
      ]),
    ).toBe('down');
  });
});

describe('isoWeekOf (local date)', () => {
  it('matches ISO-8601: Sunday stays in its week, Monday starts the next; week 53 of 2026', () => {
    expect(isoWeekOf(new Date(2026, 7, 30, 23, 30))).toBe('2026-W35'); // Sun
    expect(isoWeekOf(new Date(2026, 7, 31, 0, 30))).toBe('2026-W36'); // Mon
    expect(isoWeekOf(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeekOf(new Date(2026, 0, 1))).toBe('2026-W01');
  });
});

describe('isInsightsDocument', () => {
  it('accepts the edge-function shape and rejects partial objects', () => {
    expect(
      isInsightsDocument({
        heatmap: [],
        beliefs: [],
        adherence: [],
        learning_mode: true,
        generated_at: 'x',
      }),
    ).toBe(true);
    expect(isInsightsDocument({ heatmap: [] })).toBe(false);
    expect(isInsightsDocument(null)).toBe(false);
  });
});
