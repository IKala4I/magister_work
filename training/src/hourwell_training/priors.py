"""Empirical-Bayes prior refresh + the eval gate (File 04 §3.5; ADR-0015 §6–§7).

Method of moments per (chronotype class, cell) over MATURE user cell rates (a cell counts
once its decayed evidence exceeds its own prior strength — the rung-2 "personal" threshold).
Guards keep the fit a bootstrap: ≥ EB_MIN_USERS contributors else the previous version's
values carry over unchanged; s² clamped so α̂₀, β̂₀ stay positive/finite; fitted strength
clamped to [EB_N0_MIN, EB_N0_MAX] preserving the mean. The gate promotes a refresh only if
its held-out log-loss is no worse than the incumbent's.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from hourwell_training.params import (
    EB_MIN_USERS,
    EB_N0_MAX,
    EB_N0_MIN,
    EB_VAR_CEIL_FACTOR,
    EB_VAR_FLOOR,
)

__all__ = ["CellKey", "PriorCell", "eval_gate", "fit_cell", "log_loss", "refresh"]

#: (chronotype_class, category, daypart, day_type)
CellKey = tuple[str, str, str, str]


@dataclass(frozen=True)
class PriorCell:
    mu0: float
    n0: float


def fit_cell(rates: list[float]) -> PriorCell | None:
    """Moments fit m, s² → (α₀, β₀) reported as (μ₀, n₀); None when the guards refuse."""
    if len(rates) < EB_MIN_USERS:
        return None
    m = sum(rates) / len(rates)
    m = min(max(m, 1e-3), 1.0 - 1e-3)
    s2 = sum((r - m) ** 2 for r in rates) / (len(rates) - 1)
    s2 = min(max(s2, EB_VAR_FLOOR), EB_VAR_CEIL_FACTOR * m * (1.0 - m))
    nu = m * (1.0 - m) / s2 - 1.0  # = α₀ + β₀ before clamping
    n0 = min(max(nu, EB_N0_MIN), EB_N0_MAX)
    return PriorCell(mu0=m, n0=n0)


def refresh(
    mature_rates: dict[CellKey, list[float]],
    previous: dict[CellKey, PriorCell],
) -> tuple[dict[CellKey, PriorCell], dict[str, float]]:
    """Full next-version table: refit where the guards allow, carry over everywhere else
    (the table stays complete — instantiate_user_priors joins on one version)."""
    out: dict[CellKey, PriorCell] = {}
    refit = 0
    shift = 0.0
    for key, prev in previous.items():
        fitted = fit_cell(mature_rates.get(key, []))
        if fitted is None:
            out[key] = prev
        else:
            out[key] = fitted
            refit += 1
            shift += abs(fitted.mu0 - prev.mu0)
    metrics = {
        "cells_total": float(len(previous)),
        "cells_refit": float(refit),
        "mean_abs_mu_shift": (shift / refit) if refit else 0.0,
    }
    return out, metrics


def log_loss(cells: dict[CellKey, PriorCell], holdout: dict[CellKey, list[float]]) -> float:
    """Mean Bernoulli log-loss of the prior mean against held-out user cell rates."""
    total = 0.0
    n = 0
    for key, rates in holdout.items():
        cell = cells.get(key)
        if cell is None:
            continue
        mu = min(max(cell.mu0, 1e-6), 1.0 - 1e-6)
        for r in rates:
            total += -(r * math.log(mu) + (1.0 - r) * math.log(1.0 - mu))
            n += 1
    if n == 0:
        raise ValueError("no held-out observations — the gate cannot run")
    return total / n


def eval_gate(
    candidate: dict[CellKey, PriorCell],
    incumbent: dict[CellKey, PriorCell],
    holdout: dict[CellKey, list[float]],
    *,
    tolerance: float = 1e-9,
) -> tuple[bool, dict[str, float]]:
    """Promote iff candidate held-out log-loss ≤ incumbent's (ADR-0015 §7)."""
    cand = log_loss(candidate, holdout)
    inc = log_loss(incumbent, holdout)
    return cand <= inc + tolerance, {"candidate_logloss": cand, "incumbent_logloss": inc}
