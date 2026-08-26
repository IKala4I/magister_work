/**
 * Tick grid, workable set W and a-priori occupancy — a TypeScript mirror of the service's
 * `grid.py` (File 04 §1.2). Ticks index *absolute* time from local midnight of `plan_date` in
 * the user's zone, so a DST day has 92 or 100 ticks and every tick's daypart / working-hours
 * membership is decided on its own wall-clock minute. W = working hours ∖ (sleep ∪ fixed
 * events ∪ buffers); ticks before `now` are never workable; the busy set MAY be empty
 * (PLAN decision 5). Wall-clock arithmetic uses `Intl.DateTimeFormat` (full ICU in Deno),
 * never `Date`'s host-zone getters. Parity with the service: `grid_parity_test.ts`.
 */
import { daypartForHour } from './contexts.ts';
import { BUFFER_TICKS, HORIZON_DAYS, TICK_MINUTES } from './params.ts';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type MinuteRange = readonly [number, number];
export type WorkingHours = Partial<Record<DayKey, MinuteRange>>;
export type Horizon = keyof typeof HORIZON_DAYS;

export interface BusyInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export interface Grid {
  readonly timezone: string;
  /** YYYY-MM-DD */
  readonly planDate: string;
  readonly horizonDays: number;
  readonly tickMinutes: number;
  /** UTC instant of local midnight on planDate. */
  readonly originMs: number;
  readonly nTicks: number;
  /** Wall-clock minute-of-day at each tick start. */
  readonly localMinute: Int32Array;
  /** 0 = Monday … 6 = Sunday (local). */
  readonly weekday: Int8Array;
  /** 0 … horizonDays-1 (local calendar-day offset). */
  readonly dayIndex: Int16Array;
  /** W */
  readonly workable: Uint8Array;
  /** Fixed events — a-priori occupancy for φ and feature 17. */
  readonly occupied: Uint8Array;
}

export interface WallClock {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  minuteOfDay: number;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** Throws RangeError for an unknown IANA zone (mirrors the service's 422 on `timezone`). */
export function assertTimezone(timezone: string): void {
  formatter(timezone);
}

export function wallClock(ms: number, timezone: string): WallClock {
  const parts = formatter(timezone).formatToParts(new Date(ms));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24; // some ICU builds print 24 for midnight under h23
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    minuteOfDay: hour * 60 + Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

export function parseIsoDate(planDate: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planDate);
  if (m === null) throw new RangeError(`plan_date must be YYYY-MM-DD, got ${planDate}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new RangeError(`plan_date is not a calendar date: ${planDate}`);
  }
  return { year, month, day };
}

/** Days from calendar date a to calendar date b (proleptic Gregorian, no zone involved). */
export function daysBetween(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
): number {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/**
 * UTC instant of local midnight on (year, month, day) in `timezone` — the first instant whose
 * wall-clock date is that day (equals Python's `datetime.combine(d, time(0), tz)` for zones
 * whose transitions are not at midnight, and the post-gap instant when they are).
 */
export function localMidnightUtcMs(
  timezone: string,
  year: number,
  month: number,
  day: number,
): number {
  const naive = Date.UTC(year, month - 1, day);
  let candidate = naive;
  for (let i = 0; i < 2; i++) {
    const wc = wallClock(candidate, timezone);
    const asUtc = Date.UTC(wc.year, wc.month - 1, wc.day, 0, 0) + wc.minuteOfDay * 60_000;
    candidate = naive - (asUtc - candidate);
  }
  // Step forward across a midnight DST gap (never for Europe/Kyiv; kept for correctness).
  for (let i = 0; i < 180; i++) {
    const wc = wallClock(candidate, timezone);
    if (wc.year === year && wc.month === month && wc.day === day && wc.minuteOfDay === 0) {
      return candidate;
    }
    if (daysBetween({ year, month, day }, wc) > 0) return candidate;
    candidate += 60_000;
  }
  throw new RangeError(`cannot resolve local midnight for ${year}-${month}-${day} in ${timezone}`);
}

/** Minute-of-day membership in [start, end); end < start means the window wraps midnight. */
export function inWindow(minute: number, window: MinuteRange): boolean {
  const [start, end] = window;
  if (start <= end) return start <= minute && minute < end;
  return minute >= start || minute < end;
}

export interface BuildGridInput {
  planDate: string;
  horizon: Horizon;
  timezone: string;
  workingHours: WorkingHours;
  sleepWindow: MinuteRange | null;
  busy: readonly BusyInterval[];
  nowMs?: number | null;
  tickMinutes?: number;
  bufferTicks?: number;
}

export function buildGrid(input: BuildGridInput): Grid {
  const { timezone } = input;
  assertTimezone(timezone);
  const tickMinutes = input.tickMinutes ?? TICK_MINUTES;
  const bufferTicks = input.bufferTicks ?? BUFFER_TICKS;
  const days = HORIZON_DAYS[input.horizon];
  const { year, month, day } = parseIsoDate(input.planDate);
  const originMs = localMidnightUtcMs(timezone, year, month, day);
  const endDate = new Date(Date.UTC(year, month - 1, day + days));
  const endMs = localMidnightUtcMs(
    timezone,
    endDate.getUTCFullYear(),
    endDate.getUTCMonth() + 1,
    endDate.getUTCDate(),
  );
  const deltaMs = tickMinutes * 60_000;
  const n = Math.ceil((endMs - originMs) / deltaMs);

  const localMinute = new Int32Array(n);
  const weekday = new Int8Array(n);
  const dayIndex = new Int16Array(n);
  const workable = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const wc = wallClock(originMs + k * deltaMs, timezone);
    localMinute[k] = wc.minuteOfDay;
    weekday[k] = wc.weekday;
    dayIndex[k] = Math.min(Math.max(daysBetween({ year, month, day }, wc), 0), days - 1);
    const hours = input.workingHours[DAY_KEYS[wc.weekday]];
    if (hours === undefined) continue;
    const [ws, we] = hours;
    if (!(ws <= wc.minuteOfDay && wc.minuteOfDay + tickMinutes <= we)) continue;
    if (input.sleepWindow !== null && inWindow(wc.minuteOfDay, input.sleepWindow)) continue;
    if (daypartForHour(Math.floor(wc.minuteOfDay / 60)) === null) continue; // 00–06: never workable
    workable[k] = 1;
  }

  if (input.nowMs !== undefined && input.nowMs !== null) {
    const firstFuture = Math.max(0, Math.min(n, Math.ceil((input.nowMs - originMs) / deltaMs)));
    workable.fill(0, 0, firstFuture);
  }

  const occupied = new Uint8Array(n);
  for (const iv of input.busy) {
    const lo = Math.floor((iv.startMs - originMs) / deltaMs);
    const hi = Math.ceil((iv.endMs - originMs) / deltaMs);
    const loC = Math.max(lo, 0);
    const hiC = Math.min(hi, n);
    if (loC < hiC) occupied.fill(1, loC, hiC);
    const blo = Math.max(lo - bufferTicks, 0);
    const bhi = Math.min(hi + bufferTicks, n);
    if (blo < bhi) workable.fill(0, blo, bhi);
  }

  return {
    timezone,
    planDate: input.planDate,
    horizonDays: days,
    tickMinutes,
    originMs,
    nTicks: n,
    localMinute,
    weekday,
    dayIndex,
    workable,
    occupied,
  };
}

export function tickStartMs(grid: Grid, k: number): number {
  return grid.originMs + k * grid.tickMinutes * 60_000;
}

/** Index of the tick containing `ms` (may fall outside [0, nTicks)). */
export function tickFloor(grid: Grid, ms: number): number {
  return Math.floor((ms - grid.originMs) / (grid.tickMinutes * 60_000));
}

export function tickCeil(grid: Grid, ms: number): number {
  return Math.ceil((ms - grid.originMs) / (grid.tickMinutes * 60_000));
}

/** R[k] = number of consecutive workable ticks starting at k (0 when k ∉ W). */
export function runLengths(grid: Grid): Int32Array {
  const r = new Int32Array(grid.nTicks);
  let run = 0;
  for (let k = grid.nTicks - 1; k >= 0; k--) {
    run = grid.workable[k] ? run + 1 : 0;
    r[k] = run;
  }
  return r;
}

/**
 * F_τ = {k : [k, k+d+b) ⊆ W, e_τ ≤ k, k + d ≤ dl_τ} — File 04 §1.2 verbatim. The buffer must lie
 * inside W but MAY extend past the deadline (spec-conflicts L2).
 */
export function feasibleStarts(
  grid: Grid,
  input: {
    duration: number;
    earliest: number | null;
    deadline: number | null;
    bufferTicks?: number;
    runLengths?: Int32Array;
  },
): number[] {
  const r = input.runLengths ?? runLengths(grid);
  const b = input.bufferTicks ?? BUFFER_TICKS;
  const lo = input.earliest === null ? 0 : Math.max(input.earliest, 0);
  const hi = input.deadline === null
    ? grid.nTicks
    : Math.min(input.deadline - input.duration, grid.nTicks);
  const need = input.duration + b;
  const out: number[] = [];
  for (let k = lo; k < Math.max(hi + 1, lo); k++) {
    if (k < grid.nTicks && r[k] >= need) out.push(k);
  }
  return out;
}
