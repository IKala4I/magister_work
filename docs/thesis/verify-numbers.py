#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recompute every study-derived number the thesis text quotes, straight from
`docs/study/results/*.json`, and diff it against what the text says.

Owner directive 2026-09-09: a number that cannot be reproduced from the results JSON does not go
into the thesis until it can. The study documents' prose summaries are NOT the source — three
errors have been found in them, twice inside a sentence that was itself a correction.

Run from the repository root:  python3 docs/thesis/verify-numbers.py
Exit status 1 if any claim fails.
"""
from __future__ import annotations

import io
import json
import math
import sys

R = "docs/study/results/"


def load(name: str):
    return json.load(io.open(R + name, encoding="utf-8"))


FAILURES: list[str] = []
CHECKS = 0


def check(label: str, claimed, recomputed, tol=0.0, note: str = "") -> None:
    """Compare a claimed value against one recomputed from the JSON."""
    global CHECKS
    CHECKS += 1
    if isinstance(claimed, (int, float)) and isinstance(recomputed, (int, float)):
        ok = abs(claimed - recomputed) <= tol
    else:
        ok = claimed == recomputed
    mark = "ok  " if ok else "FAIL"
    line = f"{mark} {label:58s} text={claimed!r:>26} json={recomputed!r}"
    if note:
        line += f"   ({note})"
    print(line)
    if not ok:
        FAILURES.append(line)


# --------------------------------------------------------------------------- E1
def e1() -> None:
    print("\n== E1 — estimators (rozdil-6 §6.1, rollup §2.1) ==")
    e = load("e1_estimators.json")
    t = e["table"]
    by = {(r["policy"], r["estimator"]): r for r in t}

    for pol, est, bias, sd, ess in [
        ("P2_alpha_first", "replay", 0.0008, 0.0233, 360.5),
        ("P4_oracle", "replay", -0.0061, 0.0269, 359.2),
        ("P5_anti_oracle", "replay", 0.0074, 0.0228, 363.5),
        ("P4_oracle", "snips", -0.0007, 0.0278, 331.7),
        ("P1_uniform", "ips", -0.0006, 0.0152, 1000.0),
    ]:
        r = by.get((pol, est))
        if r is None:
            check(f"E1 {pol}/{est} present", True, False)
            continue
        check(f"E1 {pol}/{est} bias", bias, round(r["bias"], 4), 5e-5)
        check(f"E1 {pol}/{est} SD", sd, round(r["sd"], 4), 5e-5)
        check(f"E1 {pol}/{est} ESS", ess, round(r["ess_mean"], 1), 0.05)

    # |bias| / MC SE for the two biased replay cells — the claim is 3.2 and 4.6
    for pol, claimed in [("P4_oracle", 3.2), ("P5_anti_oracle", 4.6)]:
        r = by[(pol, "replay")]
        check(f"E1 {pol}/replay |bias|/MC SE", claimed, round(r["abs_bias_over_mc_se"], 1), 0.05)

    # ESS/n ratios: the claim is 0.333 deterministic, 0.361 replay
    pols = ("P2_alpha_first", "P4_oracle", "P5_anti_oracle")
    det = [by[(p, "ips")]["ess_mean"] for p in pols]
    rep = [by[(p, "replay")]["ess_mean"] for p in pols]
    n = e["config"]["rows"]
    check("E1 ESS/n deterministic", 0.333, round(sum(det) / len(det) / n, 3), 5e-4)
    check("E1 ESS/n replay", 0.361, round(sum(rep) / len(rep) / n, 3), 5e-4)

    # the field-study projection quoted in rozdil-5 §5.5.1 and rozdil-6 §6.1
    check("ESS from 930 plain-week rows", 310, round(930 * 0.333), 1)
    check("ESS from 240 heavy-week rows", 80, round(240 * 0.333), 1)
    check("ESS from 520 heavy-week rows", 175, round(520 * 0.333), 2)
    # the strict-rule counterfactual quoted in rozdil-6 §6.1 / rollup §2.6.2
    check("strict-rule rows (930 x 0.57/0.86)", 615, round(930 * 0.57 / 0.86), 2)
    check("strict-rule replay ESS (615/4)", 154, round(615 / 4), 1)


# --------------------------------------------------------------------------- E2
def e2() -> None:
    print("\n== E2 — power (rozdil-6 §6.2, rozdil-5 §5.5.2) ==")
    d = load("e2_power.json")
    cells = {(round(c["icc"], 2), round(math.exp(c["log_or"]), 2)): c for c in d["cells"]}
    for icc, claimed_t, claimed_w, claimed_d in [(0.10, 0.836, 0.816, 7.23), (0.20, 0.817, 0.799, 6.75)]:
        c = cells[(icc, 1.38)]
        check(f"E2 ICC {icc} power (paired t)", claimed_t, round(c["power_paired_t"], 3), 5e-4)
        check(f"E2 ICC {icc} power (Wilcoxon)", claimed_w, round(c["power_wilcoxon"], 3), 5e-4)
        check(f"E2 ICC {icc} mean d (pp)", claimed_d, round(c["mean_diff"]["mean"] * 100, 2), 5e-3)
    for icc, claimed in [(0.10, 0.028), (0.20, 0.030)]:
        c = cells[(icc, 1.0)]
        check(f"E2 ICC {icc} type-I (t)", claimed, round(c["power_paired_t"], 3), 6e-4)
    sweep = {x["n_users"]: x for x in d["n_sweep"]}
    for n, claimed in [(20, 0.644), (24, 0.724), (28, 0.782), (30, 0.822), (34, 0.863), (40, 0.922)]:
        check(f"E2 N sweep {n}", claimed, round(sweep[n]["power_paired_t"], 3), 5e-4)
    check("E2 smallest N with power >= 0.80", 30, d["smallest_n_power_80"])
    p1 = {round(x["icc"], 2): x for x in d["phase1_between_subject"]}
    check("E2 phase-1 contrast ICC 0.10", 0.206, round(p1[0.10]["power_welch"], 3), 5e-4)
    check("E2 phase-1 contrast ICC 0.20", 0.133, round(p1[0.20]["power_welch"], 3), 5e-4)

    ex = load("exploratory.json")["slope_sd_sensitivity"]
    rows = {(round(r["icc"], 2), r["n_users"]): r for r in ex["cells"]}
    check("E2 registered tau (not File 06's 0.12)", 0.107,
          round(rows[(0.10, 30)]["registered_tau"], 3), 5e-4)
    for icc, n, claimed in [(0.10, 30, 0.768), (0.20, 30, 0.735), (0.10, 34, 0.824), (0.20, 40, 0.831)]:
        check(f"E2 tau=0.12 floor ICC {icc} N={n}", claimed,
              round(rows[(icc, n)]["power_paired_t"], 3), 5e-4)


# --------------------------------------------------------------------------- E3
def e3() -> None:
    print("\n== E3 — closed loop (rozdil-6 §6.3) ==")
    cells = load("e3_closedloop.json")["cells"]
    for key, eff, se, ceil, effic, share, rej in [
        ("base/informative", 2.54, 0.14, 4.12, 0.62, 0.96, 0.26),
        ("base/flat", 2.06, 0.14, 4.12, 0.50, 0.92, 0.22),
        ("amplified/informative", 5.37, 0.14, 7.84, 0.69, 1.00, 0.79),
        ("amplified/flat", 4.77, 0.12, 7.84, 0.61, 1.00, 0.61),
    ]:
        c = cells[key]
        check(f"E3 {key} effect (pp)", eff, round(c["effect"]["mean"] * 100, 2), 6e-3)
        check(f"E3 {key} MC SE (pp)", se, round(c["effect"]["mc_se"] * 100, 2), 6e-3)
        check(f"E3 {key} ceiling (pp)", ceil, round(c["ceiling"]["population"]["gap"] * 100, 2), 6e-3)
        check(f"E3 {key} efficiency", effic, round(c["efficiency"]["mean"], 2), 6e-3)
        check(f"E3 {key} share > 0", share, round(c["share_effect_positive"], 2), 6e-3)
        check(f"E3 {key} rejection (t)", rej, round(c["rejection_rate_t"], 2), 6e-3)

    per = cells["base/informative"]["per_class_effect"]
    for cls, claimed in [("DM", -1.82), ("MM", -1.66), ("INT", 0.35), ("ME", 5.85), ("DE", 10.01)]:
        check(f"E3 base/inf per-class {cls}", claimed, round(per[cls]["mean"] * 100, 2), 6e-3)
    per_a = cells["amplified/informative"]["per_class_effect"]
    for cls, claimed in [("DM", -0.85), ("MM", -2.26), ("INT", -0.09), ("ME", 11.47), ("DE", 18.57)]:
        check(f"E3 amp/inf per-class {cls}", claimed, round(per_a[cls]["mean"] * 100, 2), 6e-3)

    # rozdil-6 §6.3 says morning types lose 0.9-2.3 pp across the informative cells
    morning = [per[c]["mean"] * 100 for c in ("DM", "MM")] + [per_a[c]["mean"] * 100 for c in ("DM", "MM")]
    # written unrounded: rounding 0.85 up to "0.9" is a rounding the text should not make
    check("E3 morning-type loss range, low", 0.85, round(-max(morning), 2), 6e-3)
    check("E3 morning-type loss range, high", 2.26, round(-min(morning), 2), 6e-3)

    for key, claimed_g, claimed_share in [
        ("base/informative", 0.25, 0.54), ("base/flat", 0.75, 0.59),
        ("amplified/informative", 0.53, 0.59), ("amplified/flat", 1.26, 0.63),
    ]:
        c = cells[key]
        check(f"E3 {key} growth (pp)", claimed_g, round(c["growth"]["mean"] * 100, 2), 6e-3)
        check(f"E3 {key} share growth > 0", claimed_share, round(c["share_growth_positive"], 2), 6e-3)

    # the H4 detectability claim: flat cells 59-63 % positive, 3-10 % significant
    flat = [cells[k] for k in ("base/flat", "amplified/flat")]
    check("E3 H4 flat share positive, low", 0.59, round(min(c["share_growth_positive"] for c in flat), 2), 6e-3)
    check("E3 H4 flat share positive, high", 0.63, round(max(c["share_growth_positive"] for c in flat), 2), 6e-3)
    check("E3 H4 flat rejection, low", 0.03, round(min(c["growth_rejection_rate"] for c in flat), 2), 6e-3)
    check("E3 H4 flat rejection, high", 0.10, round(max(c["growth_rejection_rate"] for c in flat), 2), 6e-3)


# --------------------------------------------------------------------------- sensitivity
def sens() -> None:
    print("\n== Sensitivity grid (rozdil-6 §6.4-§6.5, rozdil-5 §5.5.3, rollup §2.1) ==")
    cells = load("sensitivity.json")["cells"]
    v = [c["verdict"] for c in cells]
    check("grid cells", 75, len(cells))
    check("grid WIN", 58, v.count("WIN"))
    check("grid TIE", 17, v.count("TIE"))
    check("grid LOSS", 0, v.count("LOSS"))

    def cell(**kw):
        for c in cells:
            if all(c[k] == val for k, val in kw.items()):
                return c
        raise KeyError(kw)

    base = dict(mix="adult", p0=0.45, tasks=4, prior="informative")
    # the world the prior was written for
    for sd, claimed in [(0.0, 0.42), (0.6, -0.07), (0.9, 0.04)]:
        c = cell(s=1.0, sigma_shape=0.0, sigma_day=sd, **base)
        check(f"prior's own world, day noise {sd}", claimed, round(c["effect"]["mean"] * 100, 2), 6e-3)
        check(f"prior's own world, day noise {sd}: verdict", "TIE", c["verdict"])
    # individual deviation alone vs population pattern alone
    check("s=0, sigma_shape=0.6, no day noise", 5.67,
          round(cell(s=0.0, sigma_shape=0.6, sigma_day=0.0, **base)["effect"]["mean"] * 100, 2), 6e-3)
    check("s=2, sigma_shape=0, no day noise", 2.79,
          round(cell(s=2.0, sigma_shape=0.0, sigma_day=0.0, **base)["effect"]["mean"] * 100, 2), 6e-3)
    # prior ablation: |flat - informative| across the five Block E cells
    diffs = []
    for s in (0.0, 0.5, 1.0, 1.5, 2.0):
        f = cell(s=s, sigma_shape=0.3, sigma_day=0.6, mix="adult", p0=0.45, tasks=4, prior="flat")
        i = cell(s=s, sigma_shape=0.3, sigma_day=0.6, mix="adult", p0=0.45, tasks=4, prior="informative")
        diffs.append((f["effect"]["mean"] - i["effect"]["mean"]) * 100)
    check("prior worth, max |flat - informative| (pp)", 0.4, round(max(abs(d) for d in diffs), 1), 0.05)

    # MC SE: the grid's pre-run estimate was ~0.14 pp -> 1 pp is ~7 MC SE, not ~10
    ses = sorted(c["effect"]["mc_se"] * 100 for c in cells)
    med = ses[len(ses) // 2]
    check("grid median MC SE (pp)", 0.13, round(med, 2), 6e-3)
    check("1 pp in median MC SE units", 7.7, round(1 / med, 1), 0.05)

    # N80
    finite = [(math.ceil(c["n80_median"]), c) for c in cells
              if not c["n80_over_grid_max"] and c["n80_median"] is not None]
    check("N80 minimum over the grid", 21, min(n for n, _ in finite))
    check("cells with N80 > 120", 48, sum(1 for c in cells if c["n80_over_grid_max"]))
    check("cells with N80 <= 60", 13, sum(1 for n, _ in finite if n <= 60))
    supporting = [(n, c) for n, c in finite if n <= 30]
    check("cells supporting N = 30", 1, len(supporting))
    if supporting:
        n, c = supporting[0]
        check("  the supporting cell: tasks", 6, c["tasks"])
        check("  the supporting cell: s", 2.0, c["s"])
        check("  the supporting cell: mix", "adult", c["mix"])
        check("  the supporting cell: N80", 21, n)
    k4 = [(n, c) for n, c in finite if c["tasks"] == 4]
    check("smallest N80 at K=4, all mixes", 31, min(n for n, _ in k4))
    check("smallest N80 at K=4, adult mix", 33, min(n for n, c in k4 if c["mix"] == "adult"))
    # the s=2 stress level is shared, so "least plausible world" would be unsupported
    check("cells at s=2 (the superlative check)", 17, sum(1 for c in cells if c["s"] == 2.0))

    # rozdil-1 §1.4's rebuilt gap argument rests on these two, so they are checked here too
    check("§1.4: cells needing N > 120", 48, sum(1 for c in cells if c["n80_over_grid_max"]))
    check("§1.4: enrolment at 30 % attrition from 120", 172, math.ceil(120 / 0.7))

    # exploration cost on slice rows: the grid maximum quoted as 17 pp
    costs = [c["exploration_cost_B"]["mean"] * 100 for c in cells]
    check("max exploration cost, arm B (pp)", 17, round(max(costs)), 0.5)
    check("min exploration cost, arm B (pp)", 0.03, round(min(abs(x) for x in costs), 2), 0.02)

    # mix comparison quoted in rozdil-5 §5.6 as "twice as large at s >= 1"
    u1 = cell(s=1.0, sigma_shape=0.3, sigma_day=0.6, mix="uniform", p0=0.45, tasks=4, prior="informative")
    a1 = cell(s=1.0, sigma_shape=0.3, sigma_day=0.6, mix="adult", p0=0.45, tasks=4, prior="informative")
    check("uniform vs adult at s=1 (pp)", 2.87, round(u1["effect"]["mean"] * 100, 2), 6e-3)
    check("adult at s=1 (pp)", 1.44, round(a1["effect"]["mean"] * 100, 2), 6e-3)
    check("ratio uniform/adult at s=1", 2.0, round(u1["effect"]["mean"] / a1["effect"]["mean"], 1), 0.05)

    # K sweep quoted in rozdil-6 §6.4.4
    k6 = cell(s=1.0, sigma_shape=0.3, sigma_day=0.6, mix="adult", p0=0.45, tasks=6, prior="informative")
    check("K=6 at s=1 (pp)", 2.83, round(k6["effect"]["mean"] * 100, 2), 6e-3)


# --------------------------------------------------------------------------- loss decomposition
def decomposition() -> None:
    print("\n== Loss decomposition (rozdil-6 §6.4.3, rollup §3.1) ==")
    d = load("exploratory_sensitivity.json")
    reg, tsz, lvl = d["registered"], d["ts_variance_to_zero"], d["prior_level_matched"]
    for cls, share_name, claimed in [("DM", "about half", 0.5), ("MM", "about a quarter", 0.25), ("INT", "about a sixth", 1 / 6)]:
        recovered = (tsz["per_class"][cls] - reg["per_class"][cls]) / abs(reg["per_class"][cls])
        check(f"sampler variance share of {cls} loss ({share_name})", round(claimed, 2), round(recovered, 2), 0.09)
    for cls in ("DM", "MM", "INT"):
        recovered = (lvl["per_class"][cls] - reg["per_class"][cls]) / abs(reg["per_class"][cls])
        check(f"prior level-bias share of {cls} loss (a quarter)", 0.25, round(recovered, 2), 0.12)


for fn in (e1, e2, e3, sens, decomposition):
    try:
        fn()
    except Exception as exc:  # a structural mismatch is itself a finding
        FAILURES.append(f"{fn.__name__} raised {type(exc).__name__}: {exc}")
        print(f"FAIL {fn.__name__} raised {type(exc).__name__}: {exc}")

print(f"\n{CHECKS} checks, {len(FAILURES)} failures")
for f in FAILURES:
    print("  " + f)
sys.exit(1 if FAILURES else 0)
