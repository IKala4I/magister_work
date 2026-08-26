"""ε-slice: the logged propensity is EXACTLY ε/m, the draws are uniform, eligibility is as
specified, and nothing outside the slice ever carries a propensity."""

from __future__ import annotations

import numpy as np
import pytest
from scipy.stats import chisquare

from hourwell_recsys.exploration import (
    ExperimentCandidate,
    draw_experiment,
    eligible_tasks,
    propensity,
    top_m_buckets,
)
from hourwell_recsys.params import EPSILON, TOP_M

BUCKETS = ["MO.wd.fresh", "AF.wd.fresh", "MD.wd", "EV.wd", "EM.wd"]


def _cand(tid: str, **kw) -> ExperimentCandidate:  # type: ignore[no-untyped-def]
    base = dict(
        task_id=tid, duration=4, critical=False, pinned=False, feasible_bucket_ids=tuple(BUCKETS)
    )
    base.update(kw)
    return ExperimentCandidate(**base)  # type: ignore[arg-type]


def test_propensity_is_epsilon_over_m_exactly() -> None:
    assert propensity(EPSILON, TOP_M) == 0.25
    assert propensity(1.0, 4) == 1.0 / 4
    assert propensity(0.5, 4) == 0.125
    with pytest.raises(ValueError):
        propensity(1.5, 4)


def test_eligibility_rules() -> None:
    cands = [
        _cand("ok"),
        _cand("crit", critical=True),
        _cand("pin", pinned=True),
        _cand("long", duration=9),  # > 2 h (8 ticks)
        _cand("few", feasible_bucket_ids=("MO.wd.fresh", "AF.wd.fresh", "MD.wd")),  # < m buckets
        _cand("edge", duration=8),
    ]
    assert eligible_tasks(cands) == ["edge", "ok"]


def test_top_m_is_deterministic_with_id_tie_break() -> None:
    ranking = [("b", 0.5), ("a", 0.5), ("c", 0.9), ("d", 0.1), ("e", 0.5)]
    assert top_m_buckets(ranking, 4) == ("c", "a", "b", "e")


def test_draw_is_uniform_over_tasks_and_over_top_m_buckets() -> None:
    rng = np.random.default_rng(2026)
    eligible = ["t1", "t2", "t3"]
    rankings = {t: [(b, 0.9 - i * 0.1) for i, b in enumerate(BUCKETS)] for t in eligible}
    n = 6000
    task_counts = {t: 0 for t in eligible}
    bucket_counts = {b: 0 for b in BUCKETS[:4]}
    for _ in range(n):
        d = draw_experiment(rng, eligible=eligible, rankings=rankings)
        assert d is not None
        assert d.propensity == 0.25
        assert d.top_m == tuple(BUCKETS[:4])
        assert d.bucket_id in d.top_m
        task_counts[d.task_id] += 1
        bucket_counts[d.bucket_id] += 1
    assert chisquare(list(task_counts.values())).pvalue > 0.001
    assert chisquare(list(bucket_counts.values())).pvalue > 0.001
    assert BUCKETS[4] not in bucket_counts  # the 5th bucket is never drawn


def test_epsilon_zero_never_draws_and_no_eligible_never_draws() -> None:
    rng = np.random.default_rng(1)
    rankings = {"t": [(b, 0.5) for b in BUCKETS]}
    assert all(
        draw_experiment(rng, eligible=["t"], rankings=rankings, epsilon=0.0) is None
        for _ in range(200)
    )
    assert draw_experiment(rng, eligible=[], rankings={}) is None


def test_bernoulli_epsilon_rate() -> None:
    rng = np.random.default_rng(9)
    rankings = {"t": [(b, 0.5) for b in BUCKETS]}
    hits = sum(
        draw_experiment(rng, eligible=["t"], rankings=rankings, epsilon=0.3) is not None
        for _ in range(5000)
    )
    assert 0.27 < hits / 5000 < 0.33
    d = next(
        x
        for x in (
            draw_experiment(rng, eligible=["t"], rankings=rankings, epsilon=0.3) for _ in range(100)
        )
        if x
    )
    assert d.propensity == 0.3 / 4


def test_fewer_than_m_ranked_buckets_is_a_hard_error() -> None:
    rng = np.random.default_rng(1)
    with pytest.raises(ValueError):
        draw_experiment(rng, eligible=["t"], rankings={"t": [("MO.wd.fresh", 0.5)]})
