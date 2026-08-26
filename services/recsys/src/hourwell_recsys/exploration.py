"""Budgeted ε-exploration with EXACT propensity (File 04 §1.4; spec-conflicts M2; M-01).

Per plan, with probability ε: one eligible task is drawn uniformly (M2 — independence from
bucket outcomes), then its bucket is drawn uniformly from its top-m buckets by q̂. The logged
propensity is the within-slice value p = ε/|A_m(x)| — a pure function of the settings and the
size of the ranked set, never derived from the draw, the solver, or the estimate. Eligibility
(Appendix A; ADR-0008 §1, owner decision 2026-08-26): non-critical, unpinned, ≤ 2 h, and at
least EXPERIMENT_MIN_BUCKETS distinct feasible buckets, so |A_m(x)| ∈ {2, …, m} and the draw is
uniform within the slice on every row (File 04 §2.2 replay restricted to A_m(x) stays valid).
The same primitive is mirrored by the arm-A edge function (H1 symmetry):
supabase/functions/_shared/exploration.ts.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from hourwell_recsys.params import (
    EPSILON,
    EXPERIMENT_MAX_DURATION_TICKS,
    EXPERIMENT_MIN_BUCKETS,
    TOP_M,
)


@dataclass(frozen=True)
class ExperimentCandidate:
    task_id: str
    duration: int
    critical: bool
    pinned: bool
    feasible_bucket_ids: tuple[str, ...]


@dataclass(frozen=True)
class ExperimentDraw:
    task_id: str
    bucket_id: str
    propensity: float
    top_m: tuple[str, ...]
    n_eligible: int


def propensity(epsilon: float, m: int) -> float:
    """p = ε/m with m = |A_m(x)| — the only producer of a logged propensity in the service."""
    if not 0.0 <= epsilon <= 1.0 or m < 1:
        raise ValueError("epsilon ∈ [0, 1] and m ≥ 1 required")
    return epsilon / m


def eligible_tasks(
    candidates: Sequence[ExperimentCandidate],
    *,
    min_buckets: int = EXPERIMENT_MIN_BUCKETS,
    max_duration_ticks: int = EXPERIMENT_MAX_DURATION_TICKS,
) -> list[str]:
    out = [
        c.task_id
        for c in candidates
        if not c.critical
        and not c.pinned
        and c.duration <= max_duration_ticks
        and len(set(c.feasible_bucket_ids)) >= min_buckets
    ]
    return sorted(out)


def top_m_buckets(ranking: Sequence[tuple[str, float]], m: int = TOP_M) -> tuple[str, ...]:
    """A_m(x): the top-m bucket ids by q̂ (desc) — fewer when the task reaches fewer buckets;
    ties broken by bucket id so the set is a deterministic function of the estimates."""
    ordered = sorted(ranking, key=lambda pair: (-pair[1], pair[0]))
    return tuple(b for b, _ in ordered[:m])


def draw_experiment(
    rng: np.random.Generator,
    *,
    eligible: Sequence[str],
    rankings: Mapping[str, Sequence[tuple[str, float]]],
    epsilon: float = EPSILON,
    m: int = TOP_M,
    min_buckets: int = EXPERIMENT_MIN_BUCKETS,
) -> ExperimentDraw | None:
    if not eligible:
        return None
    if rng.random() >= epsilon:  # Bernoulli(ε); ε = 1 ⇒ always, ε = 0 ⇒ never
        return None
    task_id = eligible[int(rng.integers(len(eligible)))]
    top = top_m_buckets(rankings[task_id], m)
    if len(top) < min_buckets:
        raise ValueError(f"task {task_id} has {len(top)} < {min_buckets} ranked buckets")
    bucket_id = top[int(rng.integers(len(top)))]
    return ExperimentDraw(
        task_id=task_id,
        bucket_id=bucket_id,
        propensity=propensity(epsilon, len(top)),  # exact per row: ε/|A_m(x)|
        top_m=top,
        n_eligible=len(eligible),
    )
