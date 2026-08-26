/** Feature vector x_{τ,c}, d = 17, in the exact order of specs/07 §3.2.4 — mirror of `features.py`. */
import { type Bucket, DAYPART_ORDER } from './contexts.ts';
import {
  ETA_TICKS,
  FEATURE_DIM,
  LOG_DURATION_REF_MINUTES,
  POSTPONE_CAP,
  PRECEDING_LOAD_WINDOW_MINUTES,
} from './params.ts';

export const FEATURE_NAMES = [
  'intercept',
  'daypart_EM',
  'daypart_MO',
  'daypart_MD',
  'daypart_AF',
  'daypart_EV',
  'daypart_NT',
  'is_weekend',
  'rel_fatigued',
  'value_scaled',
  'log_duration_scaled',
  'splittable',
  'urgency',
  'postpone_scaled',
  'cell_mean',
  'cell_sd',
  'preceding_load',
] as const;

/** e^{−u/η} with u = ticks to deadline; 0 when the task has no deadline (§3.2.4 row 13). */
export function urgencyTerm(uTicks: number | null, eta: number = ETA_TICKS): number {
  if (uTicks === null) return 0;
  return Math.exp(-Math.max(uTicks, 0) / eta);
}

export interface FeatureInput {
  bucket: Bucket;
  value: number;
  estMinutes: number;
  splittable: boolean;
  uTicks: number | null;
  postponeCount: number;
  cellMean: number;
  cellSd: number;
  precedingLoadMinutes: number;
}

export function featureVector(input: FeatureInput): number[] {
  const x = new Array<number>(FEATURE_DIM).fill(0);
  x[0] = 1;
  x[1 + DAYPART_ORDER.indexOf(input.bucket.daypart)] = 1;
  x[7] = input.bucket.dayType === 'weekend' ? 1 : 0;
  x[8] = input.bucket.position === 'fatigued' ? 1 : 0;
  x[9] = (input.value - 1) / 2;
  x[10] = Math.min(Math.log(Math.max(input.estMinutes, 1)) / Math.log(LOG_DURATION_REF_MINUTES), 1);
  x[11] = input.splittable ? 1 : 0;
  x[12] = urgencyTerm(input.uTicks);
  x[13] = Math.min(input.postponeCount, POSTPONE_CAP) / POSTPONE_CAP;
  x[14] = input.cellMean;
  x[15] = input.cellSd;
  x[16] = Math.min(input.precedingLoadMinutes, PRECEDING_LOAD_WINDOW_MINUTES) /
    PRECEDING_LOAD_WINDOW_MINUTES;
  return x;
}
