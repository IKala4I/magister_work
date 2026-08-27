"""Blend weights (specs/07 §3.2.6; ADR-0010): projected SGD on the 1-simplex — step math against
River as the CI oracle (unprojected), exact projection, convexity invariant, ablation w_B = 1."""

from __future__ import annotations

import pytest

from hourwell_recsys.blend import (
    Blend,
    blend_estimate,
    project_simplex2,
    sgd_step,
    unprojected_step,
)
from hourwell_recsys.params import BLEND_INIT_W_BANDIT, BLEND_INIT_W_ENERGY, BLEND_SGD_LR


def test_init_matches_appendix_a() -> None:
    b = Blend()
    assert (b.w_energy, b.w_bandit) == (BLEND_INIT_W_ENERGY, BLEND_INIT_W_BANDIT) == (0.7, 0.3)
    assert BLEND_SGD_LR == 0.05


def test_step_moves_toward_the_reward() -> None:
    b = Blend()
    # cell says 0.9, bandit says 0.2, the block succeeded → energy weight grows
    up = sgd_step(b, cell_mean=0.9, linear=0.2, reward=1.0)
    assert up.w_energy > b.w_energy and up.w_bandit < b.w_bandit
    # …and the block failed → energy weight shrinks
    down = sgd_step(b, cell_mean=0.9, linear=0.2, reward=0.0)
    assert down.w_energy < b.w_energy
    for s in (up, down):
        assert s.w_energy + s.w_bandit == pytest.approx(1.0)
        assert s.w_energy >= 0 and s.w_bandit >= 0


def test_unprojected_step_equals_river_at_half_lr() -> None:
    """River's Squared loss gradient is 2(pred − r); ours is (pred − r) on ½(pred − r)². Same
    step at lr_river = lr / 2 — pinned here so the citation ("River online blend weights",
    File 03 §2.2) stays an exact statement about the arithmetic."""
    from river import linear_model, optim

    cases = [(0.5, 0.8, 1.0), (0.3, -0.2, 0.0), (0.9, 1.4, 0.4)]
    for mu, lin, r in cases:
        model = linear_model.LinearRegression(
            optimizer=optim.SGD(BLEND_SGD_LR / 2), intercept_lr=0, l2=0
        )
        model.learn_one({"e": mu, "b": lin}, r)  # from zero weights
        ours = unprojected_step(0.0, 0.0, mu, lin, r)
        assert model.weights["e"] == pytest.approx(ours[0], abs=1e-12)
        assert model.weights["b"] == pytest.approx(ours[1], abs=1e-12)
    # and a second step from non-zero weights
    model = linear_model.LinearRegression(
        optimizer=optim.SGD(BLEND_SGD_LR / 2), intercept_lr=0, l2=0
    )
    w = (0.0, 0.0)
    for mu, lin, r in cases:
        model.learn_one({"e": mu, "b": lin}, r)
        w = unprojected_step(w[0], w[1], mu, lin, r)
    assert (model.weights["e"], model.weights["b"]) == pytest.approx(w, abs=1e-12)


def test_projection_is_the_euclidean_projection_onto_the_segment() -> None:
    assert project_simplex2(0.7, 0.3) == pytest.approx((0.7, 0.3))  # already on the simplex
    assert project_simplex2(0.8, 0.4) == pytest.approx((0.7, 0.3))  # off the line → nearest point
    assert project_simplex2(1.3, -0.1) == (1.0, 0.0)  # clipped at the vertex
    assert project_simplex2(-0.4, 0.9) == (0.0, 1.0)
    # brute-force check: nearest point on the segment for random-ish inputs
    import itertools

    for we, wb in itertools.product([-0.5, 0.1, 0.6, 1.2], [-0.3, 0.2, 0.9, 1.5]):
        pe, pb = project_simplex2(we, wb)
        best = min(
            ((we - t) ** 2 + (wb - (1 - t)) ** 2, t) for t in [i / 1000 for i in range(1001)]
        )[1]
        assert pe == pytest.approx(best, abs=1e-3)
        assert pe + pb == pytest.approx(1.0)


def test_ablation_pure_linear_is_reachable_and_stays_convex() -> None:
    b = Blend(0.0, 1.0)
    assert blend_estimate(0.9, 0.2, b) == pytest.approx(0.2)
    with pytest.raises(ValueError):
        Blend(0.5, 0.6)
    with pytest.raises(ValueError):
        sgd_step(Blend(), 0.5, 0.5, 1.5)
