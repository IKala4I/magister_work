"""ALS + fold-in + clusters vs the library and hand-computed cases (File 04 §3.4)."""

from __future__ import annotations

import numpy as np
import pytest

from hourwell_training import als, clusters


def obs(cat: str, dp: str, dt: str, succ: float, fail: float) -> als.CellObs:
    return als.CellObs(category=cat, daypart=dp, day_type=dt, succ=succ, fail=fail)


def synthetic_users(n: int = 24, seed: int = 7) -> dict[str, list[als.CellObs]]:
    """Two planted behavioural types: morning-completers and evening-completers."""
    rng = np.random.default_rng(seed)
    users: dict[str, list[als.CellObs]] = {}
    for i in range(n):
        morning = i % 2 == 0
        cells = []
        for dp in als.DAYPARTS:
            good = dp in (("EM", "MO") if morning else ("EV", "NT"))
            for cat in ("deep", "admin"):
                s = float(rng.integers(8, 15)) if good else float(rng.integers(0, 3))
                f = float(rng.integers(0, 3)) if good else float(rng.integers(8, 15))
                cells.append(obs(cat, dp, "weekday", s, f))
        users[f"u{i:02d}"] = cells
    return users


def test_item_index_is_the_canonical_48() -> None:
    assert len(als.ITEM_INDEX) == 48
    assert als.ITEM_INDEX[("deep", "EM", "weekday")] == 0
    assert als.ITEM_INDEX[("learning", "NT", "weekend")] == 47


def test_confidence_matrix_carries_only_completing_cells() -> None:
    users = {"u": [obs("deep", "MO", "weekday", 9, 1), obs("deep", "EV", "weekday", 1, 9)]}
    ids, mat = als.confidence_matrix(users, alpha=40.0)
    assert ids == ("u",)
    dense = mat.toarray()
    # rate .9 cell: c = 1 + 40*10 = 401 at its item column; rate .1 cell: no entry
    assert dense[0, als.ITEM_INDEX[("deep", "MO", "weekday")]] == pytest.approx(401.0)
    assert dense[0, als.ITEM_INDEX[("deep", "EV", "weekday")]] == 0.0
    assert (dense > 0).sum() == 1


def test_fold_in_lands_on_the_library_user_factors() -> None:
    """Same convention ⇒ same normal equations: folding a TRAINING user back in lands on the
    library's own factors. Not exact by construction — implicit's user factors are one
    half-step stale (Y updates after users) and its CPU solver is conjugate-gradient — so
    the bound is 2%; a convention slip (e.g. c vs c−1, or a missing baseline) blows past it,
    while the k=1 hand case below pins the closed form exactly."""
    users = synthetic_users()
    model = als.fit_als(users, iterations=60, seed=3)
    uid = model.user_ids[0]
    x = als.fold_in(model, users[uid], min_outcomes=1)
    assert x is not None
    lib = model.user_factors[0]
    assert np.linalg.norm(x - lib) / (np.linalg.norm(lib) + 1e-12) < 0.02


def test_fold_in_gate_returns_none_below_30_outcomes() -> None:
    users = synthetic_users()
    model = als.fit_als(users, seed=3)
    thin = [obs("deep", "MO", "weekday", 5, 4)]  # 9 < 30
    assert als.fold_in(model, thin) is None
    thick = [obs("deep", "MO", "weekday", 20, 10)]  # exactly 30
    assert als.fold_in(model, thick) is not None


def test_fold_in_hand_case_one_factor() -> None:
    """k=1 closed form by hand: Y = [[2],[1],[0]...], one positive cell on item 0 with
    c = 1 + α·e ⇒ x = c·y0 / (YᵀY + (c−1)·y0² + λ)."""
    y = np.zeros((48, 1))
    y[0, 0] = 2.0
    y[1, 0] = 1.0
    model = als.AlsModel(
        user_ids=("u",), user_factors=np.zeros((1, 1)), item_factors=y, alpha=1.0, reg=0.5
    )
    cells = [obs("deep", "EM", "weekday", 30, 0)]  # item 0, e = 30, c = 31, rate 1
    x = als.fold_in(model, cells)
    assert x is not None
    # a = YᵀY + λ + (c−1)·y0² = (4+1) + 0.5 + 30·4 = 125.5 ; b = c·y0 = 62 ⇒ x = 62/125.5
    assert x[0] == pytest.approx(62.0 / 125.5)


def test_clusters_recover_the_two_planted_types() -> None:
    users = synthetic_users()
    model = als.fit_als(users, iterations=30, seed=3)
    clu = clusters.fit_clusters(model.user_factors, k_range=(2, 5), seed=0)
    assert clu is not None
    even = {clu.labels[i] for i in range(0, 24, 2)}
    odd = {clu.labels[i] for i in range(1, 24, 2)}
    if clu.k == 2:
        assert even.isdisjoint(odd), "the planted morning/evening split must separate"
    assert clu.silhouette > 0.3


def test_nearest_centroid_assigns_a_folded_in_user() -> None:
    users = synthetic_users()
    model = als.fit_als(users, iterations=30, seed=3)
    clu = clusters.fit_clusters(model.user_factors, k_range=(2, 4), seed=0)
    assert clu is not None
    x = als.fold_in(model, users[model.user_ids[4]], min_outcomes=1)
    assert x is not None
    assert clusters.nearest_centroid(clu, x) == clu.labels[4]


def test_tiny_cohort_yields_no_clustering() -> None:
    assert clusters.fit_clusters(np.zeros((2, 3)), k_range=(3, 8)) is None
