/**
 * Working hours + sleep window (FR-02; specs/07 §5 shapes). Server jsonb shapes:
 * working_hours = per-weekday [start, end] minutes from local midnight, keys mon..sun,
 * day absent = not working; sleep_window = one [start, end] pair that MAY wrap midnight
 * (e.g. [1380, 420] = 23:00–07:00 — the specs/07 §5 example).
 *
 * Validation contract (ADR-0005): working-hours ranges must satisfy 0 ≤ start < end ≤ 1440
 * (no overnight working hours in v1 — the sleep window is the overnight object). The server
 * instantiation treats malformed day entries as non-working rather than erroring, so client
 * validation here is what keeps profiles clean.
 *
 * Defaults (ADR-0006): Mon–Fri 09:00–18:00, sleep 23:00–07:00 — prefilled, every field
 * editable during onboarding.
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type MinuteRange = readonly [number, number];
export type WorkingHours = Partial<Record<DayKey, MinuteRange>>;

export const MINUTES_PER_DAY = 1440;

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: [540, 1080],
  tue: [540, 1080],
  wed: [540, 1080],
  thu: [540, 1080],
  fri: [540, 1080],
};

/** May wrap midnight (end < start means the window crosses 00:00). */
export const DEFAULT_SLEEP_WINDOW: MinuteRange = [1380, 420];

export function isValidWorkingRange(range: MinuteRange): boolean {
  const [start, end] = range;
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end <= MINUTES_PER_DAY &&
    start < end
  );
}

/** Sleep windows wrap; only bounds and non-degeneracy are constrained. */
export function isValidSleepWindow(range: MinuteRange): boolean {
  const [start, end] = range;
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < MINUTES_PER_DAY &&
    end >= 0 &&
    end <= MINUTES_PER_DAY &&
    start !== end
  );
}

export function isValidWorkingHours(hours: WorkingHours): boolean {
  const entries = Object.entries(hours) as [DayKey, MinuteRange][];
  return (
    entries.every(([day, range]) => DAY_KEYS.includes(day) && isValidWorkingRange(range)) &&
    entries.length > 0
  );
}

/** Weekday key of a local calendar day (YYYY-MM-DD) by the device calendar (Monday = mon). */
export function dayKeyOf(day: string): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay(); // 0 = Sunday
  return DAY_KEYS[(weekday + 6) % 7] as DayKey;
}

/** Sleep-window membership; the window may wrap midnight (end < start). */
function inSleepWindow(minute: number, sleep: MinuteRange): boolean {
  const [start, end] = sleep;
  if (start <= end) return start <= minute && minute < end;
  return minute >= start || minute < end;
}

/** Ticks at this hour are never workable (File 04 daypart table starts at 06:00). */
const FIRST_WORKABLE_HOUR = 6;
const TICK = 15;

/**
 * ADR-0019 — whether ONE local day has a working window: the declared hours minus the sleep
 * window and the 00–06 rule, on the planner's 15-minute ticks. A mirror of the function's
 * `hasWorkingWindow` (supabase/functions/_shared/grid.ts) restricted to a single day, so the
 * client can answer a request for a day off without a round trip and skip the daily ritual
 * whose next plan day has no window. Never looks at the clock or the calendar: a day whose
 * window has passed, or is fully booked, is still a working day.
 */
export function hasWorkingWindowOn(
  day: string,
  hours: WorkingHours,
  sleep: MinuteRange | null,
): boolean {
  // Mirror `buildGrid`, which validates nothing: a malformed entry is read the way the server
  // reads it (a non-numeric pair = no hours; an end past midnight is cut at the day's last tick;
  // a malformed sleep window = no sleep window). The two sides must never disagree on "day off".
  const range = isMinutePair(hours?.[dayKeyOf(day)]) ? hours[dayKeyOf(day)] : undefined;
  if (range === undefined) return false;
  const [ws, rawEnd] = range;
  const we = Math.min(rawEnd, MINUTES_PER_DAY);
  const sleepWindow = isMinutePair(sleep) ? sleep : null;
  // the planner's ticks start at local midnight, so the first candidate is the first tick ≥ ws
  const first = Math.max(Math.ceil(ws / TICK) * TICK, FIRST_WORKABLE_HOUR * 60);
  for (let m = first; m + TICK <= we; m += TICK) {
    if (sleepWindow !== null && inSleepWindow(m, sleepWindow)) continue;
    return true;
  }
  return false;
}

function isMinutePair(v: unknown): v is MinuteRange {
  return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

/** "9:00" / "18:30" for steppers and a11y labels; minutes-from-midnight in, HH:MM out. */
export function formatMinutes(minutes: number): string {
  const clamped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}
