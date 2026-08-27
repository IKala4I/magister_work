"""Beta cells: 28-day half-life on evidence only (specs/07 §3.2.1; File 05 §1)."""

from __future__ import annotations

from dataclasses import replace
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


def test_out_of_order_older_tuple_equals_in_order_delivery() -> None:
    cell = BetaCell("deep", "MO", "weekday", alpha0=4, beta0=4)
    later, earlier = T0 + timedelta(days=28), T0
    in_order = apply_reward(apply_reward(cell, 1.0, earlier), 1.0, later)
    out_of_order = apply_reward(apply_reward(cell, 1.0, later), 1.0, earlier)
    assert out_of_order.succ == pytest.approx(in_order.succ) == pytest.approx(1.5)
    assert out_of_order.last_event_at == later


# --- P7: rung-2 thresholds (specs/07 §3.6; ADR-0010) ------------------------------------------


def test_rung2_cell_is_personal_once_decayed_evidence_exceeds_prior_strength() -> None:
    from hourwell_recsys.energy import BetaCell, is_active, is_personal, learning_mode

    now = datetime(2026, 9, 2, 12, tzinfo=UTC)
    prior = BetaCell("deep", "AF", "weekday", alpha0=4.0, beta0=4.0)  # n0 = 8
    assert not is_active(prior) and not is_personal(prior, now)
    weak = replace(prior, succ=5.0, fail=3.0, last_event_at=now)  # S+F = 8, not > 8
    assert is_active(weak) and not is_personal(weak, now)
    strong = replace(prior, succ=6.0, fail=3.0, last_event_at=now)  # 9 > 8
    assert is_personal(strong, now)
    # decay relaxes a personal cell back toward the prior (56 d = two half-lives → 9/4 < 8)
    assert not is_personal(strong, now + timedelta(days=56))
    # learning mode: no active cells → still learning; 1 of 2 active personal → 50 % → badge off
    assert learning_mode([prior, prior], now)
    assert learning_mode([weak, strong, prior], now) is False  # 1/2 active personal ≥ 0.5
    assert learning_mode([weak, weak, strong], now) is True  # 1/3 < 0.5
