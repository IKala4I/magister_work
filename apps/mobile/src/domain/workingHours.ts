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

/** "9:00" / "18:30" for steppers and a11y labels; minutes-from-midnight in, HH:MM out. */
export function formatMinutes(minutes: number): string {
  const clamped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}
