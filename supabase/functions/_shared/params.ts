/**
 * Edge-function-owned copies of the specs/07 Appendix A parameters the arm-A heuristic and the
 * matched ε-randomization need. The Deno bundle cannot import the pnpm workspace
 * (`packages/shared/src/params.ts`) or the Python service, so the values live here and are
 * PINNED by `params_test.ts` against both sources — a drift on either side fails the test.
 * H1 (spec-conflicts) requires identical ε, m and eligibility across arms; L16 makes the service
 * reject mismatched ε/m, so a drift here would also surface as a 422 in production.
 */

// --- planning grid (SPEC-FIXED, File 04 §1.2) ---
export const TICK_MINUTES = 15;
export const BUFFER_TICKS = 1; // [A: b] P5
export const D_MIN_TICKS = 2; // [A: d_min] P5
export const MAX_CHUNKS = 4; // ADR-0007 §3
export const HORIZON_DAYS = { day: 1, week: 7 } as const;

// --- urgency (File 04 §1.2; specs/07 §3.2.4 row 13) ---
export const ETA_TICKS = 16; // [A: η] P5
export const URGENCY_RATIONALE_THRESHOLD = 0.5; // ADR-0007 §10

// --- exploration slice (File 04 §1.4; spec-conflicts M2; ADR-0008 §1) ---
export const EPSILON = 1.0; // [A: ε] P5
export const TOP_M = 4; // [A: m] SPEC-FIXED
export const EXPERIMENT_MAX_DURATION_TICKS = 8; // [A: experiment eligibility ≤2 h] P5
/** Owner decision 2026-08-26: |A_m(x)| ∈ {2, 3, 4} with exact per-row p = ε/|A_m(x)|. */
export const EXPERIMENT_MIN_BUCKETS = 2;

// --- context bucketing φ and features (specs/07 §3.2.4–3.2.5, SPEC-FIXED) ---
export const FATIGUE_RUN_MINUTES = 90;
export const FATIGUE_GAP_MINUTES = 15;
export const PRECEDING_LOAD_WINDOW_MINUTES = 180;
export const LOG_DURATION_REF_MINUTES = 480;
export const POSTPONE_CAP = 5;
export const FEATURE_DIM = 17;

// --- energy model (File 05 §1; File 04 §3.3; ADR-0005) ---
export const BETA_HALF_LIFE_DAYS = 28; // SPEC-FIXED
export const FALLBACK_PRIOR_N0 = 4; // N0_IN_HOURS · 0.5 — flat prior at half strength

// --- plan flow (specs/07 §5; NFR-R2/NFR-P1) ---
export const PLAN_FALLBACK_BUDGET_MS = 1900; // [A: /plan EF fallback budget] P6
export const PLAN_RATE_LIMIT_PER_DAY = 30; // [A: /plan rate limit] P5

// --- reward mapping (specs/07 §3.4.1–3.4.2; File 06 §1.4 PAR anchors; spec-conflicts H2) — P7 ---
/** PAR anchor: a session "belongs" to its block when started within ±15 min of slot_start. */
export const PAR_GRACE_MINUTES = 15; // [A: slot start grace] SPEC-ANCHORED
export const PAR_MIN_FRACTION = 0.5; // [A: ≥50% finished] SPEC-FIXED
export const REWARD_OFF_SLOT = 0.3; // [A: off-slot same-day reward] P7 (ADR-0010)
export const REWARD_OVERRIDE_OUT = 0.1; // [A: override rewards] P7 (ADR-0010)
export const REWARD_OVERRIDE_IN = 0.7; // [A: override rewards] P7 (ADR-0010)
export const CORRECTION_WINDOW_DAYS = 7; // [A: correction window] P7 (ADR-0010)

// --- duration estimator (UC-06 A2; Appendix A "duration estimator") — P7 (ADR-0010) ---
export const DURATION_EWMA_ALPHA = 0.3; // [A: duration estimator] EWMA α per (user, category)
/** Sessions before the estimate is applied to planning; below it the user's own estimate stands. */
export const DURATION_MIN_SESSIONS = 3; // [INFERRED] ADR-0010
/** The applied multiplier is clipped so one outlier session cannot halve or double a task. */
export const DURATION_RATIO_CLIP: readonly [number, number] = [0.5, 2.0]; // [INFERRED] ADR-0010
/** A single session ratio is clipped before it enters the EWMA (a 5-min "finish" of a 4 h task). */
export const DURATION_SAMPLE_CLIP: readonly [number, number] = [0.25, 4.0]; // [INFERRED] ADR-0010

/** NFR-O1 model tag on every heuristic recommendation (arm A and the NFR-R2 fallback). */
export const HEURISTIC_MODEL_VERSION = 'heuristic-p6.0';

// --- retention (specs/07 §7, Appendix A; ADR-0014 §10) ---
/** Anonymous accounts inactive (no sign-in, no event) for this long are erased by the daily sweep. */
export const ANONYMOUS_RETENTION_DAYS = 30; // [A: retention windows] P10
