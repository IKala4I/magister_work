"""Estimator RECOVERY on synthetic ground truth (File 04 §2): with exact within-slice
propensities, replay/IPS/SNIPS/DR must land on the closed-form true policy value. This is
the acceptance test behind "one-command replay harness reproduces tables" — the same
generator seeds train.yml and the public dataset."""

from __future__ import annotations

import pytest

from hourwell_training import ope, synthetic

WORLD = synthetic.make_world(n_rows=4000, seed=42)
# 4000 rows; replay keeps ≈ 1/m̄ of them (m ∈ {2,3,4} ⇒ ≈ 1350 matches);
# SE ≈ sqrt(.25/1350) ≈ .014 — a ±.05 tolerance is > 3σ for every estimator below.
TOL = 0.05


def first_bucket(r: ope.SliceRow) -> str:
    return sorted(r.top_m)[0]


def first_bucket_prob(r: ope.SliceRow, b: str) -> float:
    return 1.0 if b == first_bucket(r) else 0.0


def tilted(r: ope.SliceRow, b: str) -> float:
    """A genuinely stochastic policy: 70% on the alphabetically first bucket, rest uniform."""
    rest = len(r.top_m) - 1
    return 0.7 if b == first_bucket(r) else 0.3 / rest


def test_replay_recovers_the_true_deterministic_value() -> None:
    truth = synthetic.true_value_deterministic(WORLD, first_bucket)
    est = ope.replay(WORLD.rows, first_bucket)
    assert est.is_evidence
    assert est.value == pytest.approx(truth, abs=TOL)


def test_ips_and_snips_recover_the_true_stochastic_value() -> None:
    truth = synthetic.true_value_stochastic(WORLD, tilted)
    for estimator in (ope.ips, ope.snips):
        est = estimator(WORLD.rows, tilted)
        assert est.is_evidence
        assert est.value == pytest.approx(truth, abs=TOL), estimator.__name__


def test_dr_recovers_truth_even_with_a_biased_reward_model() -> None:
    truth = synthetic.true_value_stochastic(WORLD, tilted)
    est = ope.doubly_robust(WORLD.rows, tilted, lambda r, b: 0.5)  # deliberately wrong r̂
    assert est.is_evidence
    assert est.value == pytest.approx(truth, abs=TOL)


def test_dr_with_the_true_model_is_tighter_than_ips() -> None:
    truth = synthetic.true_value_stochastic(WORLD, tilted)

    def r_hat(r: ope.SliceRow, b: str) -> float:
        return synthetic.q_true(b, str(r.context["chronotype"]))

    dr = ope.doubly_robust(WORLD.rows, tilted, r_hat)
    ips = ope.ips(WORLD.rows, tilted)
    assert abs(dr.value - truth) <= abs(ips.value - truth) + 1e-3


def test_the_world_is_deterministic_per_seed() -> None:
    again = synthetic.make_world(n_rows=50, seed=7)
    once_more = synthetic.make_world(n_rows=50, seed=7)
    assert again == once_more
    assert synthetic.make_world(n_rows=50, seed=8) != again
