"""Nightly MC propensity backfill for TS traffic — File 04 §2.3 (K = 32), ADR-0015 §10.

Scores come from the SERVICE'S OWN modules (hourwell_recsys — a path dependency, so there is
exactly one scoring implementation): one TS sample per posterior per MC round, the blend the
service applies, the feature layout of specs/07 §3.2.4. Acknowledged approximations, carried
into the sensitivity analysis and the run report:
- state at BACKFILL time, not at logging time (File 04 §2.3 names this);
- candidate set = every bucket of the row's day-type (the feasible set is not logged for
  non-experiment rows);
- bucket-dependent features are rebuilt per candidate (one-hots + cell posterior), while
  preceding_load keeps the logged value for every candidate.
Laplace smoothing (wins + 1)/(K + |A|) keeps every propensity strictly positive (a zero
would make 1/p undefined). LinUCB traffic is degenerate and skipped (spec-conflicts L3);
experiment rows already carry EXACT propensities and are never touched.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend, blend_estimate
from hourwell_recsys.contexts import Bucket, all_buckets

from hourwell_training.params import MC_LAPLACE, MC_PROPENSITY_K

__all__ = ["CellPosterior", "McRow", "mc_propensity"]


@dataclass(frozen=True)
class CellPosterior:
    mean: float
    sd: float


@dataclass(frozen=True)
class McRow:
    """One learned, non-experiment recommendation awaiting a propensity."""

    recommendation_id: str
    category: str
    bucket_id: str
    features: tuple[float, ...]  # the stored 17-dim snapshot (specs/07 §3.2.4)


def _candidate_buckets(day_type: str) -> list[Bucket]:
    return [b for b in all_buckets() if b.day_type == day_type]


def _swap_bucket(
    x_logged: np.ndarray, candidate: Bucket, cell: CellPosterior
) -> np.ndarray:
    """Rebuild the snapshot for a counterfactual bucket: swap the bucket-derived components
    (one-hots 1–8, exact by construction of feature_vector) and the cell posterior (14–15);
    keep task components (0, 9–13) and preceding_load (16) from the logged row."""
    x = x_logged.copy()
    x[1:7] = 0.0
    from hourwell_recsys.contexts import DAYPART_ORDER

    x[1 + DAYPART_ORDER.index(candidate.daypart)] = 1.0
    x[7] = 1.0 if candidate.is_weekend else 0.0
    x[8] = 1.0 if candidate.is_fatigued else 0.0
    x[14] = cell.mean
    x[15] = cell.sd
    return x


def mc_propensity(
    row: McRow,
    state: bandit.LinearState,
    blend: Blend,
    cells: dict[str, CellPosterior],
    *,
    k: int = MC_PROPENSITY_K,
    seed: int = 0,
) -> float:
    """p̂(logged bucket) over K TS samples, Laplace-smoothed. `cells` maps bucket id →
    the user's CURRENT Beta posterior for (row.category, bucket)."""
    day_type = "weekend" if row.bucket_id.split(".")[1] == "we" else "weekday"
    candidates = _candidate_buckets(day_type)
    if row.bucket_id not in {b.id for b in candidates}:
        raise ValueError(f"{row.recommendation_id}: bucket {row.bucket_id} not in vocabulary")
    x_logged = np.asarray(row.features, dtype=np.float64)
    rng = np.random.default_rng(seed)
    xs: dict[str, np.ndarray] = {}
    for b in candidates:
        cell = cells.get(b.id, CellPosterior(mean=0.5, sd=0.25))
        xs[b.id] = _swap_bucket(x_logged, b, cell)
    wins = 0
    for _ in range(k):
        theta = bandit.ts_sample(state, rng)
        best_id, best_q = "", -1.0
        for b in candidates:
            x = xs[b.id]
            q = blend_estimate(float(x[14]), float(x @ theta), blend)
            # deterministic tie-break by bucket id, mirroring the service's sorted ranking
            if q > best_q or (q == best_q and b.id < best_id):
                best_id, best_q = b.id, q
        if best_id == row.bucket_id:
            wins += 1
    return (wins + MC_LAPLACE) / (k + MC_LAPLACE * len(candidates))
