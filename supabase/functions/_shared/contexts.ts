/**
 * Context bucketing φ — a TypeScript mirror of the service's `dayparts.py` + `contexts.py`
 * (File 04 §1.2; specs/07 §3.2.5). |C| = 14: six dayparts × {weekday, weekend}, with the
 * fresh/fatigued split only on weekday MO and AF (spec-conflicts M3). A slot is *fatigued*
 * when ≥ 90 consecutive occupied minutes end ≤ 15 min before it; occupancy known a priori =
 * fixed events ∪ pinned tasks (ADR-0007 §4). Parity with the service is pinned by
 * `grid_parity_test.ts` against a fixture the Python side regenerates in its own test.
 */
import type { Grid } from './grid.ts';
import { FATIGUE_GAP_MINUTES, FATIGUE_RUN_MINUTES } from './params.ts';

export type Daypart = 'EM' | 'MO' | 'MD' | 'AF' | 'EV' | 'NT';
export type DayType = 'weekday' | 'weekend';
export type Position = 'fresh' | 'fatigued';

export const DAYPART_ORDER: readonly Daypart[] = ['EM', 'MO', 'MD', 'AF', 'EV', 'NT'];
const BOUNDARIES: ReadonlyArray<readonly [number, number, Daypart]> = [
  [6, 9, 'EM'],
  [9, 12, 'MO'],
  [12, 14, 'MD'],
  [14, 17, 'AF'],
  [17, 20, 'EV'],
  [20, 24, 'NT'],
];
const SPLIT_DAYPARTS: ReadonlySet<Daypart> = new Set<Daypart>(['MO', 'AF']);

/** Local wall-clock hour (0–23) → daypart, or null outside 06–24 (never workable). */
export function daypartForHour(hour: number): Daypart | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be in [0, 23], got ${hour}`);
  }
  for (const [start, end, part] of BOUNDARIES) {
    if (start <= hour && hour < end) return part;
  }
  return null;
}

export interface Bucket {
  readonly daypart: Daypart;
  readonly dayType: DayType;
  readonly position: Position | null;
  /** "AF.wd.fresh" / "MD.we" — the `context_bucket` column value. */
  readonly id: string;
}

export function makeBucket(
  daypart: Daypart,
  dayType: DayType,
  position: Position | null = null,
): Bucket {
  const base = `${daypart}.${dayType === 'weekday' ? 'wd' : 'we'}`;
  return { daypart, dayType, position, id: position === null ? base : `${base}.${position}` };
}

export function allBuckets(): Bucket[] {
  const out: Bucket[] = [];
  for (const dayType of ['weekday', 'weekend'] as const) {
    for (const dp of DAYPART_ORDER) {
      if (dayType === 'weekday' && SPLIT_DAYPARTS.has(dp)) {
        out.push(makeBucket(dp, dayType, 'fresh'), makeBucket(dp, dayType, 'fatigued'));
      } else {
        out.push(makeBucket(dp, dayType));
      }
    }
  }
  return out;
}

export const BUCKET_IDS: readonly string[] = allBuckets().map((b) => b.id);
const BY_ID = new Map(allBuckets().map((b) => [b.id, b]));

export function bucketFromId(id: string): Bucket {
  const b = BY_ID.get(id);
  if (b === undefined) throw new RangeError(`unknown context bucket ${JSON.stringify(id)}`);
  return b;
}

/** fatigued[k] ⇔ an occupied run ≥ FATIGUE_RUN_MINUTES ends ≤ FATIGUE_GAP_MINUTES before k. */
export function fatiguedTicks(grid: Grid, occupancy: Uint8Array): Uint8Array {
  const n = grid.nTicks;
  const minRun = Math.ceil(FATIGUE_RUN_MINUTES / grid.tickMinutes);
  const maxGap = Math.floor(FATIGUE_GAP_MINUTES / grid.tickMinutes);
  const runBefore = new Int32Array(n + 1); // occupied run length ending exactly at tick k-1
  for (let k = 1; k <= n; k++) runBefore[k] = occupancy[k - 1] ? runBefore[k - 1] + 1 : 0;
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    for (let gap = 0; gap <= maxGap; gap++) {
      const e = k - gap;
      if (e >= 0 && runBefore[e] >= minRun) {
        out[k] = 1;
        break;
      }
    }
  }
  return out;
}

export function bucketForTick(grid: Grid, k: number, fatigued: Uint8Array): Bucket | null {
  const dp = daypartForHour(Math.floor(grid.localMinute[k] / 60));
  if (dp === null) return null;
  const dayType: DayType = grid.weekday[k] >= 5 ? 'weekend' : 'weekday';
  if (dayType === 'weekday' && SPLIT_DAYPARTS.has(dp)) {
    return makeBucket(dp, dayType, fatigued[k] ? 'fatigued' : 'fresh');
  }
  return makeBucket(dp, dayType);
}

export function bucketsForGrid(grid: Grid, occupancy: Uint8Array): Array<Bucket | null> {
  const fatigued = fatiguedTicks(grid, occupancy);
  const out: Array<Bucket | null> = new Array(grid.nTicks);
  for (let k = 0; k < grid.nTicks; k++) out[k] = bucketForTick(grid, k, fatigued);
  return out;
}
