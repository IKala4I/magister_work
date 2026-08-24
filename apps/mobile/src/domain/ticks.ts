/**
 * Tick arithmetic for the planning grid (specs/04 §1.2): the horizon is divided
 * into ticks of TICK_MINUTES; a day has at most 96 ticks, a week at most 672.
 */
export const TICK_MINUTES = 15;

/** Number of ticks fully covering `minutes` (partial ticks round up). */
export function minutesToTicks(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`minutes must be a non-negative finite number, got ${minutes}`);
  }
  return Math.ceil(minutes / TICK_MINUTES);
}

export function ticksToMinutes(ticks: number): number {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new RangeError(`ticks must be a non-negative integer, got ${ticks}`);
  }
  return ticks * TICK_MINUTES;
}
