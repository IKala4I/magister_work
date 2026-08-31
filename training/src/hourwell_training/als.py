"""ALS collaborative priors — File 04 §3.4, on decayed cell aggregates (ADR-0015 §3).

Items are the 48 cells (category × daypart × day-type). One convention everywhere, the
library's own (Hu et al. 2008 as `implicit` implements it): preference p_ui = 1 for cells with
completion rate ≥ 0.5, confidence c_ui = 1 + α_conf · (S+F) carried only on those cells;
everything else sits at the baseline weight 1 through the YᵀY term. The fold-in
(File 04 §3.4's closed form) uses the same convention, so it reproduces the library's own
user factors exactly — pinned by tests/test_als.py against a real fit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
import scipy.sparse as sp
from implicit.als import AlternatingLeastSquares

from hourwell_training.params import (
    ALS_CONFIDENCE_ALPHA,
    ALS_FACTORS,
    ALS_REG_LAMBDA,
    FOLD_IN_MIN_OUTCOMES,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray

__all__ = ["CATEGORIES", "DAYPARTS", "DAY_TYPES", "ITEM_INDEX", "AlsModel", "fit_als", "fold_in"]

CATEGORIES = ("deep", "admin", "physical", "learning")
DAYPARTS = ("EM", "MO", "MD", "AF", "EV", "NT")
DAY_TYPES = ("weekday", "weekend")

#: (category, daypart, day_type) → column index; the one item order every artifact uses.
ITEM_INDEX: dict[tuple[str, str, str], int] = {
    (c, d, t): i
    for i, (c, d, t) in enumerate(
        (c, d, t) for c in CATEGORIES for d in DAYPARTS for t in DAY_TYPES
    )
}
N_ITEMS = len(ITEM_INDEX)  # 48


@dataclass(frozen=True)
class CellObs:
    """One user's decayed evidence in one cell."""

    category: str
    daypart: str
    day_type: str
    succ: float
    fail: float

    @property
    def evidence(self) -> float:
        return self.succ + self.fail

    @property
    def rate(self) -> float:
        return self.succ / self.evidence if self.evidence > 0 else 0.0


@dataclass(frozen=True)
class AlsModel:
    user_ids: tuple[str, ...]
    user_factors: NDArray[np.float64]  # (n_users, k)
    item_factors: NDArray[np.float64]  # (48, k)
    alpha: float
    reg: float


def confidence_matrix(
    users: dict[str, list[CellObs]], alpha: float = ALS_CONFIDENCE_ALPHA
) -> tuple[tuple[str, ...], sp.csr_matrix]:
    """users → the sparse confidence matrix in the library's convention: stored entries are
    the FULL c_ui = 1 + α·(S+F) on p=1 cells (implicit treats a stored value as the whole
    confidence; absent cells sit at the baseline 1 through the YᵀY term)."""
    user_ids = tuple(sorted(users))
    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    for u, uid in enumerate(user_ids):
        for obs in users[uid]:
            if obs.evidence > 0 and obs.rate >= 0.5:
                rows.append(u)
                cols.append(ITEM_INDEX[(obs.category, obs.daypart, obs.day_type)])
                vals.append(1.0 + alpha * obs.evidence)
    mat = sp.csr_matrix(
        (np.asarray(vals), (np.asarray(rows), np.asarray(cols))),
        shape=(len(user_ids), N_ITEMS),
        dtype=np.float64,
    )
    return user_ids, mat


def fit_als(
    users: dict[str, list[CellObs]],
    *,
    factors: int = ALS_FACTORS,
    reg: float = ALS_REG_LAMBDA,
    alpha: float = ALS_CONFIDENCE_ALPHA,
    iterations: int = 20,
    seed: int = 0,
) -> AlsModel:
    user_ids, mat = confidence_matrix(users, alpha)
    model = AlternatingLeastSquares(
        factors=factors,
        regularization=reg,
        iterations=iterations,
        random_state=seed,
        use_gpu=False,
        calculate_training_loss=False,
    )
    model.fit(mat, show_progress=False)
    return AlsModel(
        user_ids=user_ids,
        user_factors=np.asarray(model.user_factors, dtype=np.float64),
        item_factors=np.asarray(model.item_factors, dtype=np.float64),
        alpha=alpha,
        reg=reg,
    )


def fold_in(
    model: AlsModel, cells: list[CellObs], *, min_outcomes: int = FOLD_IN_MIN_OUTCOMES
) -> NDArray[np.float64] | None:
    """File 04 §3.4: x_u = (YᵀC_uY + λI)⁻¹ YᵀC_u p_u with fixed Y; None below the gate.

    The gate counts ATTRIBUTED OUTCOMES (the caller passes that count via the cells'
    evidence sum — decayed, so a long-idle user can fall back under it, which is the
    conservative reading of "≥ 30 attributed outcomes").
    """
    if sum(c.evidence for c in cells) < min_outcomes:
        return None
    y = model.item_factors  # (48, k)
    k = y.shape[1]
    # C_u − I carried sparsely: baseline YᵀY + weighted terms on the p=1 cells
    yty = y.T @ y
    a = yty + model.reg * np.eye(k)
    b = np.zeros(k, dtype=np.float64)
    for obs in cells:
        if obs.evidence > 0 and obs.rate >= 0.5:
            yi = y[ITEM_INDEX[(obs.category, obs.daypart, obs.day_type)]]
            c_ui = 1.0 + model.alpha * obs.evidence
            a += (c_ui - 1.0) * np.outer(yi, yi)
            b += c_ui * yi
    x: NDArray[np.float64] = np.linalg.solve(a, b)
    return x
