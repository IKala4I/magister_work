"""Named constants for every specs/07 Appendix A parameter owned by the training/OPE side.

Tagged with Appendix A rows; SPEC-FIXED values restate the frozen specs. A default changes
only together with its ADR (fixing phase per Appendix A).
"""

ESS_FLOOR = 100.0  # [A: ESS floor] SPEC-FIXED (File 04 §2.3: ESS < 100 = non-evidence)
IPS_CLIP_M = 10.0  # [A: IPS clip M] P11
MC_PROPENSITY_K = 32  # [A: MC propensity K] SPEC-FIXED (File 04 §2.3)
ALS_FACTORS = 32  # [A: ALS hyperparams] P11
ALS_REG_LAMBDA = 0.1  # [A: ALS hyperparams] P11
ALS_CONFIDENCE_ALPHA = 40.0  # [A: ALS hyperparams] P11 (Hu et al. 2008 default)
KMEANS_K_RANGE = (3, 8)  # [A: k-means k] P11 (silhouette-selected)
FOLD_IN_MIN_OUTCOMES = 30  # SPEC-FIXED (File 04 §3.4: fold-in after ≥30 attributed outcomes)

# --- PAR anchors (File 06 §1.4; spec-conflicts H2 — the ONLY constants shared with the
# reward mapping; mirrored from packages/shared + supabase/functions/_shared/params.ts) ---
PAR_GRACE_MINUTES = 15.0  # [A: slot start grace] SPEC-ANCHORED
PAR_MIN_FRACTION = 0.5  # [A: >=50% finished] SPEC-FIXED

# --- empirical-Bayes prior refresh (File 04 §3.5; guards fixed by ADR-0015 §6) ---
EB_MIN_USERS = 5  # a (class, cell) refits only with >=5 mature contributors, else carry-over
EB_VAR_FLOOR = 1e-4  # s² clamp: below this, moments explode (n0 -> inf)
EB_VAR_CEIL_FACTOR = 0.9  # s² <= factor · m(1-m) keeps alpha0, beta0 positive
EB_N0_MIN = 2.0  # fitted prior strength clamp (ADR-0015 §6: bootstrap, not straitjacket)
EB_N0_MAX = 16.0

# --- eval gate + registry (ADR-0015 §7) ---
HOLDOUT_USER_FRACTION = 0.2  # priors gate: held-out users for the log-loss comparison
ARTIFACT_BUCKET = "models"  # private Supabase Storage bucket (EU) — ADR-0011

# --- OPE (File 04 §2; ADR-0015 §8–§10) ---
DM_FEATURE_SLICE = slice(0, 14)  # bucket-swappable features 0–13 (specs/07 §3.2.4);
# cell_mean/cell_sd/preceding_load are bucket-dependent and unlogged for counterfactual
# buckets — excluded, with a fitted-with/without sensitivity check (ADR-0015 §9)
MC_LAPLACE = 1.0  # MC propensity smoothing: (wins + 1)/(K + |A|) — a zero p breaks 1/p

# --- reporting (privacy README §7: aggregates only) ---
REPORT_MIN_CELL = 5  # minimum group size in any researcher-facing aggregate
