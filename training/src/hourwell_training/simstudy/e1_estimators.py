"""E1 — estimator study (docs/study/preregistration.md §2; File 04 §2; ADR-0015 §8).

R replicates of the committed synthetic world; five target policies restricted to A_m(x);
replay / IPS / clipped IPS / SNIPS / DR-true / DR-const / DM-true / DM-const. Truth per
replicate is the closed-form value on that replicate's logged contexts.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from hourwell_training import ope, synthetic
from hourwell_training.params import ESS_FLOOR
from hourwell_training.simstudy.config import StudyConfig
from hourwell_training.simstudy.stats import mc_summary

__all__ = ["POLICIES", "expected_ess_ratios", "run_e1"]

Det = Callable[[ope.SliceRow], str]
Sto = Callable[[ope.SliceRow, str], float]


def _first(r: ope.SliceRow) -> str:
    return sorted(r.top_m)[0]


def _oracle(r: ope.SliceRow) -> str:
    klass = str(r.context["chronotype"])
    return sorted(r.top_m, key=lambda b: (-synthetic.q_true(b, klass), b))[0]


def _anti_oracle(r: ope.SliceRow) -> str:
    klass = str(r.context["chronotype"])
    return sorted(r.top_m, key=lambda b: (synthetic.q_true(b, klass), b))[0]


def _as_sto(det: Det) -> Sto:
    return lambda r, b: 1.0 if b == det(r) else 0.0


def _uniform(r: ope.SliceRow, b: str) -> float:
    return 1.0 / len(r.top_m)


def _tilted(r: ope.SliceRow, b: str) -> float:
    rest = len(r.top_m) - 1
    return 0.7 if b == _first(r) else 0.3 / rest


#: name → (deterministic policy or None, stochastic policy) — §2.1 P1–P5
POLICIES: dict[str, tuple[Det | None, Sto]] = {
    "P1_uniform": (None, _uniform),
    "P2_alpha_first": (_first, _as_sto(_first)),
    "P3_tilted": (None, _tilted),
    "P4_oracle": (_oracle, _as_sto(_oracle)),
    "P5_anti_oracle": (_anti_oracle, _as_sto(_anti_oracle)),
}


def expected_ess_ratios(sizes: tuple[int, ...] = (2, 3, 4)) -> dict[str, float]:
    """Preregistration E1-H7 arithmetic for equiprobable |A_m(x)| = m ∈ sizes: replay keeps
    E[1/m] of the rows; a deterministic policy's IPS ESS/n = (E w)²/E[w²] = 1/E[m]; the 0.7/0.3
    tilted policy's ESS/n = 1/E[m·(0.49 + 0.09/(m − 1))]."""
    k = len(sizes)
    return {
        "replay": sum(1.0 / m for m in sizes) / k,
        "deterministic": 1.0 / (sum(sizes) / k),
        "tilted": 1.0 / (sum(m * (0.49 + 0.09 / (m - 1)) for m in sizes) / k),
        "uniform": 1.0,
    }


def _r_true(r: ope.SliceRow, b: str) -> float:
    return synthetic.q_true(b, str(r.context["chronotype"]))


def _r_const(r: ope.SliceRow, b: str) -> float:
    return 0.5


def _estimates(
    rows: list[ope.SliceRow], det: Det | None, sto: Sto
) -> dict[str, ope.Estimate]:
    out: dict[str, ope.Estimate] = {}
    if det is not None:
        out["replay"] = ope.replay(rows, det)
    out["ips"] = ope.ips(rows, sto)
    out["ips_clip"] = ope.ips_clipped(rows, sto)
    out["snips"] = ope.snips(rows, sto)
    out["dr_true"] = ope.doubly_robust(rows, sto, _r_true)
    out["dr_const"] = ope.doubly_robust(rows, sto, _r_const)
    out["dm_true"] = ope.direct_method(rows, sto, _r_true)
    out["dm_const"] = ope.direct_method(rows, sto, _r_const)
    return out


def run_e1(cfg: StudyConfig) -> dict[str, Any]:
    errors: dict[str, dict[str, list[float]]] = {}
    ess: dict[str, dict[str, list[float]]] = {}
    clip_equal = True
    for i in range(cfg.e1_replicates):
        world = synthetic.make_world(n_rows=cfg.e1_rows, seed=cfg.e1_seed_base + i)
        for name, (det, sto) in POLICIES.items():
            truth = (
                synthetic.true_value_deterministic(world, det)
                if det is not None
                else synthetic.true_value_stochastic(world, sto)
            )
            ests = _estimates(world.rows, det, sto)
            if ests["ips_clip"].value != ests["ips"].value:
                clip_equal = False
            for est_name, est in ests.items():
                errors.setdefault(name, {}).setdefault(est_name, []).append(est.value - truth)
                ess.setdefault(name, {}).setdefault(est_name, []).append(est.ess)
    table: list[dict[str, Any]] = []
    for name in POLICIES:
        for est_name, errs in errors[name].items():
            s = mc_summary(errs)
            valid = [e for e in errs if not math.isnan(e)]
            rmse = math.sqrt(sum(e * e for e in valid) / len(valid)) if valid else math.nan
            e_vals = ess[name][est_name]
            table.append({
                "policy": name,
                "estimator": est_name,
                "bias": s["mean"],
                "sd": s["sd"],
                "mc_se": s["mc_se"],
                "rmse": rmse,
                "abs_bias_over_mc_se": (
                    abs(float(s["mean"])) / float(s["mc_se"]) if float(s["mc_se"]) > 0 else math.nan
                ),
                "ess_mean": sum(e_vals) / len(e_vals),
                "evidence_rate": sum(1 for e in e_vals if e >= ESS_FLOOR) / len(e_vals),
                "replicates": len(errs),
            })
    return {
        "config": {
            "replicates": cfg.e1_replicates,
            "rows": cfg.e1_rows,
            "seed_base": cfg.e1_seed_base,
        },
        "clip_equals_ips_everywhere": clip_equal,
        "table": table,
    }
