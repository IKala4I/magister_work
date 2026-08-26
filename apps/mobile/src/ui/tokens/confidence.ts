/**
 * Confidence = solidity (File 02 §3.1): high-confidence recommendations render nearly
 * opaque; exploratory suggestions render lighter/glassier with a subtle dashed border.
 * The UI is the explanation layer of the ML system — this mapping IS that semantic.
 *
 * Related UI contracts (File 02 §3.4, CLAUDE.md invariant 14): skip is never red; the
 * danger color is reserved for destructive actions and missed hard deadlines.
 */

/**
 * Opacity floor for confidence 0 [INFERRED]: glassy but still legible against `surface`;
 * text inside blocks keeps full opacity — solidity applies to the block chrome, not copy.
 */
export const CONFIDENCE_OPACITY_MIN = 0.55;
export const CONFIDENCE_OPACITY_MAX = 1;

/** Linear map from confidence ∈ [0,1] to panel opacity; out-of-range input is clamped. */
export function confidenceOpacity(confidence: number): number {
  const c = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  return CONFIDENCE_OPACITY_MIN + (CONFIDENCE_OPACITY_MAX - CONFIDENCE_OPACITY_MIN) * c;
}

/**
 * Rendering value for rows WITHOUT a confidence (heuristic engine — arm A / NFR-R2 fallback —
 * has no estimate; the stored column stays NULL). [INFERRED] 0.7 ≈ the learned engine's day-0
 * confidence under the flat prior (ADR-0008 §5), so arms start out looking alike; the a11y
 * label never claims a percentage for these rows.
 */
export const NULL_CONFIDENCE_RENDER = 0.7;

/** Dashed-border treatment for ε-slice "experiment" blocks (FR-22). */
export const EXPERIMENT_BORDER = { style: 'dashed', width: 1 } as const;
