/**
 * Matched ε-randomization with EXACT propensity — the arm-A mirror of the service's
 * `exploration.py` (File 04 §1.4; spec-conflicts M2/H1; M-01). Per plan, with probability ε:
 * one eligible task is drawn uniformly (M2 — independence from bucket outcomes), then its
 * bucket is drawn uniformly from its top-m buckets under the ARM'S OWN ranking (the heuristic's
 * "earliest reachable" order in arm A, q̂ in arm B). The logged propensity is the within-slice
 * value p = ε/|A_m(x)|, a pure function of the settings and the size of the ranked set — never
 * of the draw. Eligibility (Appendix A + ADR-0008 §1): non-critical, unpinned, ≤ 2 h, and at
 * least EXPERIMENT_MIN_BUCKETS distinct reachable buckets (owner decision 2026-08-26: |A_m(x)|
 * ∈ {2, 3, 4}; an empty slice is fatal to RQ4, per-row uniformity keeps File 04 §2.2 valid).
 */
import { EPSILON, EXPERIMENT_MAX_DURATION_TICKS, EXPERIMENT_MIN_BUCKETS, TOP_M } from './params.ts';
import type { Rng } from './rng.ts';

export interface ExperimentCandidate {
  taskId: string;
  duration: number;
  critical: boolean;
  pinned: boolean;
  feasibleBucketIds: readonly string[];
}

export interface ExperimentDraw {
  taskId: string;
  bucketId: string;
  /** ε / |A_m(x)| — logged on the M-01 row. */
  propensity: number;
  /** A_m(x) — persisted for File 04 §2.2 replay. */
  topM: string[];
  nEligible: number;
}

/** p = ε/m — the only producer of a logged propensity on the heuristic path. */
export function propensity(epsilon: number, m: number): number {
  if (!(epsilon >= 0 && epsilon <= 1) || !Number.isInteger(m) || m < 1) {
    throw new RangeError('epsilon ∈ [0, 1] and m ≥ 1 required');
  }
  return epsilon / m;
}

export function eligibleTasks(
  candidates: readonly ExperimentCandidate[],
  options: { minBuckets?: number; maxDurationTicks?: number } = {},
): string[] {
  const minBuckets = options.minBuckets ?? EXPERIMENT_MIN_BUCKETS;
  const maxDuration = options.maxDurationTicks ?? EXPERIMENT_MAX_DURATION_TICKS;
  return candidates
    .filter(
      (c) =>
        !c.critical &&
        !c.pinned &&
        c.duration <= maxDuration &&
        new Set(c.feasibleBucketIds).size >= minBuckets,
    )
    .map((c) => c.taskId)
    .sort();
}

/** Top-m bucket ids by score (desc); ties broken by bucket id so the set is deterministic. */
export function topMBuckets(
  ranking: ReadonlyArray<readonly [string, number]>,
  m: number = TOP_M,
): string[] {
  const ordered = [...ranking].sort((a, b) =>
    (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  );
  return ordered.slice(0, m).map(([id]) => id);
}

export function drawExperiment(
  rng: Rng,
  input: {
    eligible: readonly string[];
    rankings: ReadonlyMap<string, ReadonlyArray<readonly [string, number]>>;
    epsilon?: number;
    m?: number;
    minBuckets?: number;
  },
): ExperimentDraw | null {
  const epsilon = input.epsilon ?? EPSILON;
  const m = input.m ?? TOP_M;
  const minBuckets = input.minBuckets ?? EXPERIMENT_MIN_BUCKETS;
  if (input.eligible.length === 0) return null;
  if (rng.random() >= epsilon) return null; // Bernoulli(ε); ε = 1 ⇒ always, ε = 0 ⇒ never
  const taskId = input.eligible[rng.int(input.eligible.length)];
  const ranking = input.rankings.get(taskId);
  if (ranking === undefined) throw new RangeError(`no ranking for eligible task ${taskId}`);
  const top = topMBuckets(ranking, m);
  if (top.length < minBuckets) {
    throw new RangeError(`task ${taskId} has ${top.length} < ${minBuckets} ranked buckets`);
  }
  const bucketId = top[rng.int(top.length)];
  return {
    taskId,
    bucketId,
    propensity: propensity(epsilon, top.length),
    topM: top,
    nEligible: input.eligible.length,
  };
}
