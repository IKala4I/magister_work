"""MC propensity backfill (File 04 §2.3, K = 32): dominance, smoothing bounds, determinism."""

from __future__ import annotations

import numpy as np
import pytest
from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend
from hourwell_recsys.params import FEATURE_DIM

from hourwell_training import propensity
from hourwell_training.params import MC_PROPENSITY_K


def row(bucket: str = "MO.wd.fresh") -> propensity.McRow:
    x = [0.0] * FEATURE_DIM
    x[0] = 1.0
    return propensity.McRow(
        recommendation_id="r1", category="deep", bucket_id=bucket, features=tuple(x)
    )


def tight_state() -> bandit.LinearState:
    """A near-deterministic posterior (large A ⇒ tiny sampling noise)."""
    a = (np.eye(FEATURE_DIM) * 1e6).reshape(-1).tolist()
    return bandit.from_arrays("deep", a, [0.0] * FEATURE_DIM, FEATURE_DIM, 1)


def test_dominant_cell_mean_wins_almost_every_sample() -> None:
    # pure-energy blend: the bucket with the highest cell mean must win every draw
    cells = {b: propensity.CellPosterior(0.2, 0.1) for b in (
        "EM.wd", "MO.wd.fresh", "MO.wd.fatigued", "MD.wd",
        "AF.wd.fresh", "AF.wd.fatigued", "EV.wd", "NT.wd",
    )}
    cells["MO.wd.fresh"] = propensity.CellPosterior(0.9, 0.05)
    p = propensity.mc_propensity(
        row(), tight_state(), Blend(1.0, 0.0), cells, seed=1
    )
    # wins = 32 of 32 ⇒ (32+1)/(32+8) = 0.825
    assert p == pytest.approx((MC_PROPENSITY_K + 1) / (MC_PROPENSITY_K + 8))


def test_never_won_bucket_keeps_a_positive_propensity() -> None:
    cells = {b: propensity.CellPosterior(0.9, 0.05) for b in (
        "EM.wd", "MO.wd.fresh", "MO.wd.fatigued", "MD.wd",
        "AF.wd.fresh", "AF.wd.fatigued", "EV.wd", "NT.wd",
    )}
    cells["NT.wd"] = propensity.CellPosterior(0.95, 0.05)
    p = propensity.mc_propensity(row(), tight_state(), Blend(1.0, 0.0), cells, seed=1)
    assert p == pytest.approx(1.0 / (MC_PROPENSITY_K + 8))  # 0 wins, Laplace floor


def test_same_seed_same_answer_different_seed_may_differ() -> None:
    state = bandit.init_state("deep", FEATURE_DIM)
    cells = {"MO.wd.fresh": propensity.CellPosterior(0.6, 0.2)}
    a = propensity.mc_propensity(row(), state, Blend(0.7, 0.3), cells, seed=5)
    b = propensity.mc_propensity(row(), state, Blend(0.7, 0.3), cells, seed=5)
    assert a == b


def test_weekend_rows_use_the_weekend_candidate_set() -> None:
    cells = {b: propensity.CellPosterior(0.5, 0.2) for b in (
        "EM.we", "MO.we", "MD.we", "AF.we", "EV.we", "NT.we",
    )}
    p = propensity.mc_propensity(
        row("MO.we"), tight_state(), Blend(1.0, 0.0), cells, seed=2
    )
    # all-equal means: argmax = alphabetically first (AF.we); MO.we never wins
    assert p == pytest.approx(1.0 / (MC_PROPENSITY_K + 6))


def test_unknown_bucket_raises() -> None:
    with pytest.raises(ValueError, match="not in vocabulary"):
        propensity.mc_propensity(row("XX.wd"), tight_state(), Blend(1.0, 0.0), {}, seed=0)
