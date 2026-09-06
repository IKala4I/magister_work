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


def _se(vals: list[float]) -> float:
    return statistics.stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else float("nan")


def intermediate_loss_diagnostic(n_reps: int | None = None) -> dict[str, Any]:
    """Sensitivity results §5.1: the s = 1, σ_shape = 0, σ_day = 0.6 cell (adult mix) on ITS
    OWN registered seeds (the cell's index is derived from the frozen grid), under four
    settings — registered; the TS variance forced to ≈ 0; the informative prior level-matched
    to the world (its shape kept, its mean over the four dayparts moved to p₀); both — with
    per-class means ± SE over replicates. Decomposes the intermediate/morning-type loss into
    sampler variance, prior-level bias and the estimation-noise remainder."""
    from dataclasses import replace

    from hourwell_recsys.energy import BetaCell

    from hourwell_training.simstudy import sensitivity as sens

    spec = replace(sens.CENTRE, sigma_shape=0.0)
    index = next(i for i, (_, s) in enumerate(sens.grid()) if s.key == spec.key)
    base = sens.cell_seed_base(REGISTERED, index)
    seeds = [base + i for i in range(n_reps or REGISTERED.sens_replicates)]
    orig_sample = est.sample_thetas
    orig_cells = e3_closedloop.make_cells

    def tiny(states: Any, rng: Any, *, policy: str, sigma_sq: float = 0.25) -> Any:
        return orig_sample(states, rng, policy=policy, sigma_sq=1e-6)

    def level_matched(klass: str, prior: str) -> dict[str, BetaCell]:
        cells = orig_cells(klass, prior)
        if prior != "informative":
            return cells
        logit = lambda p: math.log(p / (1 - p))  # noqa: E731
        expit = lambda x: 1 / (1 + math.exp(-x))  # noqa: E731
        reach = tuple(sens.REACHABLE)
        mean_logit = sum(logit(e3_closedloop.MU0_DEEP[dp][klass]) for dp in reach) / len(reach)
        out = {}
        for dp, c in cells.items():
            mu = expit(logit(e3_closedloop.MU0_DEEP[dp][klass]) - mean_logit + logit(spec.p0))
            n0 = c.alpha0 + c.beta0
            out[dp] = BetaCell(c.category, c.daypart, c.day_type, alpha0=mu * n0,
                               beta0=(1 - mu) * n0)
        return out

    settings = {
        "registered": (orig_sample, orig_cells),
        "ts_variance_to_zero": (tiny, orig_cells),
        "prior_level_matched": (orig_sample, level_matched),
        "ts_zero_and_level_matched": (tiny, level_matched),
    }
    out: dict[str, Any] = {"cell": spec.key, "cell_index": index, "seeds": seeds}
    for label, (sampler, cells_fn) in settings.items():
        est.sample_thetas = sampler
        e3_closedloop.sample_thetas = sampler
        e3_closedloop.make_cells = cells_fn
        sens.e3.make_cells = cells_fn
        reps = [sens.run_cell_replicate(spec, REGISTERED, seed=s) for s in seeds]
        out[label] = {
            "effect": statistics.mean(r["effect"] for r in reps),
            "effect_se": _se([r["effect"] for r in reps]),
            "per_class": {k: statistics.mean(r["per_class_effect"][k] for r in reps)
                          for k in synthetic.CLASSES},
            "per_class_se": {k: _se([r["per_class_effect"][k] for r in reps])
                             for k in synthetic.CLASSES},
        }
    est.sample_thetas = orig_sample
    e3_closedloop.sample_thetas = orig_sample
    e3_closedloop.make_cells = orig_cells
    sens.e3.make_cells = orig_cells
    return out


def attainable_ceilings() -> dict[str, Any]:
    """Adversarial finding 5: both arms carry the ε-slice (one of K blocks uniform over the
    four dayparts), so the no-slice ceiling overstates what the learned arm can gain. For every
    grid cell and its registered seeds, reproduce the users' fixed completion probabilities
    (same RNG call order as `run_cell_replicate`: sequences, then δ) and compute
    E_b[ top_{K-1}(remaining_b) − earliest_{K-1}(remaining_b) ] / K averaged over users — the
    attainable B − A given the slice — next to the no-slice ceiling."""
    from hourwell_training.simstudy import sensitivity as sens

    cfg = REGISTERED
    out: dict[str, Any] = {}
    reach = list(sens.REACHABLE)
    for index, (_, spec) in enumerate(sens.grid()):
        base = sens.cell_seed_base(cfg, index)
        pattern = {k: sens.centred_pattern(k) for k in sens.CLASSES}
        vals_noslice: list[float] = []
        vals_attain: list[float] = []
        for rep in range(cfg.sens_replicates):
            rng = np.random.default_rng(base + rep)
            n = cfg.sens_n_users
            classes = sens.apportion(n, sens.MIXES[spec.mix])
            sens.e3.sequences_balanced(n, rng)  # consumes the same draws as the study
            delta = rng.normal(0.0, spec.sigma_shape, size=(n, len(reach)))
            b0 = math.log(spec.p0 / (1 - spec.p0))
            ns_acc = 0.0
            at_acc = 0.0
            for u in range(n):
                q = {dp: 1 / (1 + math.exp(-(b0 + spec.s * pattern[classes[u]][dp] + delta[u][j])))
                     for j, dp in enumerate(reach)}
                slots = [(q[dp], dp) for dp in reach for _ in range(sens.e3.DAYPART_CAPACITY[dp])]
                K = spec.tasks
                heur = sum(v for v, _ in slots[:K]) / K
                orac = sum(sorted((v for v, _ in slots), reverse=True)[:K]) / K
                ns_acc += orac - heur
                gain = 0.0
                for b in reach:  # the slice block lands in b, one unit of b's capacity used
                    rem = list(slots)
                    rem.remove((q[b], b))
                    e = sum(v for v, _ in rem[:K - 1])
                    o = sum(sorted((v for v, _ in rem), reverse=True)[:K - 1])
                    gain += (o - e) / K
                at_acc += gain / len(reach)
            vals_noslice.append(ns_acc / n)
            vals_attain.append(at_acc / n)
        out[spec.key] = {
            "index": index,
            "ceiling_noslice": statistics.mean(vals_noslice),
            "ceiling_attainable": statistics.mean(vals_attain),
        }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--only", choices=["int-loss", "ceilings"], default=None,
                    help="run one diagnostic; writes exploratory_<name>.json")
    args = ap.parse_args()
    if args.only == "int-loss":
        doc = {"note": "EXPLORATORY — sensitivity results §5.1", **intermediate_loss_diagnostic()}
        text = json.dumps(doc, indent=2)
        print(text)
        if args.out:
            (args.out / "exploratory_sensitivity.json").write_text(text + "\n")
        return 0
    if args.only == "ceilings":
        doc = {"note": "slice-aware attainable ceilings per grid cell (results §1, §5.2)",
               "cells": attainable_ceilings()}
        text = json.dumps(doc, indent=2)
        if args.out:
            (args.out / "ceilings_attainable.json").write_text(text + "\n")
        print(f"{len(doc['cells'])} cells")
        return 0
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
