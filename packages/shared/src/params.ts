/**
 * Named constants for every specs/07 Appendix A parameter owned by the client and the
 * Supabase Edge Functions. Tagged with Appendix A rows; SPEC-FIXED values restate the
 * frozen specs. A default changes only together with its ADR (fixing phase per Appendix A).
 *
 * PAR note (spec-conflicts H2): PAR_GRACE_MINUTES and PAR_MIN_FRACTION are shared by the
 * reward mapping AND the pre-registered study code — single source on the TS side, pinned
 * to the spec values by test on each side of the language boundary.
 */

// --- PAR anchors (SPEC-ANCHORED, File 06 §1.4) ---
export const PAR_GRACE_MINUTES = 15; // [A: slot start grace] P7
export const PAR_MIN_FRACTION = 0.5; // [A: ≥50% finished] SPEC-FIXED

// --- reward mapping, computed only in Edge Functions (specs/07 §3.4.1) ---
export const REWARD_OFF_SLOT = 0.3; // [A: off-slot same-day reward] P7
export const REWARD_OVERRIDE_OUT = 0.1; // [A: override rewards] P7
export const REWARD_OVERRIDE_IN = 0.7; // [A: override rewards] P7
export const CORRECTION_WINDOW_DAYS = 7; // [A: correction window] P7

// --- exploration slice, passed to /plan by the edge facade (File 04 §1.4) ---
export const EPSILON = 1.0; // [A: ε] P5
export const TOP_M = 4; // [A: m] SPEC-FIXED

// --- plan flow (specs/07 §5; NFR-R2/NFR-P1) ---
export const PLAN_FALLBACK_BUDGET_MS = 1900; // [A: /plan EF fallback budget] P6
export const PLAN_GENERATION_LOCAL_TIME = '06:00'; // [A: plan triggers] P6 (UC-03)
export const ATTRIBUTION_LOCAL_TIME = '23:55'; // SPEC-FIXED (File 05 §1)
export const PLAN_RATE_LIMIT_PER_DAY = 30; // [A: /plan rate limit] P5

// --- notifications (FR-50) ---
export const NOTIFICATION_DAILY_CAP = 5; // SPEC-FIXED
export const NOTIFICATION_LEAD_MINUTES = 10; // [A: notification lead] P10

// --- UI contracts (File 02 §3.4) ---
export const UNDO_WINDOW_SECONDS = 6; // SPEC-FIXED

// --- retention (specs/07 §7) ---
export const EVENTS_RETENTION_MONTHS = 24; // [A: retention windows] P10
export const ANONYMOUS_RETENTION_DAYS = 30; // [A: retention windows] P10
