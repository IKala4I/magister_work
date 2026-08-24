"""Effective sample size for importance-weighted OPE estimates (specs/04 §2.3).

ESS = (Σ w_i)² / Σ w_i².  Estimates with ESS < ESS_FLOOR are treated as
non-evidence (specs/04 §2.3); the full estimator family arrives in P11.
"""

from collections.abc import Sequence

ESS_FLOOR = 100.0


def effective_sample_size(weights: Sequence[float]) -> float:
    if not weights:
        return 0.0
    if any(w < 0 for w in weights):
        raise ValueError("importance weights must be non-negative")
    total = sum(weights)
    total_sq = sum(w * w for w in weights)
    if total_sq == 0.0:
        return 0.0
    return (total * total) / total_sq


def is_evidence(weights: Sequence[float]) -> bool:
    """True iff an estimate built on these weights clears the ESS floor."""
    return effective_sample_size(weights) >= ESS_FLOOR
