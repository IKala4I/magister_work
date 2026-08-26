"""Beta cells: 28-day half-life on evidence only (specs/07 §3.2.1; File 05 §1)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from hourwell_recsys.energy import BetaCell, apply_reward, decay_factor, posterior

T0 = datetime(2026, 9, 1, 12, tzinfo=UTC)


def test_half_life_exact() -> None:
    assert decay_factor(28 * 86_400) == pytest.approx(0.5)
    assert decay_factor(56 * 86_400) == pytest.approx(0.25)
    assert decay_factor(0) == 1.0
    assert decay_factor(-5) == 1.0  # clamped: out-of-order delivery never inflates evidence


def test_prior_is_not_decayed_only_evidence_is() -> None:
    cell = BetaCell(
        "deep", "MO", "weekday", alpha0=5.6, beta0=2.4, succ=4.0, fail=2.0, last_event_at=T0
    )
    p = posterior(cell, T0 + timedelta(days=28))
    assert p.alpha == pytest.approx(5.6 + 2.0)
    assert p.beta == pytest.approx(2.4 + 1.0)
    assert p.n_effective == pytest.approx(3.0)
    assert p.mean == pytest.approx(7.6 / 11.0)


def test_apply_reward_decays_first_then_fractional_increment() -> None:
    cell = BetaCell(
        "deep", "MO", "weekday", alpha0=4, beta0=4, succ=2.0, fail=2.0, last_event_at=T0
    )
    later = T0 + timedelta(days=28)
    updated = apply_reward(cell, 0.4, later)
    assert updated.succ == pytest.approx(1.0 + 0.4)
    assert updated.fail == pytest.approx(1.0 + 0.6)
    assert updated.last_event_at == later
    lapsed = apply_reward(cell, 0.0, T0)
    assert lapsed.fail == pytest.approx(3.0) and lapsed.succ == pytest.approx(2.0)


def test_posterior_ci_and_sd() -> None:
    p = posterior(BetaCell("deep", "MO", "weekday", alpha0=2, beta0=2), T0)
    lo, hi = p.ci(0.1, 0.9)
    assert 0 < lo < 0.5 < hi < 1
    assert p.sd == pytest.approx((2 * 2 / (16 * 5)) ** 0.5)
