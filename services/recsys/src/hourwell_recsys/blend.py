"""Estimate blend q̂ = clip(w_E μ + w_B x̃ᵀθ̃) (specs/07 §3.2.6; spec-conflicts M4) and its online
update (P7, ADR-0010).

The two weights are a point on the 1-simplex (w_E + w_B = 1, w ≥ 0). Each applied reward tuple
takes ONE projected-SGD step on the squared error of the blend's own prediction — gradient of
½(pred − r)² w.r.t. (w_E, w_B) at learning rate BLEND_SGD_LR, followed by the exact Euclidean
projection onto the simplex (Duchi, Shalev-Shwartz, Singer & Chandra 2008; for two weights the
projection is closed-form). File 03 §2.2 names River for this step; the service owns the two-
parameter update in NumPy-free Python and uses River as the CI oracle for the unprojected step
(the same pattern as MABWiser for the bandit — spec-conflicts L23). w_B = 1 recovers File 04
§1.4 exactly (pre-registered ablation).
"""

from __future__ import annotations

from dataclasses import dataclass

from hourwell_recsys.params import BLEND_INIT_W_BANDIT, BLEND_INIT_W_ENERGY, BLEND_SGD_LR


@dataclass(frozen=True)
class Blend:
    w_energy: float = BLEND_INIT_W_ENERGY
    w_bandit: float = BLEND_INIT_W_BANDIT
    state_version: int = 1

    def __post_init__(self) -> None:
        convex = abs(self.w_energy + self.w_bandit - 1.0) <= 1e-6  # columns are float32
        if self.w_energy < 0 or self.w_bandit < 0 or not convex:
            raise ValueError("blend weights must be a convex combination")


def clip01(v: float) -> float:
    return min(max(v, 0.0), 1.0)


def blend_estimate(cell_mean: float, linear: float, blend: Blend) -> float:
    return clip01(blend.w_energy * cell_mean + blend.w_bandit * linear)


def unprojected_step(
    w_energy: float,
    w_bandit: float,
    cell_mean: float,
    linear: float,
    reward: float,
    lr: float = BLEND_SGD_LR,
) -> tuple[float, float]:
    """Plain SGD on ½(pred − r)²: w ← w − lr · (pred − r) · ∂pred/∂w. River's `LinearRegression`
    with `Squared` loss takes the same step at half the learning rate (its gradient carries the
    factor 2) — the CI oracle test pins that identity."""
    pred = w_energy * cell_mean + w_bandit * linear
    g = pred - reward
    return w_energy - lr * g * cell_mean, w_bandit - lr * g * linear


def project_simplex2(w_energy: float, w_bandit: float) -> tuple[float, float]:
    """Exact Euclidean projection of (w_E, w_B) onto {w ≥ 0, w_E + w_B = 1}: move along (1, −1)
    to the constraint line, then clip to the segment."""
    w_e = clip01((w_energy - w_bandit + 1.0) / 2.0)
    return w_e, 1.0 - w_e


def sgd_step(
    blend: Blend,
    cell_mean: float,
    linear: float,
    reward: float,
    lr: float = BLEND_SGD_LR,
) -> Blend:
    if not 0.0 <= reward <= 1.0:
        raise ValueError(f"reward must be in [0, 1], got {reward}")
    w_e, w_b = unprojected_step(blend.w_energy, blend.w_bandit, cell_mean, linear, reward, lr)
    w_e, w_b = project_simplex2(w_e, w_b)
    return Blend(w_e, w_b, blend.state_version)
