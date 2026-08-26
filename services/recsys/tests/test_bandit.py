"""LinUCB/TS state: Sherman–Morrison ≡ naive inverse, TS sampling shape, rebuild ≡ sequential,
and MABWiser as the CI oracle (File 03 §2.2)."""

from __future__ import annotations

import numpy as np
import pytest

from hourwell_recsys import bandit
from hourwell_recsys.params import ALPHA_UCB, FEATURE_DIM, SIGMA_SQ_TS


def _data(n: int = 40, seed: int = 3) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    xs = rng.random((n, FEATURE_DIM))
    xs[:, 0] = 1.0
    rs = rng.random(n)
    return xs, rs


def test_init_is_identity_and_zero() -> None:
    s = bandit.init_state("deep")
    assert np.array_equal(s.A, np.eye(17)) and np.array_equal(s.b, np.zeros(17))
    assert np.allclose(s.theta, 0.0)


def test_sherman_morrison_matches_naive_inverse() -> None:
    xs, rs = _data()
    s = bandit.init_state("deep")
    for x, r in zip(xs, rs, strict=True):
        s = bandit.update(s, x, r)
        assert np.allclose(s.A_inv, np.linalg.inv(s.A), atol=1e-9)
    assert np.allclose(s.theta, np.linalg.solve(s.A, s.b))


def test_rebuild_equals_sequential_updates() -> None:
    xs, rs = _data()
    seq = bandit.init_state("deep")
    for x, r in zip(xs, rs, strict=True):
        seq = bandit.update(seq, x, r)
    rebuilt = bandit.rebuild("deep", list(zip(xs, rs, strict=True)))
    assert np.allclose(seq.A, rebuilt.A) and np.allclose(seq.b, rebuilt.b)
    assert np.allclose(seq.A_inv, rebuilt.A_inv, atol=1e-9)


def test_ts_sampling_shape_mean_and_covariance() -> None:
    xs, rs = _data(n=25)
    s = bandit.rebuild("deep", list(zip(xs, rs, strict=True)))
    rng = np.random.default_rng(0)
    draws = np.stack([bandit.ts_sample(s, rng) for _ in range(20_000)])
    assert draws.shape == (20_000, 17)
    assert np.allclose(draws.mean(axis=0), s.theta, atol=0.02)
    assert np.allclose(np.cov(draws.T), SIGMA_SQ_TS * s.A_inv, atol=0.02)


def test_ucb_formula() -> None:
    xs, rs = _data(n=10)
    s = bandit.rebuild("deep", list(zip(xs, rs, strict=True)))
    x = xs[0]
    expected = float(x @ s.theta) + ALPHA_UCB * float(np.sqrt(x @ s.A_inv @ x))
    assert bandit.ucb_score(s, x) == pytest.approx(expected)


def test_round_trip_arrays() -> None:
    xs, rs = _data(n=5)
    s = bandit.rebuild("admin", list(zip(xs, rs, strict=True)), state_version=7)
    a, b = bandit.to_arrays(s)
    back = bandit.from_arrays("admin", a, b, 17, 7)
    assert np.allclose(back.A, s.A) and np.allclose(back.theta, s.theta) and back.state_version == 7


def test_mabwiser_linucb_oracle_matches_ucb_scores() -> None:
    from mabwiser.mab import MAB, LearningPolicy

    xs, rs = _data(n=60, seed=11)
    rng = np.random.default_rng(1)
    arms = ["deep", "admin"]
    decisions = [arms[i] for i in rng.integers(0, 2, size=len(xs))]
    mab = MAB(arms=arms, learning_policy=LearningPolicy.LinUCB(alpha=ALPHA_UCB, l2_lambda=1.0))
    mab.fit(decisions=decisions, rewards=list(rs), contexts=xs)
    ours = {
        g: bandit.rebuild(g, [(x, r) for x, r, d in zip(xs, rs, decisions, strict=True) if d == g])
        for g in arms
    }
    test_x = xs[:5]
    expectations = mab.predict_expectations(test_x)
    for x, exp in zip(test_x, expectations, strict=True):
        for g in arms:
            assert exp[g] == pytest.approx(bandit.ucb_score(ours[g], x), abs=1e-6)


def test_mabwiser_lints_oracle_matches_ts_moments() -> None:
    from mabwiser.mab import MAB, LearningPolicy

    xs, rs = _data(n=60, seed=12)
    decisions = ["deep"] * len(xs)
    alpha = float(np.sqrt(SIGMA_SQ_TS))
    mab = MAB(
        arms=["deep"], learning_policy=LearningPolicy.LinTS(alpha=alpha, l2_lambda=1.0), seed=5
    )
    mab.fit(decisions=decisions, rewards=list(rs), contexts=xs)
    ours = bandit.rebuild("deep", list(zip(xs, rs, strict=True)))
    x = xs[0]

    def one() -> float:
        e = mab.predict_expectations([x])
        return float((e[0] if isinstance(e, list) else e)["deep"])

    samples = np.array([one() for _ in range(3000)])
    assert samples.mean() == pytest.approx(float(x @ ours.theta), abs=0.03)
    assert samples.var() == pytest.approx(bandit.predictive_sd(ours, x) ** 2, rel=0.15)
