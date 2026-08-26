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

/** NFR-O1 model tag on every heuristic recommendation (arm A and the NFR-R2 fallback). */
export const HEURISTIC_MODEL_VERSION = 'heuristic-p6.0';
