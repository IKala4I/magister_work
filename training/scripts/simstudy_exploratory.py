"""EXPLORATORY analyses run AFTER the registered simulation study — not part of it.

Three post-results checks cited by docs/study/simulation-results.md §4–§5, with their seeds so
they reproduce; nothing here changes the registered outputs in docs/study/results/.

  (a) the morning-type loss (E3-H1b): ten base/informative replicates with the TS variance
      forced to ≈ 0 through the service's own `sample_thetas` (patched in BOTH modules that
      bind the name — HANDOFF gotcha);
  (b) the E2 slope-SD rationale (adversarial finding 1): the registered logit-scale slope SD
      0.48 gives a between-user SD of the true probability difference of ≈ 0.10, not File 06
      §2.2's pessimistic 0.12 — solve for the slope that gives 0.12 and re-simulate the paired
      floor at N ∈ {30, 34, 40};
  (c) the replay bias (E1-H1, spec-conflicts M10): the closed-form replay target
      E[q(π(x))/m] / E[1/m] over the 200 registered worlds, next to the truth E[q(π(x))].

Usage (in training/): uv run python scripts/simstudy_exploratory.py [--out ../docs/study/results]
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Any

import hourwell_recsys.estimates as est
import numpy as np

from hourwell_training import synthetic
from hourwell_training.simstudy import REGISTERED, e1_estimators, e2_power, e3_closedloop


def ts_variance_diagnostic(n_reps: int = 10) -> dict[str, Any]:
    orig = est.sample_thetas

    def tiny(states: Any, rng: Any, *, policy: str, sigma_sq: float = 0.25) -> Any:
        return orig(states, rng, policy=policy, sigma_sq=1e-6)

    out: dict[str, Any] = {"replicates": n_reps, "seeds": [3000 + i for i in range(n_reps)]}
    for label, fn in (("registered_sigma_sq_0.25", orig), ("diagnostic_sigma_sq_1e-6", tiny)):
        est.sample_thetas = fn
        e3_closedloop.sample_thetas = fn  # the simstudy module binds the name at import
        reps = [
            e3_closedloop.run_replicate(REGISTERED, scale=0.5, prior="informative", seed=s)
            for s in out["seeds"]
        ]
        out[label] = {
            "effect": statistics.mean(r["effect"] for r in reps),
            "per_class": {
                k: statistics.mean(r["per_class_effect"][k] for r in reps)
                for k in synthetic.CLASSES
            },
            "exploration_cost_B": statistics.mean(r["exploited_B"] - r["slice_B"] for r in reps),
        }
    est.sample_thetas = orig
    e3_closedloop.sample_thetas = orig
    return out


def _tau_of_slope(slope: float, icc: float, n: int = 400_000, seed: int = 0) -> float:
    rng = np.random.default_rng(seed)
    b0 = math.log(REGISTERED.e2_baseline / (1 - REGISTERED.e2_baseline))
    u0 = rng.normal(0.0, e2_power.intercept_sd_from_icc(icc), n)
    u1 = rng.normal(0.0, slope, n)
    pa = 1 / (1 + np.exp(-(b0 + u0)))
    pb = 1 / (1 + np.exp(-(b0 + u0 + math.log(REGISTERED.e2_odds_ratio) + u1)))
    return float((pb - pa).std())


def slope_sd_sensitivity(target_tau: float = 0.12, replicates: int = 3000) -> dict[str, Any]:
    from dataclasses import replace

    out: dict[str, Any] = {"target_tau": target_tau, "replicates": replicates, "cells": []}
    log_or = math.log(REGISTERED.e2_odds_ratio)
    seed = 99
    for icc in REGISTERED.e2_iccs:
        registered_tau = _tau_of_slope(REGISTERED.e2_slope_sd_logit, icc)
        lo, hi = 0.2, 1.2
        for _ in range(40):  # bisection on the monotone map slope → τ
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if _tau_of_slope(mid, icc) < target_tau else (lo, mid)
        slope = (lo + hi) / 2
        cfg = replace(REGISTERED, e2_slope_sd_logit=slope)
        for n in (30, 34, 40):
            cell = e2_power.simulate_cell(
                cfg, icc=icc, log_or=log_or, n_users=n, replicates=replicates, seed=seed
            )
            seed += 1
            out["cells"].append({
                "icc": icc, "registered_slope": REGISTERED.e2_slope_sd_logit,
                "registered_tau": registered_tau, "slope_for_target_tau": slope, "n_users": n,
                "power_paired_t": cell["power_paired_t"],
                "power_wilcoxon": cell["power_wilcoxon"],
                "mean_diff": cell["mean_diff"]["mean"],
            })
    return out


def replay_closed_form_targets() -> dict[str, Any]:
    """Replay averages the matched rows; a row is matched with probability 1/m, so its target is
    E[q(π(x), class)/m] / E[1/m] — the truth reweighted by 1/|A_m(x)| — not E[q(π(x), class)]."""
    out: dict[str, Any] = {}
    for name in ("P2_alpha_first", "P4_oracle", "P5_anti_oracle"):
        det, _ = e1_estimators.POLICIES[name]
        assert det is not None
        diffs = []
        for i in range(REGISTERED.e1_replicates):
            world = synthetic.make_world(
                n_rows=REGISTERED.e1_rows, seed=REGISTERED.e1_seed_base + i
            )
            num = sum(synthetic.q_true(det(r), str(r.context["chronotype"])) / len(r.top_m)
                      for r in world.rows)
            den = sum(1.0 / len(r.top_m) for r in world.rows)
            truth = synthetic.true_value_deterministic(world, det)
            diffs.append(num / den - truth)
        out[name] = {
            "replay_target_minus_truth": statistics.mean(diffs),
            "mc_se": statistics.stdev(diffs) / math.sqrt(len(diffs)),
        }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    doc = {
        "note": "EXPLORATORY — run after the registered study; not part of it",
        "ts_variance_diagnostic": ts_variance_diagnostic(),
        "slope_sd_sensitivity": slope_sd_sensitivity(),
        "replay_closed_form_targets": replay_closed_form_targets(),
    }
    text = json.dumps(doc, indent=2)
    print(text)
    if args.out:
        (args.out / "exploratory.json").write_text(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
