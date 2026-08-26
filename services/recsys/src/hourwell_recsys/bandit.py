"""Stage 4 — per-category linear-Gaussian bandit: LinUCB / Thompson sampling (File 04 §1.4;
specs/07 §3.2.3).

State per (user, category): A = I_d + Σ x xᵀ, b = Σ r x, θ̂ = A⁻¹ b. Rank-1 updates maintain A⁻¹
by Sherman–Morrison; corrections rebuild from stored tuples (never a downdate, invariant 6).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np

from hourwell_recsys.params import ALPHA_UCB, FEATURE_DIM, SIGMA_SQ_TS


@dataclass(frozen=True)
class LinearState:
    category: str
    A: np.ndarray
    b: np.ndarray
    A_inv: np.ndarray
    state_version: int = 1

    @property
    def d(self) -> int:
        return int(self.b.shape[0])

    @property
    def theta(self) -> np.ndarray:
        return np.asarray(self.A_inv @ self.b)


def init_state(category: str, d: int = FEATURE_DIM, state_version: int = 1) -> LinearState:
    eye = np.eye(d, dtype=np.float64)
    return LinearState(
        category, A=eye.copy(), b=np.zeros(d), A_inv=eye.copy(), state_version=state_version
    )


def from_arrays(
    category: str, a_flat: Iterable[float], b_vec: Iterable[float], d: int, state_version: int
) -> LinearState:
    a = np.asarray(list(a_flat), dtype=np.float64).reshape(d, d)
    b = np.asarray(list(b_vec), dtype=np.float64)
    return LinearState(category, A=a, b=b, A_inv=np.linalg.inv(a), state_version=state_version)


def sherman_morrison(a_inv: np.ndarray, x: np.ndarray) -> np.ndarray:
    """(A + x xᵀ)⁻¹ = A⁻¹ − (A⁻¹ x xᵀ A⁻¹) / (1 + xᵀ A⁻¹ x)."""
    ax = a_inv @ x
    return a_inv - np.outer(ax, ax) / (1.0 + float(x @ ax))


def update(state: LinearState, x: np.ndarray, reward: float) -> LinearState:
    x = np.asarray(x, dtype=np.float64)
    if x.shape != (state.d,):
        raise ValueError(f"feature dimension {x.shape} ≠ {state.d}")
    return LinearState(
        state.category,
        A=state.A + np.outer(x, x),
        b=state.b + reward * x,
        A_inv=sherman_morrison(state.A_inv, x),
        state_version=state.state_version,
    )


def rebuild(
    category: str,
    tuples: Iterable[tuple[np.ndarray, float]],
    d: int = FEATURE_DIM,
    state_version: int = 1,
) -> LinearState:
    """A = I + Σ x xᵀ, b = Σ r x from stored (x, r) — the §3.5.5 full rebuild."""
    a = np.eye(d, dtype=np.float64)
    b = np.zeros(d, dtype=np.float64)
    for x, r in tuples:
        xv = np.asarray(x, dtype=np.float64)
        a += np.outer(xv, xv)
        b += r * xv
    return LinearState(category, A=a, b=b, A_inv=np.linalg.inv(a), state_version=state_version)


def ts_sample(
    state: LinearState, rng: np.random.Generator, sigma_sq: float = SIGMA_SQ_TS
) -> np.ndarray:
    """One draw θ̃ ~ N(θ̂, σ² A⁻¹) — File 04 §1.4 ("sample once")."""
    cov = sigma_sq * 0.5 * (state.A_inv + state.A_inv.T)
    chol = np.linalg.cholesky(cov)
    return state.theta + chol @ rng.standard_normal(state.d)


def predictive_sd(state: LinearState, x: np.ndarray, sigma_sq: float = SIGMA_SQ_TS) -> float:
    return float(np.sqrt(sigma_sq * max(float(x @ state.A_inv @ x), 0.0)))


def ucb_score(state: LinearState, x: np.ndarray, alpha: float = ALPHA_UCB) -> float:
    """xᵀθ̂ + α √(xᵀ A⁻¹ x) — the deterministic LinUCB arm (File 04 §1.4)."""
    width = float(np.sqrt(max(float(x @ state.A_inv @ x), 0.0)))
    return float(x @ state.theta) + alpha * width


def to_arrays(state: LinearState) -> tuple[list[float], list[float]]:
    return state.A.reshape(-1).tolist(), state.b.tolist()
