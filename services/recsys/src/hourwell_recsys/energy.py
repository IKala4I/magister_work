"""Stage 2 — personal energy model: Beta cells with decayed evidence (specs/07 §3.2.1).

Prior (α₀, β₀) is never decayed; evidence (S, F) decays as S·2^{−Δt/28d} at every read/update.
Rewards enter as fractional Bernoulli evidence: S += r, F += 1 − r (ADR-0007 §6).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from datetime import datetime

from scipy.stats import beta as beta_dist

from hourwell_recsys.params import BETA_HALF_LIFE_DAYS

HALF_LIFE_SECONDS = BETA_HALF_LIFE_DAYS * 86_400.0


@dataclass(frozen=True)
class BetaCell:
    category: str
    daypart: str
    day_type: str
    alpha0: float
    beta0: float
    succ: float = 0.0
    fail: float = 0.0
    last_event_at: datetime | None = None
    prior_version: int = 0

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.category, self.daypart, self.day_type)


@dataclass(frozen=True)
class Posterior:
    alpha: float
    beta: float
    n_effective: float  # decayed S + F

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def variance(self) -> float:
        a, b = self.alpha, self.beta
        return a * b / ((a + b) ** 2 * (a + b + 1))

    @property
    def sd(self) -> float:
        return math.sqrt(self.variance)

    def ci(self, lo: float, hi: float) -> tuple[float, float]:
        return (
            float(beta_dist.ppf(lo, self.alpha, self.beta)),
            float(beta_dist.ppf(hi, self.alpha, self.beta)),
        )


def decay_factor(elapsed_seconds: float) -> float:
    """2^{−Δt/28d}; negative Δt (out-of-order delivery) is clamped to 0 — evidence never grows."""
    return math.pow(2.0, -max(elapsed_seconds, 0.0) / HALF_LIFE_SECONDS)


def decayed_evidence(cell: BetaCell, now: datetime) -> tuple[float, float]:
    if cell.last_event_at is None:
        return cell.succ, cell.fail
    f = decay_factor((now - cell.last_event_at).total_seconds())
    return cell.succ * f, cell.fail * f


def posterior(cell: BetaCell, now: datetime) -> Posterior:
    s, f = decayed_evidence(cell, now)
    return Posterior(alpha=cell.alpha0 + s, beta=cell.beta0 + f, n_effective=s + f)


def apply_reward(cell: BetaCell, reward: float, at: datetime) -> BetaCell:
    """Decay first (as of `at`), then S += r, F += 1 − r; `last_event_at` moves to `at`."""
    if not 0.0 <= reward <= 1.0:
        raise ValueError(f"reward must be in [0, 1], got {reward}")
    s, f = decayed_evidence(cell, at)
    last = at if cell.last_event_at is None else max(cell.last_event_at, at)
    return replace(cell, succ=s + reward, fail=f + (1.0 - reward), last_event_at=last)


def reset_evidence(cell: BetaCell) -> BetaCell:
    return replace(cell, succ=0.0, fail=0.0, last_event_at=None)
