/**
 * Arm A — "heuristic + matched randomization" (spec-conflicts H1; PLAN P6; NFR-R2 fallback).
 *
 * A deterministic list scheduler on the SAME grid, feasibility set F_τ, context buckets φ and
 * feature snapshot as the learned engine (mirrors of the service modules in this folder):
 *   1. pinned tasks keep their instant (unplaceable when off-grid or in a no-daypart hour);
 *   2. the matched ε-draw runs exactly as in the service (`exploration.ts`): eligible task
 *      uniform, bucket uniform over the top-m buckets of THIS engine's ranking — earliest
 *      reachable first (ties by bucket id) — and the drawn task is placed first inside its
 *      bucket; if pinned occupancy leaves no start there the draw is dropped and no row is
 *      labelled (the service's INFEASIBLE-after-pin drop, `experiment_dropped`);
 *   3. remaining tasks in "deadline-first, priority tiers" order — critical tasks (deadline
 *      inside the horizon) by Earliest-Deadline-First (Liu & Layland 1973; Dertouzos 1974),
 *      then the rest by value tier, deadline, duration — each at its earliest free start
 *      (Graham 1966 list scheduling); splittable tasks that do not fit whole are chunked
 *      greedily (≥ d_min, ≤ MAX_CHUNKS) and deferred when chunks cannot cover them.
 * No estimate exists on this path: `q_hat`/`confidence` are null; rationale keys come from the
 * closed vocabulary (ADR-0007 §10) restricted to what the heuristic can truthfully claim.
 * ADR-0008 §2 records the definition; `heuristic_test.ts` pins the hard constraints.
 */
import { type Bucket, bucketsForGrid } from './contexts.ts';
import { type BetaCell, cellKey, posteriorTable } from './energy.ts';
import {
  drawExperiment,
  eligibleTasks,
  type ExperimentCandidate,
  type ExperimentDraw,
} from './exploration.ts';
import { featureVector, urgencyTerm } from './features.ts';
import {
  buildGrid,
  feasibleStarts,
  type Grid,
  runLengths,
  tickCeil,
  tickFloor,
  tickStartMs,
} from './grid.ts';
import {
  BUFFER_TICKS,
  D_MIN_TICKS,
  EPSILON,
  EXPERIMENT_MAX_DURATION_TICKS,
  EXPERIMENT_MIN_BUCKETS,
  HEURISTIC_MODEL_VERSION,
  MAX_CHUNKS,
  PRECEDING_LOAD_WINDOW_MINUTES,
  TICK_MINUTES,
  TOP_M,
  URGENCY_RATIONALE_THRESHOLD,
} from './params.ts';
import { randomSeed, seededRng } from './rng.ts';
import type { Assignment, ServicePlanRequest, Unplaced, WorkingHours } from './types.ts';

export interface HeuristicOptions {
  /** Wall-clock instant of the request; also the read time for cell decay. */
  nowMs: number;
  /** The user's beta_cells (empty ⇒ flat prior; features 15–16 only). */
  cells: readonly BetaCell[];
  /** Reproducibility (tests, replays); random when omitted. */
  seed?: number;
}

export interface HeuristicTelemetry {
  rng_seed: number;
  experiment_drawn: boolean;
  experiment_dropped: boolean;
  n_eligible: number;
  n_ticks: number;
  tick_minutes: number;
  total_ms: number;
}

export interface HeuristicResult {
  engine: 'heuristic';
  model_version: string;
  solver_status: 'HEURISTIC';
  assignments: Assignment[];
  unplaced: Unplaced[];
  infeasible: null;
  experiment: ExperimentDraw | null;
  telemetry: HeuristicTelemetry;
}

interface Spec {
  id: string;
  category: string;
  value: number;
  estMinutes: number;
  duration: number;
  splittable: boolean;
  postponeCount: number;
  deadlineTick: number | null;
  earliestTick: number | null;
  pinnedTick: number | null;
  pinnedStartMs: number | null;
  critical: boolean;
}

interface Placement {
  taskId: string;
  chunkIndex: number;
  start: number;
  size: number;
}

function parseMs(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`invalid timestamp ${JSON.stringify(iso)}`);
  return ms;
}

function fits(free: Uint8Array, k: number, len: number): boolean {
  if (k < 0 || k + len > free.length) return false;
  for (let i = k; i < k + len; i++) if (!free[i]) return false;
  return true;
}

function block(free: Uint8Array, k: number, len: number): void {
  free.fill(0, k, Math.min(k + len, free.length));
}

function compareSpecs(a: Spec, b: Spec): number {
  // deadline-first (EDF) among critical tasks; then priority tiers, deadline, duration, id
  if (a.critical !== b.critical) return a.critical ? -1 : 1;
  const da = a.deadlineTick ?? Number.POSITIVE_INFINITY;
  const db = b.deadlineTick ?? Number.POSITIVE_INFINITY;
  if (a.critical) {
    if (da !== db) return da - db;
    if (a.value !== b.value) return b.value - a.value;
  } else {
    if (a.value !== b.value) return b.value - a.value;
    if (da !== db) return da - db;
  }
  if (a.duration !== b.duration) return b.duration - a.duration;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Greedy chunking over free runs: ≥ d_min each, ≤ MAX_CHUNKS, every chunk before the deadline. */
function placeChunked(
  free: Uint8Array,
  spec: Spec,
  chunkStarts: readonly number[],
  dMin: number,
): Placement[] | null {
  if (chunkStarts.length === 0) return null;
  const n = free.length;
  const hi = spec.deadlineTick ?? n;
  const placed: Placement[] = [];
  let remaining = spec.duration;
  let k = chunkStarts[0];
  const starts = new Set(chunkStarts);
  while (remaining > 0 && placed.length < MAX_CHUNKS && k < n) {
    if (!free[k] || !starts.has(k)) {
      k++;
      continue;
    }
    let run = 0;
    while (k + run < n && free[k + run]) run++;
    const capacity = Math.min(run - BUFFER_TICKS, hi - k);
    let size = Math.min(remaining, capacity);
    if (size >= dMin && remaining - size > 0 && remaining - size < dMin) size = remaining - dMin;
    if (size < dMin) {
      k += Math.max(run, 1);
      continue;
    }
    placed.push({ taskId: spec.id, chunkIndex: placed.length, start: k, size });
    block(free, k, size + BUFFER_TICKS);
    remaining -= size;
    k += size + BUFFER_TICKS;
  }
  if (remaining > 0) {
    for (const p of placed) free.fill(1, p.start, Math.min(p.start + p.size + BUFFER_TICKS, n));
    return null;
  }
  return placed;
}

export function heuristicPlan(req: ServicePlanRequest, options: HeuristicOptions): HeuristicResult {
  const t0 = performance.now();
  const seed = options.seed ?? randomSeed();
  const rng = seededRng(seed);
  const epsilon = req.settings.epsilon ?? EPSILON;
  const m = req.settings.top_m ?? TOP_M;

  const grid: Grid = buildGrid({
    planDate: req.plan_date,
    horizon: req.horizon,
    timezone: req.timezone,
    workingHours: req.working_hours as WorkingHours,
    sleepWindow: req.sleep_window,
    busy: req.busy.map((b) => ({
      startMs: parseMs(b.start) as number,
      endMs: parseMs(b.end) as number,
    })),
    nowMs: req.now === null ? options.nowMs : parseMs(req.now),
  });
  const n = grid.nTicks;
  const tick = grid.tickMinutes;
  const dMin = Math.max(1, Math.ceil((D_MIN_TICKS * TICK_MINUTES) / tick));

  // --- specs + a-priori occupancy (fixed events ∪ pinned tasks), exactly as the service ---
  const specs = new Map<string, Spec>();
  const unplaceable = new Set<string>();
  const occupancy = new Uint8Array(grid.occupied);
  for (const t of req.tasks) {
    let duration = Math.max(1, Math.ceil(t.est_minutes / tick));
    const deadlineMs = parseMs(t.deadline);
    const earliestMs = parseMs(t.earliest_start);
    const pinnedMs = parseMs(t.pinned_start);
    const deadlineTick = deadlineMs === null ? null : tickFloor(grid, deadlineMs);
    const earliestTick = earliestMs === null ? null : tickCeil(grid, earliestMs);
    const pinnedTick = pinnedMs === null ? null : tickFloor(grid, pinnedMs);
    if (pinnedMs !== null && pinnedTick !== null) {
      const pinnedEnd = tickCeil(grid, pinnedMs + t.est_minutes * 60_000);
      const inGrid = pinnedTick >= 0 && pinnedEnd <= n;
      if (!inGrid || grid.localMinute[pinnedTick] < 6 * 60) {
        unplaceable.add(t.id);
        continue;
      }
      duration = Math.max(pinnedEnd - pinnedTick, 1);
    }
    if (deadlineTick !== null && deadlineTick < 0) {
      unplaceable.add(t.id);
      continue;
    }
    const critical = pinnedTick !== null || (deadlineTick !== null && deadlineTick <= n);
    specs.set(t.id, {
      id: t.id,
      category: t.category,
      value: t.value,
      estMinutes: t.est_minutes,
      duration,
      splittable: t.splittable,
      postponeCount: t.postpone_count,
      deadlineTick,
      earliestTick,
      pinnedTick,
      pinnedStartMs: pinnedMs,
      critical,
    });
    if (pinnedTick !== null) occupancy.fill(1, pinnedTick, Math.min(pinnedTick + duration, n));
  }

  const buckets = bucketsForGrid(grid, occupancy);
  const runLen = runLengths(grid);
  const fullStarts = new Map<string, number[]>();
  const chunkStarts = new Map<string, number[]>();
  for (const s of specs.values()) {
    if (s.pinnedTick !== null) {
      fullStarts.set(s.id, [s.pinnedTick]);
      chunkStarts.set(s.id, []);
      continue;
    }
    const full = feasibleStarts(grid, {
      duration: s.duration,
      earliest: s.earliestTick,
      deadline: s.deadlineTick,
      runLengths: runLen,
    });
    const chunked = s.splittable && s.duration >= 2 * dMin
      ? feasibleStarts(grid, {
        duration: dMin,
        earliest: s.earliestTick,
        deadline: s.deadlineTick,
        runLengths: runLen,
      })
      : [];
    fullStarts.set(s.id, full);
    chunkStarts.set(s.id, chunked);
    if (full.length === 0 && chunked.length === 0) unplaceable.add(s.id);
  }

  const bucketIdsOf = (id: string): string[] => {
    const ids = new Set<string>();
    for (const k of fullStarts.get(id) ?? []) {
      const b = buckets[k];
      if (b !== null) ids.add(b.id);
    }
    return [...ids].sort();
  };
  const firstStartIn = (id: string, bucketId: string): number => {
    for (const k of fullStarts.get(id) ?? []) if (buckets[k]?.id === bucketId) return k;
    return Number.POSITIVE_INFINITY;
  };

  // --- free set for list scheduling: W minus pinned tasks and their buffers ---
  const free = new Uint8Array(grid.workable);
  const placements: Placement[] = [];
  for (const s of specs.values()) {
    if (s.pinnedTick === null) continue;
    placements.push({ taskId: s.id, chunkIndex: 0, start: s.pinnedTick, size: s.duration });
    block(free, s.pinnedTick, s.duration + BUFFER_TICKS);
  }

  // --- matched ε-draw (File 04 §1.4; H1) on the a-priori grid, as in the service ---
  const candidates: ExperimentCandidate[] = [];
  for (const s of specs.values()) {
    if (unplaceable.has(s.id)) continue;
    candidates.push({
      taskId: s.id,
      duration: s.duration,
      critical: s.critical,
      pinned: s.pinnedTick !== null,
      feasibleBucketIds: bucketIdsOf(s.id),
    });
  }
  const maxExpTicks = Math.max(
    1,
    Math.floor((EXPERIMENT_MAX_DURATION_TICKS * TICK_MINUTES) / tick),
  );
  const eligible = eligibleTasks(candidates, {
    minBuckets: EXPERIMENT_MIN_BUCKETS,
    maxDurationTicks: maxExpTicks,
  });
  const rankings = new Map<string, Array<readonly [string, number]>>();
  for (const id of eligible) {
    // the heuristic's own preference: earliest reachable bucket first (score = −first start)
    rankings.set(id, bucketIdsOf(id).map((b) => [b, -firstStartIn(id, b)] as const));
  }
  let draw: ExperimentDraw | null = drawExperiment(rng, {
    eligible,
    rankings,
    epsilon,
    m,
    minBuckets: EXPERIMENT_MIN_BUCKETS,
  });
  let experimentDropped = false;
  const placedIds = new Set<string>(placements.map((p) => p.taskId));
  if (draw !== null) {
    const s = specs.get(draw.taskId) as Spec;
    const inBucket = (fullStarts.get(s.id) ?? []).filter(
      (k) => buckets[k]?.id === draw?.bucketId && fits(free, k, s.duration + BUFFER_TICKS),
    );
    if (inBucket.length === 0) {
      experimentDropped = true; // pinned occupancy left no start in the drawn bucket
      draw = null;
    } else {
      placements.push({ taskId: s.id, chunkIndex: 0, start: inBucket[0], size: s.duration });
      block(free, inBucket[0], s.duration + BUFFER_TICKS);
      placedIds.add(s.id);
    }
  }

  // --- deadline-first, priority tiers, earliest free start ---
  const order = [...specs.values()]
    .filter((s) => s.pinnedTick === null && !unplaceable.has(s.id) && !placedIds.has(s.id))
    .sort(compareSpecs);
  const deferred = new Set<string>();
  for (const s of order) {
    const full = fullStarts.get(s.id) ?? [];
    const k = full.find((start) => fits(free, start, s.duration + BUFFER_TICKS));
    if (k !== undefined) {
      placements.push({ taskId: s.id, chunkIndex: 0, start: k, size: s.duration });
      block(free, k, s.duration + BUFFER_TICKS);
      placedIds.add(s.id);
      continue;
    }
    const chunks = s.splittable ? placeChunked(free, s, chunkStarts.get(s.id) ?? [], dMin) : null;
    if (chunks !== null) {
      placements.push(...chunks);
      placedIds.add(s.id);
    } else {
      deferred.add(s.id);
    }
  }

  // --- assignments with the NFR-O1 feature snapshot (features 15–16 from the user's cells) ---
  const cellTable = posteriorTable(options.cells, options.nowMs);
  const windowTicks = Math.max(1, Math.floor(PRECEDING_LOAD_WINDOW_MINUTES / tick));
  const precedingLoad = (k: number): number => {
    let sum = 0;
    for (let i = Math.max(k - windowTicks, 0); i < k; i++) sum += occupancy[i];
    return sum * tick;
  };
  const assignments: Assignment[] = [];
  for (const p of placements) {
    const s = specs.get(p.taskId) as Spec;
    const b = buckets[p.start] as Bucket; // a placed start is workable ⇒ it has a daypart
    const post = cellTable.get(cellKey(s.category, b.daypart, b.dayType));
    if (post === undefined) throw new Error(`no posterior for ${s.category} ${b.id}`);
    const u = s.deadlineTick === null ? null : s.deadlineTick - p.start;
    const isExperiment = draw !== null && draw.taskId === s.id;
    const features = featureVector({
      bucket: b,
      value: s.value,
      estMinutes: s.estMinutes,
      splittable: s.splittable,
      uTicks: u,
      postponeCount: s.postponeCount,
      cellMean: post.mean,
      cellSd: post.sd,
      precedingLoadMinutes: precedingLoad(p.start),
    });
    let rationaleKey: string;
    let rationaleParams: Record<string, unknown>;
    if (s.pinnedTick !== null) {
      rationaleKey = 'pinned';
      rationaleParams = {};
    } else if (isExperiment) {
      rationaleKey = 'experiment';
      rationaleParams = { category: s.category, daypart: b.daypart };
    } else if (u !== null && urgencyTerm(u) >= URGENCY_RATIONALE_THRESHOLD) {
      rationaleKey = 'deadline_pressure';
      rationaleParams = { hours_to_deadline: Math.round((u * tick) / 6) / 10 };
    } else {
      rationaleKey = 'earliest_feasible';
      rationaleParams = { category: s.category };
    }
    const slotStartMs = s.pinnedStartMs ?? tickStartMs(grid, p.start);
    const slotEndMs = s.pinnedStartMs !== null
      ? s.pinnedStartMs + s.estMinutes * 60_000
      : tickStartMs(grid, p.start + p.size);
    assignments.push({
      task_id: s.id,
      chunk_index: p.chunkIndex,
      slot_start: new Date(slotStartMs).toISOString(),
      slot_end: new Date(slotEndMs).toISOString(),
      context_bucket: b.id,
      q_hat: null,
      confidence: null,
      rationale_key: rationaleKey,
      rationale_params: rationaleParams,
      is_experiment: isExperiment,
      propensity: isExperiment && draw !== null ? draw.propensity : null,
      experiment_top_m: isExperiment && draw !== null ? [...draw.topM] : null,
      features,
    });
  }
  assignments.sort((a, b) =>
    a.slot_start < b.slot_start
      ? -1
      : a.slot_start > b.slot_start
      ? 1
      : a.task_id < b.task_id
      ? -1
      : a.task_id > b.task_id
      ? 1
      : a.chunk_index - b.chunk_index
  );

  const unplaced: Unplaced[] = [];
  for (const t of req.tasks) {
    if (placedIds.has(t.id)) continue;
    unplaced.push({
      task_id: t.id,
      reason: unplaceable.has(t.id) ? 'no_feasible_start' : 'deferred',
    });
  }

  return {
    engine: 'heuristic',
    model_version: HEURISTIC_MODEL_VERSION,
    solver_status: 'HEURISTIC',
    assignments,
    unplaced,
    infeasible: null,
    experiment: draw,
    telemetry: {
      rng_seed: seed,
      experiment_drawn: draw !== null,
      experiment_dropped: experimentDropped,
      n_eligible: eligible.length,
      n_ticks: n,
      tick_minutes: tick,
      total_ms: Math.round(performance.now() - t0),
    },
  };
}
