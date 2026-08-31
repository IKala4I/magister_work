"""EB refresh vs hand-computed moments (File 04 §3.5) and the gate's promote/refuse pair."""

from __future__ import annotations

import pytest

from hourwell_training import priors
from hourwell_training.params import EB_N0_MAX, EB_N0_MIN

KEY: priors.CellKey = ("INT", "deep", "MO", "weekday")
OTHER: priors.CellKey = ("INT", "deep", "EV", "weekday")


def test_moments_hand_case() -> None:
    # rates m = 0.6, s² = 0.02 ⇒ ν = 0.24/0.02 − 1 = 11 ⇒ α = 6.6, β = 4.4
    # devs (0, ±0.1, ±0.1732051): Σdev² = 0.08, s² = 0.08/4 = 0.02
    rates = [0.6, 0.7, 0.5, 0.7732051, 0.4267949]
    cell = priors.fit_cell(rates)
    assert cell is not None
    assert cell.mu0 == pytest.approx(0.6, abs=1e-8)
    assert cell.n0 == pytest.approx(11.0, rel=1e-6)


def test_fewer_than_five_users_refuses() -> None:
    assert priors.fit_cell([0.5, 0.6, 0.7, 0.8]) is None


def test_tiny_variance_hits_the_strength_ceiling() -> None:
    cell = priors.fit_cell([0.6] * 10)  # s² → floor ⇒ ν huge ⇒ clamped
    assert cell is not None
    assert cell.n0 == EB_N0_MAX


def test_huge_variance_hits_the_strength_floor() -> None:
    cell = priors.fit_cell([0.01, 0.99] * 5)  # s² ≈ .27 near m(1−m) ⇒ ν → 0 ⇒ clamped up
    assert cell is not None
    assert cell.n0 == EB_N0_MIN


def test_refresh_carries_over_unfittable_cells() -> None:
    prev = {KEY: priors.PriorCell(0.66, 8.0), OTHER: priors.PriorCell(0.58, 8.0)}
    new, metrics = priors.refresh({KEY: [0.5, 0.55, 0.6, 0.65, 0.7]}, prev)
    assert new[OTHER] == prev[OTHER]  # untouched: no data
    assert new[KEY].mu0 == pytest.approx(0.6)
    assert metrics["cells_refit"] == 1.0 and metrics["cells_total"] == 2.0


def test_gate_promotes_a_better_fit_and_refuses_a_worse_one() -> None:
    holdout = {KEY: [0.7, 0.72, 0.68]}
    good = {KEY: priors.PriorCell(0.7, 8.0)}
    bad = {KEY: priors.PriorCell(0.2, 8.0)}
    promoted, metrics = priors.eval_gate(good, bad, holdout)
    assert promoted and metrics["candidate_logloss"] < metrics["incumbent_logloss"]
    refused, _ = priors.eval_gate(bad, good, holdout)
    assert not refused


def test_gate_without_holdout_raises() -> None:
    with pytest.raises(ValueError, match="cannot run"):
        priors.eval_gate({}, {}, {})
