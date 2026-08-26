"""Per-(task, bucket) completion estimates q̂_{τ,c} (File 04 §1.4; specs/07 §3.2.4–3.2.6).

One posterior sample per category per plan (TS) or the deterministic UCB score (LinUCB); the
Beta cell mean enters both as feature 15 and through the convex blend. Slot-dependent features
(urgency, preceding load) are evaluated at the bucket's representative tick k* = the earliest
feasible start inside the bucket (ADR-0007 §4), so the bandit is queried once per (τ, c).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass

import numpy as np

from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend, blend_estimate
from hourwell_recsys.contexts import Bucket
from hourwell_recsys.energy import Posterior
from hourwell_recsys.features import feature_vector
from hourwell_recsys.params import ALPHA_UCB, CONFIDENCE_SD_MAX, SIGMA_SQ_TS


@dataclass(frozen=True)
class TaskSpec:
    task_id: str
    category: str
    value: int
    est_minutes: int
    duration: int  # ticks
    splittable: bool
    postpone_count: int
    deadline_tick: int | None
    earliest_tick: int | None
    pinned_tick: int | None
    critical: bool


@dataclass(frozen=True)
class PairEstimate:
    task_id: str
    bucket: Bucket
    rep_tick: int
    q_hat: float
    linear: float
    cell_mean: float
    cell_sd: float
    sd_q: float
    features: np.ndarray

    @property
    def confidence(self) -> float:
        return min(max(1.0 - self.sd_q / CONFIDENCE_SD_MAX, 0.0), 1.0)


def sample_thetas(
    states: Mapping[str, bandit.LinearState],
    rng: np.random.Generator,
    *,
    policy: str,
    sigma_sq: float = SIGMA_SQ_TS,
) -> dict[str, np.ndarray]:
    """TS: one θ̃_g per category for the whole plan. LinUCB: θ̂_g (deterministic)."""
    if policy == "linucb":
        return {g: s.theta for g, s in states.items()}
    return {g: bandit.ts_sample(s, rng, sigma_sq) for g, s in states.items()}


def score_pairs(
    *,
    tasks: list[TaskSpec],
    rep_ticks: Mapping[str, Mapping[str, int]],  # task_id → bucket_id → k*
    buckets: Mapping[str, Bucket],
    cells: Mapping[tuple[str, str, str], Posterior],
    states: Mapping[str, bandit.LinearState],
    thetas: Mapping[str, np.ndarray],
    blend: Blend,
    policy: str,
    preceding_load_minutes: Callable[[int], float],
    alpha_ucb: float = ALPHA_UCB,
    sigma_sq: float = SIGMA_SQ_TS,
) -> dict[tuple[str, str], PairEstimate]:
    out: dict[tuple[str, str], PairEstimate] = {}
    for t in tasks:
        for bucket_id, k_star in rep_ticks.get(t.task_id, {}).items():
            b = buckets[bucket_id]
            post = cells[(t.category, b.daypart.value, b.day_type)]
            u = None if t.deadline_tick is None else t.deadline_tick - k_star
            x = feature_vector(
                bucket=b,
                value=t.value,
                est_minutes=t.est_minutes,
                splittable=t.splittable,
                u_ticks=u,
                postpone_count=t.postpone_count,
                cell_mean=post.mean,
                cell_sd=post.sd,
                preceding_load_minutes=preceding_load_minutes(k_star),
            )
            state = states[t.category]
            if policy == "linucb":
                linear = bandit.ucb_score(state, x, alpha_ucb)
            else:
                linear = float(x @ thetas[t.category])
            q = blend_estimate(post.mean, linear, blend)
            sd_lin = bandit.predictive_sd(state, x, sigma_sq)
            sd_q = math.sqrt((blend.w_energy * post.sd) ** 2 + (blend.w_bandit * sd_lin) ** 2)
            out[(t.task_id, bucket_id)] = PairEstimate(
                task_id=t.task_id,
                bucket=b,
                rep_tick=k_star,
                q_hat=q,
                linear=linear,
                cell_mean=post.mean,
                cell_sd=post.sd,
                sd_q=sd_q,
                features=x,
            )
    return out
