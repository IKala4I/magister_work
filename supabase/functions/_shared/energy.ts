/**
 * Beta-cell posterior with decayed evidence — mirror of the service's `energy.py`
 * (specs/07 §3.2.1; File 05 §1: 28-day half-life). The edge function READS cells only, to fill
 * features 15–16 of the logged snapshot so the arm-A slice carries the same x the learned
 * policy would have scored (File 04 §2.2 replay evaluates candidate policies on logged x).
 * It never writes model state (invariant 1 holds for the client; the EF is a trusted backend
 * that still owns no state — the service does).
 */
import { BETA_HALF_LIFE_DAYS, FALLBACK_PRIOR_N0 } from './params.ts';
import { type Daypart, DAYPART_ORDER, type DayType } from './contexts.ts';

export const HALF_LIFE_SECONDS = BETA_HALF_LIFE_DAYS * 86_400;
export const CATEGORIES = ['deep', 'admin', 'physical', 'learning'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface BetaCell {
  category: Category;
  daypart: Daypart;
  dayType: DayType;
  alpha0: number;
  beta0: number;
  succ: number;
  fail: number;
  lastEventAtMs: number | null;
}

export interface Posterior {
  alpha: number;
  beta: number;
  nEffective: number;
  mean: number;
  sd: number;
}

export function cellKey(category: string, daypart: string, dayType: string): string {
  return `${category}|${daypart}|${dayType}`;
}

/** 2^{−Δt/28d}; negative Δt (out-of-order delivery) is clamped to 0 — evidence never grows. */
export function decayFactor(elapsedSeconds: number): number {
  return Math.pow(2, -Math.max(elapsedSeconds, 0) / HALF_LIFE_SECONDS);
}

export function posterior(cell: BetaCell, nowMs: number): Posterior {
  let s = cell.succ;
  let f = cell.fail;
  if (cell.lastEventAtMs !== null) {
    const w = decayFactor((nowMs - cell.lastEventAtMs) / 1000);
    s *= w;
    f *= w;
  }
  const alpha = cell.alpha0 + s;
  const beta = cell.beta0 + f;
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  return { alpha, beta, nEffective: s + f, mean: alpha / (alpha + beta), sd: Math.sqrt(variance) };
}

/** Flat pre-onboarding prior (μ₀ = 0.5 at half strength) — the service's `fallback_cells`. */
export function fallbackCells(mu0 = 0.5, n0 = FALLBACK_PRIOR_N0): BetaCell[] {
  const out: BetaCell[] = [];
  for (const category of CATEGORIES) {
    for (const dayType of ['weekday', 'weekend'] as const) {
      for (const daypart of DAYPART_ORDER) {
        out.push({
          category,
          daypart,
          dayType,
          alpha0: mu0 * n0,
          beta0: (1 - mu0) * n0,
          succ: 0,
          fail: 0,
          lastEventAtMs: null,
        });
      }
    }
  }
  return out;
}

/** Posterior lookup table keyed by (category, daypart, dayType); falls back to the flat prior. */
export function posteriorTable(cells: readonly BetaCell[], nowMs: number): Map<string, Posterior> {
  const table = new Map<string, Posterior>();
  for (const c of fallbackCells()) {
    table.set(cellKey(c.category, c.daypart, c.dayType), posterior(c, nowMs));
  }
  for (const c of cells) table.set(cellKey(c.category, c.daypart, c.dayType), posterior(c, nowMs));
  return table;
}
