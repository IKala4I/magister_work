"""Named constants for every specs/07 Appendix A parameter owned by the RecSys service.

Each constant is tagged with its Appendix A row. SPEC-FIXED values restate a number the
frozen specs pin; the rest are the proposed defaults, finally fixed by ADR in the phase
named in Appendix A. Change policy: a default may change only together with its ADR.
"""

# --- planning grid (SPEC-FIXED, File 04 §1.2) ---
TICK_MINUTES = 15
DAY_MAX_TICKS = 96
WEEK_MAX_TICKS = 672

# --- solver (File 04 §1.3/§1.5) ---
SOLVER_TIME_CAP_S = 1.5  # [A: solver time cap] SPEC-FIXED
DEGRADATION_LITERAL_THRESHOLD = 40_000  # [A: degradation ladder trigger] SPEC-FIXED (4·10⁴)
BUFFER_TICKS = 1  # [A: b] P5
D_MIN_TICKS = 2  # [A: d_min] P5
RUN_LENGTH_L_TICKS = 12  # [A: L] P5
RUN_LENGTH_CAP_TICKS = 8  # [A: H_g] P5 (deep category; admin uncapped)
LAMBDA_S = 0.3  # [A: λ_s] P5
LAMBDA_F = 0.5  # [A: λ_f] P5
M_TAU_FACTOR = 10.0  # [A: M_τ = factor · v_τ] P5
GAMMA_U = 0.5  # [A: γ_u] P5
ETA_TICKS = 16  # [A: η] P5 (4 h)

# --- bandit / TS (File 04 §1.4; specs/07 §3.2) ---
SIGMA_SQ_TS = 0.25  # [A: σ²] P5
ALPHA_UCB = 1.0  # [A: α_ucb] P5
FEATURE_DIM = 17  # [A: d] P5 (specs/07 §3.2.4)
BETA_HALF_LIFE_DAYS = 28.0  # [A: Beta half-life] SPEC-FIXED (File 05 §1)
BLEND_INIT_W_ENERGY = 0.7  # [A: blend init] P7
BLEND_INIT_W_BANDIT = 0.3  # [A: blend init] P7
BLEND_SGD_LR = 0.05  # [A: blend lr] P7 (ADR-0010: projected SGD on ½(pred − r)²)
DURATION_EWMA_ALPHA = 0.3  # [A: duration estimator] P7 — computed in the edge function (ADR-0010)

# --- cold-start rungs (specs/07 §3.6; Appendix A "rung-2 thresholds") — P7 (ADR-0010) ---
RUNG2_CELL_EVIDENCE_FACTOR = 1.0  # a cell is "personal" once decayed S + F > factor · (α₀ + β₀)
RUNG2_ACTIVE_CELL_FRACTION = (
    0.5  # the learning-mode badge drops when ≥ 50 % of ACTIVE cells are personal
)

# --- exploration slice (File 04 §1.4; spec-conflicts M2) ---
EPSILON = 1.0  # [A: ε] P5 — P(one experiment placement per plan)
TOP_M = 4  # [A: m] SPEC-FIXED
EXPERIMENT_MAX_DURATION_TICKS = 8  # [A: experiment eligibility ≤2 h] P5
# Owner decision 2026-08-26 (ADR-0008 §1): |A_m(x)| ∈ {2, 3, 4} with exact per-row p = ε/|A_m(x)|.
# Under the strict "≥ m buckets" rule a plain 09–18 day rarely had an eligible task (RQ4 data rate).
EXPERIMENT_MIN_BUCKETS = 2

# --- cold-start priors (SPEC-FIXED, File 04 §3.3) ---
N0_IN_HOURS = 8.0
N0_OUT_HOURS = 4.0
WEEKEND_BLEND_TARGET = 0.55

# --- service (specs/07 §5/§7) ---
PLAN_RATE_LIMIT_PER_DAY = 30  # [A: /plan rate limit] P5

# --- P5 additions (ADR-0007) ---
LAMBDA_D = 1.0  # [A: M_τ carries the deferral scale; λ_d is the unit multiplier] P5 (ADR-0007 §1)
RUN_LENGTH_CAPS: dict[str, int] = {"deep": RUN_LENGTH_CAP_TICKS}  # [A: H_g] deep only; others off
OBJECTIVE_SCALE = 10_000  # integer scaling of float weights for CP-SAT (ADR-0007 §2)
SOLVER_NUM_WORKERS = 2  # matches the 2 vCPU target (File 04 §1.5 "on 2 vCPU")
# Box-specific, measured (ADR-0007 §11 treatment; the spec's 4·10⁴ stays the outer bound; an UNKNOWN
# outcome still escalates to the next rung — "still hot", File 04 §1.5).
#   2026-08-26, M-series Mac: 15-min week instances at 8–10k literals presolve-bound → 8_000.
#   2026-08-28, deployment box (Oracle A1, 2 pinned cores, ADR-0009): the 15-min week rung is
#   already presolve-bound at 3.6k literals (UNKNOWN 19/20 under 8_000); sweep 8000/4000/3000/
#   2000/1000 → FEASIBLE 1/5/12/12/11 of 20, end-to-end p50 2.08/1.79/1.39/1.37/1.36 s. 3_000 is
#   the largest tested value that skips the presolve-bound rung on that box; lower values only
#   remove the coarse rung for mid-size instances. p5-manual-verification.md §2.2.
PRACTICAL_LITERAL_THRESHOLD = 3_000
SOLVER_MIN_SLICE_S = 0.05  # smallest per-solve slice when the plan budget is split (ADR-0007 §11)
SOLVER_LADDER_RESERVE_S = 0.5  # budget kept back for the next rung while one exists (ADR-0007 §11)
CPSAT_PROBING_LEVEL = 0  # presolve probing dominates the cap on ~10⁴ value literals (ADR-0007 §11)
CPSAT_SYMMETRY_LEVEL = 0
FATIGUE_RUN_MINUTES = 90  # specs/07 §3.2.5 (SPEC-FIXED)
FATIGUE_GAP_MINUTES = 15  # specs/07 §3.2.5 (SPEC-FIXED)
PRECEDING_LOAD_WINDOW_MINUTES = 180  # specs/07 §3.2.4 feature 17 (SPEC-FIXED)
LOG_DURATION_REF_MINUTES = 480  # specs/07 §3.2.4 feature 11 (SPEC-FIXED)
POSTPONE_CAP = 5  # specs/07 §3.2.4 feature 14 (SPEC-FIXED)
INSIGHTS_CI_QUANTILES = (0.1, 0.9)  # [INFERRED] 80% central Beta interval (ADR-0007 §9)
CONFIDENCE_SD_MAX = 0.5  # max sd of a [0,1] variable; confidence = 1 − sd_q / 0.5 (ADR-0007 §8)
ENERGY_PEAK_FACTOR = 1.15  # rationale "energy_peak" threshold (ADR-0007 §10)
URGENCY_RATIONALE_THRESHOLD = (
    0.5  # rationale "deadline_pressure" when e^{−u/η} ≥ 0.5 (ADR-0007 §10)
)
MAX_CHUNKS = 4  # a splittable task becomes at most 4 chunks (any d_τ stays coverable); ADR-0007 §3
STABILITY_BONUS_UNITS = 1  # AddHint tie-break: 1 scaled unit = 1e-4 weight; ADR-0007 §7
MODEL_VERSION = "recsys-p5.0"  # NFR-O1 model tag on every recommendation
