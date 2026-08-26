"""Budgeted ε-exploration with EXACT propensity (File 04 §1.4; spec-conflicts M2; M-01).

Per plan, with probability ε: one eligible task is drawn uniformly (M2 — independence from
bucket outcomes), then its bucket is drawn uniformly from its top-m buckets by q̂. The logged
propensity is the within-slice value p = ε/m — a pure function of the settings, never derived
from the draw, the solver, or the estimate. Eligibility (Appendix A): non-critical, unpinned,
≤ 2 h, and at least m feasible buckets (otherwise "uniform over top-m" is not p = ε/m —
ADR-0007 §5). The same primitive is what the arm-A edge function must mirror (H1 symmetry).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from hourwell_recsys.params import EPSILON, EXPERIMENT_MAX_DURATION_TICKS, TOP_M


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
    """p = ε/m — the only producer of a logged propensity in the service."""
    if not 0.0 <= epsilon <= 1.0 or m < 1:
        raise ValueError("epsilon ∈ [0, 1] and m ≥ 1 required")
    return epsilon / m


def eligible_tasks(
    candidates: Sequence[ExperimentCandidate],
    *,
    m: int = TOP_M,
    max_duration_ticks: int = EXPERIMENT_MAX_DURATION_TICKS,
) -> list[str]:
    out = [
        c.task_id
        for c in candidates
        if not c.critical
        and not c.pinned
        and c.duration <= max_duration_ticks
        and len(set(c.feasible_bucket_ids)) >= m
    ]
    return sorted(out)


def top_m_buckets(ranking: Sequence[tuple[str, float]], m: int = TOP_M) -> tuple[str, ...]:
    """Top-m bucket ids by q̂ (desc); ties broken by bucket id so the set is a deterministic
    function of the estimates."""
    ordered = sorted(ranking, key=lambda pair: (-pair[1], pair[0]))
    return tuple(b for b, _ in ordered[:m])


def draw_experiment(
    rng: np.random.Generator,
    *,
    eligible: Sequence[str],
    rankings: Mapping[str, Sequence[tuple[str, float]]],
    epsilon: float = EPSILON,
    m: int = TOP_M,
) -> ExperimentDraw | None:
    if not eligible:
        return None
    if rng.random() >= epsilon:  # Bernoulli(ε); ε = 1 ⇒ always, ε = 0 ⇒ never
        return None
    task_id = eligible[int(rng.integers(len(eligible)))]
    top = top_m_buckets(rankings[task_id], m)
    if len(top) != m:
        raise ValueError(f"task {task_id} has {len(top)} < m={m} ranked buckets")
    bucket_id = top[int(rng.integers(m))]
    return ExperimentDraw(
        task_id=task_id,
        bucket_id=bucket_id,
        propensity=propensity(epsilon, m),
        top_m=top,
        n_eligible=len(eligible),
    )
