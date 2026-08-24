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
