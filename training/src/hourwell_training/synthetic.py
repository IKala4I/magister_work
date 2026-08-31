"""Synthetic ground truth — the ONLY data CI ever trains on (ADR-0011/ADR-0015 §16), the
estimator-recovery oracle, and the public "synthetic dataset + replay harness" artifact.

A known completion model q_true(bucket, chronotype) generates slice rows with EXACT
within-slice propensities (File 04 §1.4: uniform over A_m(x), p = 1/|A_m(x)| at ε = 1), so
any policy's TRUE value is computable in closed form and the estimators are tested for
RECOVERY, not just arithmetic.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from hourwell_training.ope import SliceRow

__all__ = [
    "BUCKETS_WD",
    "CLASSES",
    "SyntheticWorld",
    "make_world",
    "q_true",
    "true_value_deterministic",
    "true_value_stochastic",
]

BUCKETS_WD = (
    "EM.wd",
    "MO.wd.fresh",
    "MO.wd.fatigued",
    "MD.wd",
    "AF.wd.fresh",
    "AF.wd.fatigued",
    "EV.wd",
    "NT.wd",
)
CLASSES = ("DM", "MM", "INT", "ME", "DE")

#: chronotype → morningness; daypart → tilt (a coarse, deliberately known File 04 §3.2 shape)
_MORNINGNESS = {"DM": 1.0, "MM": 0.6, "INT": 0.0, "ME": -0.6, "DE": -1.0}
_DAYPART_TILT = {"EM": 1.0, "MO": 0.6, "MD": 0.0, "AF": -0.2, "EV": -0.6, "NT": -1.0}


def q_true(bucket: str, chronotype: str) -> float:
    """Ground-truth completion probability, inside (0.15, 0.85) by construction."""
    daypart = bucket.split(".")[0]
    fatigued = bucket.endswith(".fatigued")
    logit = 0.5 * _MORNINGNESS[chronotype] * _DAYPART_TILT[daypart] - (0.4 if fatigued else 0.0)
    return float(0.5 + 0.35 * np.tanh(logit))


@dataclass(frozen=True)
class SyntheticWorld:
    rows: list[SliceRow]


def make_world(n_rows: int = 2000, seed: int = 42) -> SyntheticWorld:
    rng = np.random.default_rng(seed)
    rows: list[SliceRow] = []
    for i in range(n_rows):
        klass = CLASSES[int(rng.integers(len(CLASSES)))]
        m = int(rng.integers(2, 5))  # |A_m(x)| ∈ {2, 3, 4} (ADR-0008 §1)
        top_m = tuple(str(b) for b in rng.choice(np.array(BUCKETS_WD), size=m, replace=False))
        chosen = top_m[int(rng.integers(m))]  # uniform within the slice — replay's premise
        rows.append(
            SliceRow(
                recommendation_id=f"s{i:05d}",
                bucket_id=chosen,
                top_m=top_m,
                propensity=1.0 / m,
                reward=float(rng.random() < q_true(chosen, klass)),
                context={"chronotype": klass},
            )
        )
    return SyntheticWorld(rows=rows)


def true_value_deterministic(world: SyntheticWorld, choose: Callable[[SliceRow], str]) -> float:
    """E[q_true(π(x), class)] over the logged contexts — the closed-form target."""
    return sum(
        q_true(choose(r), str(r.context["chronotype"])) for r in world.rows
    ) / len(world.rows)


def true_value_stochastic(
    world: SyntheticWorld, prob: Callable[[SliceRow, str], float]
) -> float:
    """E[Σ_b π(b|x) · q_true(b, class)] over the logged contexts."""
    return sum(
        sum(prob(r, b) * q_true(b, str(r.context["chronotype"])) for b in r.top_m)
        for r in world.rows
    ) / len(world.rows)
