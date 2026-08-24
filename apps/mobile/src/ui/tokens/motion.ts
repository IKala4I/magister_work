/**
 * Motion tokens — File 02 §3.4: "physics, not flourish: spring-based transitions ≤ 250 ms;
 * reduced-motion honored (NFR-A2)".
 *
 * Reanimated 4 duration-based springs consume these directly. When the OS reports reduced
 * motion, use `resolveMotion(reduceMotion)` — every duration collapses to 0 (state changes
 * apply instantly; no correctness may depend on an animation running).
 */

/** Hard ceiling from the spec; tests enforce every duration stays under it. */
export const MOTION_MAX_MS = 250;

export interface SpringSpec {
  readonly duration: number;
  readonly dampingRatio: number;
}

export const springs = {
  /** Small state changes: chips, toggles, tab emphasis. */
  fast: { duration: 120, dampingRatio: 1 },
  /** Default transition: cards, sheets settling. */
  standard: { duration: 200, dampingRatio: 1 },
  /** Entrances that may slightly overshoot (drag release, block placement). */
  emphasized: { duration: 250, dampingRatio: 0.85 },
} as const satisfies Record<string, SpringSpec>;

export type SpringName = keyof typeof springs;

export interface MotionConfig {
  readonly springs: Record<SpringName, SpringSpec>;
  readonly reduceMotion: boolean;
}

const STILL: Record<SpringName, SpringSpec> = {
  fast: { duration: 0, dampingRatio: 1 },
  standard: { duration: 0, dampingRatio: 1 },
  emphasized: { duration: 0, dampingRatio: 1 },
};

export function resolveMotion(reduceMotion: boolean): MotionConfig {
  return { springs: reduceMotion ? STILL : springs, reduceMotion };
}
