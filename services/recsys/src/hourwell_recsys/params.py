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
BLEND_SGD_LR = 0.05  # [A: blend lr] P7
DURATION_EWMA_ALPHA = 0.3  # [A: duration estimator] P7

# --- exploration slice (File 04 §1.4; spec-conflicts M2) ---
EPSILON = 1.0  # [A: ε] P5 — P(one experiment placement per plan)
TOP_M = 4  # [A: m] SPEC-FIXED
EXPERIMENT_MAX_DURATION_TICKS = 8  # [A: experiment eligibility ≤2 h] P5

# --- cold-start priors (SPEC-FIXED, File 04 §3.3) ---
N0_IN_HOURS = 8.0
N0_OUT_HOURS = 4.0
WEEKEND_BLEND_TARGET = 0.55

# --- service (specs/07 §5/§7) ---
PLAN_RATE_LIMIT_PER_DAY = 30  # [A: /plan rate limit] P5
