"""Estimate blend q̂ = clip(w_E μ + w_B x̃ᵀθ̃) (specs/07 §3.2.6; spec-conflicts M4).

w_B = 1 recovers File 04 §1.4 exactly (pre-registered ablation). The River SGD step on the
weights is a P7 deliverable (Appendix A "blend init / lr" fixed in P7); P5 applies the weights.
"""

from __future__ import annotations

from dataclasses import dataclass

from hourwell_recsys.params import BLEND_INIT_W_BANDIT, BLEND_INIT_W_ENERGY


@dataclass(frozen=True)
class Blend:
    w_energy: float = BLEND_INIT_W_ENERGY
    w_bandit: float = BLEND_INIT_W_BANDIT
    state_version: int = 1

    def __post_init__(self) -> None:
        convex = abs(self.w_energy + self.w_bandit - 1.0) <= 1e-9
        if self.w_energy < 0 or self.w_bandit < 0 or not convex:
            raise ValueError("blend weights must be a convex combination")


def clip01(v: float) -> float:
    return min(max(v, 0.0), 1.0)


def blend_estimate(cell_mean: float, linear: float, blend: Blend) -> float:
    return clip01(blend.w_energy * cell_mean + blend.w_bandit * linear)
