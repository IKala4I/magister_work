/**
 * UC-07 target context for a drag/move override: the bucket φ and the 17-feature snapshot of the
 * placement's NEW slot, computed with the SAME grid/bucket/feature modules arm A and the parity
 * fixture use (invariant 1: the client never computes features — it logs the move as a fact).
 * A-priori occupancy for the fatigue rule and feature 17 = fixed calendar events ∪ the user's
 * other committed blocks of that day [INFERRED: at move time those blocks are facts, not
 * decision variables]; the moved block's own original slot is excluded.
 */
import { type BetaCell, cellKey, fallbackCells, posterior } from '../_shared/energy.ts';
import { bucketsForGrid } from '../_shared/contexts.ts';
import { featureVector } from '../_shared/features.ts';
import {
  buildGrid,
  type BusyInterval,
  tickFloor,
  wallClock,
  type WorkingHours,
} from '../_shared/grid.ts';
import { PRECEDING_LOAD_WINDOW_MINUTES, TICK_MINUTES } from '../_shared/params.ts';
import type { OverrideTarget } from '../_shared/rewards.ts';
import type { Category } from '../_shared/types.ts';

export interface OverrideInput {
  timezone: string;
  workingHours: WorkingHours;
  sleepWindow: readonly [number, number] | null;
  busy: readonly BusyInterval[];
  /** Other committed blocks of the target day (the moved block excluded). */
  otherBlocks: readonly BusyInterval[];
  task: {
    category: Category;
    value: number;
    est_minutes: number;
    splittable: boolean;
    deadline: string | null;
    postpone_count: number;
  };
  cells: readonly BetaCell[];
  toStartMs: number;
  toEndMs: number;
  nowMs: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** null when the target tick is outside the user's workable day (no bucket → no override_in). */
export function targetContext(input: OverrideInput): OverrideTarget | null {
  const wc = wallClock(input.toStartMs, input.timezone);
  const planDate = `${wc.year}-${pad(wc.month)}-${pad(wc.day)}`;
  const grid = buildGrid({
    planDate,
    horizon: 'day',
    timezone: input.timezone,
    workingHours: input.workingHours,
    sleepWindow: input.sleepWindow,
    busy: input.busy,
    nowMs: null,
  });
  const occupancy = new Uint8Array(grid.occupied);
  for (const b of input.otherBlocks) {
    const from = Math.max(tickFloor(grid, b.startMs), 0);
    const to = Math.min(
      Math.ceil((b.endMs - grid.originMs) / (grid.tickMinutes * 60_000)),
      grid.nTicks,
    );
    if (to > from) occupancy.fill(1, from, to);
  }
  const k = tickFloor(grid, input.toStartMs);
  if (k < 0 || k >= grid.nTicks) return null;
  const bucket = bucketsForGrid(grid, occupancy)[k];
  if (bucket === null || bucket === undefined) return null;

  const cells = input.cells.length > 0 ? input.cells : fallbackCells();
  const cell = cells.find((c) =>
    cellKey(c.category, c.daypart, c.dayType) ===
      cellKey(input.task.category, bucket.daypart, bucket.dayType)
  );
  const post = cell === undefined ? null : posterior(cell, input.nowMs);
  const windowTicks = Math.ceil(PRECEDING_LOAD_WINDOW_MINUTES / TICK_MINUTES);
  let load = 0;
  for (let i = Math.max(k - windowTicks, 0); i < k; i++) load += occupancy[i];
  const deadlineMs = input.task.deadline === null ? null : Date.parse(input.task.deadline);
  const uTicks = deadlineMs === null
    ? null
    : Math.floor((deadlineMs - input.toStartMs) / (TICK_MINUTES * 60_000));
  const features = featureVector({
    bucket,
    value: input.task.value,
    estMinutes: input.task.est_minutes,
    splittable: input.task.splittable,
    uTicks,
    postponeCount: input.task.postpone_count,
    cellMean: post?.mean ?? 0.5,
    cellSd: post?.sd ?? 0.22,
    precedingLoadMinutes: load * TICK_MINUTES,
  });
  return {
    to_start: new Date(input.toStartMs).toISOString(),
    to_end: new Date(input.toEndMs).toISOString(),
    context_bucket: bucket.id,
    features,
  };
}
