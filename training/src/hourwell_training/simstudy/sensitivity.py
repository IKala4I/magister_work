"""Sensitivity study across simulated worlds (docs/study/sensitivity-grid.md — frozen first).

World model (§1 there): logit q(u, c, d) = logit(p₀) + s · T(k_u, c) + δ_{u,c} + ε_{u,d}, with T
the File 04 §3.2 Deep-work pattern centred per class over the four reachable dayparts, δ an
individual's fixed deviation (σ_shape), ε a day shock (σ_day). The learner, the arms, the slice,
the schedule and the analysis are E3's (`e3_closedloop`); only the completion probability comes
from this world. Every cell is reported, with its own analytic ceiling, verdict and N₈₀.
"""

from __future__ import annotations

import math
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np
from hourwell_recsys import bandit
from scipy import stats

from hourwell_training.simstudy import e3_closedloop as e3
from hourwell_training.simstudy.config import StudyConfig
from hourwell_training.simstudy.stats import mc_summary, paired_tests

__all__ = [
    "MIXES",
    "WorldSpec",
    "analytic_n80",
    "apportion",
    "cell_seed_base",
    "centred_pattern",
    "grid",
    "n80_median_over_replicates",
    "run_cell_replicate",
    "run_sensitivity",
    "verdict",
]

CLASSES = ("DM", "MM", "INT", "ME", "DE")
REACHABLE = tuple(e3.DAYPART_CAPACITY)  # MO, MD, AF, EV
#: sensitivity-grid §1: adult = MEQ worker sample 28/52/20 split into five classes; uniform =
#: the E3 mix; student = evening-shifted (chronotype latest around age 20)
MIXES: dict[str, dict[str, float]] = {
    "adult": {"DM": 0.12, "MM": 0.16, "INT": 0.52, "ME": 0.12, "DE": 0.08},
    "uniform": {k: 0.2 for k in CLASSES},
    "student": {"DM": 0.08, "MM": 0.12, "INT": 0.48, "ME": 0.20, "DE": 0.12},
}
WIN_PP = 0.01  # verdict tie band (§3): 1 pp
DIRECTION_SHARE = 0.90


def _logit(p: float) -> float:
    return math.log(p / (1.0 - p))


def _expit(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def centred_pattern(klass: str) -> dict[str, float]:
    """T(k, c): logit μ₀(k, c) from File 04 §3.2 minus its mean over the reachable dayparts."""
    ls = {dp: _logit(e3.MU0_DEEP[dp][klass]) for dp in REACHABLE}
    m = sum(ls.values()) / len(ls)
    return {dp: v - m for dp, v in ls.items()}


def apportion(n: int, mix: dict[str, float]) -> list[str]:
    """Deterministic proportional apportionment: user i gets the class with the largest
    (share · (i + 1) − assigned so far), ties by class order — every prefix carries the mix."""
    counts = dict.fromkeys(CLASSES, 0)
    out: list[str] = []
    for i in range(n):
        k = max(CLASSES, key=lambda c: (mix[c] * (i + 1) - counts[c], -CLASSES.index(c)))
        counts[k] += 1
        out.append(k)
    return out


def analytic_n80(d_mean: float, sd_user: float, *, alpha: float = 0.05, power: float = 0.80,
                 n_max: int = 2000) -> int | None:
    """Smallest N with paired-t power ≥ `power` (two-sided α, noncentral t) for a per-user
    difference of mean `d_mean` and SD `sd_user`; None when it exceeds n_max or d ≤ 0."""
    if d_mean <= 0.0 or sd_user <= 0.0:
        return None
    for n in range(4, n_max + 1):
        ncp = d_mean / (sd_user / math.sqrt(n))
        tc = stats.t.ppf(1 - alpha / 2, n - 1)
        pw = 1 - stats.nct.cdf(tc, n - 1, ncp) + stats.nct.cdf(-tc, n - 1, ncp)
        if pw >= power:
            return n
    return None


def n80_median_over_replicates(n80s: list[int | None]) -> float | None:
    """Grid §3: the median over ALL replicates, a replicate with no positive effect (or N₈₀ >
    2000) counting as +∞ — so a cell whose median replicate has no attainable power reports
    None ("> grid maximum"), never a median over the lucky replicates only."""
    vals = sorted(float("inf") if x is None else float(x) for x in n80s)
    if not vals:
        return None
    med = float(np.median(vals))
    return None if math.isinf(med) else med


def cell_seed_base(cfg: StudyConfig, index: int) -> int:
    """Grid §2: seeds are base + stride · cell index + replicate."""
    return cfg.sens_seed_base + index * cfg.sens_cell_seed_stride


def verdict(effect_mean: float, share_positive: float, share_negative: float) -> str:
    if effect_mean > WIN_PP and share_positive >= DIRECTION_SHARE:
        return "WIN"
    if effect_mean < -WIN_PP and share_negative >= DIRECTION_SHARE:
        return "LOSS"
    return "TIE"


@dataclass(frozen=True)
class WorldSpec:
    s: float
    sigma_shape: float
    sigma_day: float
    mix: str
    p0: float
    tasks: int
    prior: str

    @property
    def key(self) -> str:
        return (f"s={self.s}|shape={self.sigma_shape}|day={self.sigma_day}|mix={self.mix}|"
                f"p0={self.p0}|K={self.tasks}|prior={self.prior}")


CENTRE = WorldSpec(s=1.0, sigma_shape=0.3, sigma_day=0.6, mix="adult", p0=0.45, tasks=4,
                   prior="informative")


def grid() -> list[tuple[str, WorldSpec]]:
    """The 75 distinct cells of sensitivity-grid §2 with their block label (first block wins)."""
    from dataclasses import replace

    cells: list[tuple[str, WorldSpec]] = []
    seen: set[str] = set()

    def add(block: str, spec: WorldSpec) -> None:
        if spec.key not in seen:
            seen.add(spec.key)
            cells.append((block, spec))

    for s in (0.0, 0.5, 1.0, 1.5, 2.0):
        for shape in (0.0, 0.3, 0.6):
            for day in (0.0, 0.6, 0.9):
                add("A", replace(CENTRE, s=s, sigma_shape=shape, sigma_day=day))
    for mix in MIXES:
        for s in (0.0, 0.5, 1.0, 1.5, 2.0):
            add("B", replace(CENTRE, mix=mix, s=s))
    for p0 in (0.30, 0.45, 0.60):
        for s in (0.5, 1.0, 2.0):
            add("C", replace(CENTRE, p0=p0, s=s))
    for k in (2, 4, 6, 8):
        for s in (0.5, 1.0, 2.0):
            add("D", replace(CENTRE, tasks=k, s=s))
    for s in (0.0, 0.5, 1.0, 1.5, 2.0):
        add("E", replace(CENTRE, prior="flat", s=s))
    return cells


# ---------------------------------------------------------------------------
# one replicated study in one world
# ---------------------------------------------------------------------------
def _ceiling(q_fixed: list[dict[str, float]], tasks: int) -> tuple[float, float]:
    """(heuristic, oracle) mean completion over users from the fixed part of q (no ε):
    heuristic fills MO×3, MD×2, AF×3, EV×1 in order; the oracle takes the K best slots."""
    heur = 0.0
    orac = 0.0
    for q in q_fixed:
        slots = [q[dp] for dp in REACHABLE for _ in range(e3.DAYPART_CAPACITY[dp])]
        heur += sum(slots[:tasks]) / tasks
        orac += sum(sorted(slots, reverse=True)[:tasks]) / tasks
    return heur / len(q_fixed), orac / len(q_fixed)


def run_cell_replicate(spec: WorldSpec, cfg: StudyConfig, seed: int) -> dict[str, Any]:
    from dataclasses import replace

    rng = np.random.default_rng(seed)
    cfg = replace(cfg, e3_n_users=cfg.sens_n_users, e3_tasks_per_day=spec.tasks)
    n = cfg.sens_n_users
    classes = apportion(n, MIXES[spec.mix])
    seqs = e3.sequences_balanced(n, rng)
    users = [
        e3._User(uid=i, klass=classes[i], sequence=seqs[i],
                 cells=e3.make_cells(classes[i], spec.prior), state=bandit.init_state("deep"))
        for i in range(n)
    ]
    base = _logit(spec.p0)
    pattern = {k: centred_pattern(k) for k in CLASSES}
    delta = rng.normal(0.0, spec.sigma_shape, size=(n, len(REACHABLE)))
    fixed_logit = [
        {dp: base + spec.s * pattern[u.klass][dp] + float(delta[u.uid][j])
         for j, dp in enumerate(REACHABLE)}
        for u in users
    ]
    q_fixed = [{dp: _expit(v) for dp, v in fl.items()} for fl in fixed_logit]
    heur_ceiling, oracle_ceiling = _ceiling(q_fixed, spec.tasks)

    start = date.fromisoformat(cfg.e3_start_iso)
    n_days = cfg.e3_runin_days + cfg.e3_phases * cfg.e3_phase_days
    rows: list[e3._Row] = []
    weekday = start
    for day in range(n_days):
        while weekday.weekday() >= 5:
            weekday += timedelta(days=1)
        plan_at = datetime(weekday.year, weekday.month, weekday.day, e3.PLAN_HOUR, tzinfo=UTC)
        learn_at = datetime(weekday.year, weekday.month, weekday.day, e3.ATTRIBUTION_HOUR,
                            e3.ATTRIBUTION_MINUTE, tzinfo=UTC)
        eps = rng.normal(0.0, spec.sigma_day, size=n) if spec.sigma_day > 0 else np.zeros(n)
        for u in users:
            arm, phase = e3._arm_for(u, day, cfg)
            fl = fixed_logit[u.uid]
            shock = float(eps[u.uid])

            def q_of(bid: str, fl: dict[str, float] = fl, shock: float = shock) -> float:
                return _expit(fl[e3.DAYPART_OF[bid]] + shock)

            day_rows = e3._plan_day(u, arm, day, phase, plan_at, rng, 0.0, cfg, q_of=q_of)
            e3._learn(u, day_rows, learn_at)
            rows.extend(day_rows)
        weekday += timedelta(days=1)

    analysed = [r for r in rows if r.phase > 0]
    by_user: dict[int, dict[str, list[float]]] = {u.uid: {} for u in users}
    for r in analysed:
        by_user[r.uid].setdefault(f"{r.arm}|{r.phase}", []).append(r.reward)

    def user_mean(uid: int, arm: str, phases: tuple[int, ...]) -> float:
        sel = [x for p in phases for x in by_user[uid].get(f"{arm}|{p}", [])]
        return sum(sel) / len(sel)

    all_phases = tuple(range(1, cfg.e3_phases + 1))
    a_means = [user_mean(u.uid, "A", all_phases) for u in users]
    b_means = [user_mean(u.uid, "B", all_phases) for u in users]
    d = [b - a for b, a in zip(b_means, a_means, strict=True)]
    d_mean = float(np.mean(d))
    sd_user = float(np.std(d, ddof=1))
    half = cfg.e3_phases // 2
    gaps = [
        (user_mean(u.uid, "B", all_phases[half:]) - user_mean(u.uid, "A", all_phases[half:]))
        - (user_mean(u.uid, "B", all_phases[:half]) - user_mean(u.uid, "A", all_phases[:half]))
        for u in users
    ]
    rejections = {}
    for n_sub in cfg.sens_ns:
        if n_sub <= n:
            rejections[str(n_sub)] = paired_tests(b_means[:n_sub], a_means[:n_sub]).rejects()
    per_class: dict[str, float] = {}
    for k in CLASSES:
        vals = [d[u.uid] for u in users if u.klass == k]
        per_class[k] = float(np.mean(vals)) if vals else math.nan

    def mean_reward(arm: str, is_exp: bool) -> float:
        sel = [r.reward for r in analysed if r.arm == arm and r.is_experiment == is_exp]
        return sum(sel) / len(sel) if sel else math.nan

    return {
        "seed": seed,
        "effect": d_mean,
        "sd_user": sd_user,
        "n80": analytic_n80(d_mean, sd_user),
        "rejects_at": rejections,
        "growth": float(np.mean(gaps)),
        "per_class_effect": per_class,
        "mean_A": float(np.mean(a_means)),
        "mean_B": float(np.mean(b_means)),
        "heuristic_ceiling": heur_ceiling,
        "oracle_ceiling": oracle_ceiling,
        "ceiling_gap": oracle_ceiling - heur_ceiling,
        "exploration_cost_B": mean_reward("B", False) - mean_reward("B", True),
        "exploration_cost_A": mean_reward("A", False) - mean_reward("A", True),
        "final_w_energy": float(np.mean([u.blend.w_energy for u in users])),
    }


def _job(args: tuple[WorldSpec, StudyConfig, int]) -> dict[str, Any]:
    spec, cfg, seed = args
    return run_cell_replicate(spec, cfg, seed)


def _aggregate(block: str, spec: WorldSpec, reps: list[dict[str, Any]],
               cfg: StudyConfig) -> dict[str, Any]:
    n = len(reps)
    effects = [r["effect"] for r in reps]
    share_pos = sum(1 for e in effects if e > 0) / n
    share_neg = sum(1 for e in effects if e < 0) / n
    eff = mc_summary(effects)
    gap = mc_summary([r["ceiling_gap"] for r in reps])
    n80_median = n80_median_over_replicates([r["n80"] for r in reps])
    return {
        "block": block,
        **asdict(spec),
        "key": spec.key,
        "replicates": n,
        "effect": eff,
        "share_effect_positive": share_pos,
        "share_effect_negative": share_neg,
        "verdict": verdict(float(eff["mean"]), share_pos, share_neg),
        "ceiling_gap": gap,
        "efficiency": (float(eff["mean"]) / float(gap["mean"])) if float(gap["mean"]) > 1e-9
        else None,
        "mean_A": mc_summary([r["mean_A"] for r in reps]),
        "mean_B": mc_summary([r["mean_B"] for r in reps]),
        "sd_user": mc_summary([r["sd_user"] for r in reps]),
        "n80_median": n80_median,
        "n80_over_grid_max": n80_median is None or n80_median > max(cfg.sens_ns),
        "rejection_rate_at": {
            str(k): sum(1 for r in reps if r["rejects_at"].get(str(k))) / n for k in cfg.sens_ns
        },
        "per_class_effect": {k: mc_summary([r["per_class_effect"][k] for r in reps])
                             for k in CLASSES},
        "growth": mc_summary([r["growth"] for r in reps]),
        "exploration_cost_B": mc_summary([r["exploration_cost_B"] for r in reps]),
        "exploration_cost_A": mc_summary([r["exploration_cost_A"] for r in reps]),
        "final_w_energy": mc_summary([r["final_w_energy"] for r in reps]),
    }


def run_sensitivity(cfg: StudyConfig, *, workers: int = 1) -> dict[str, Any]:
    cells = grid()
    jobs: list[tuple[WorldSpec, StudyConfig, int]] = []
    for idx, (_, spec) in enumerate(cells):
        base = cell_seed_base(cfg, idx)
        jobs.extend((spec, cfg, base + i) for i in range(cfg.sens_replicates))
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_job, jobs, chunksize=4))
    else:
        results = [_job(j) for j in jobs]
    out_cells = []
    for idx, (block, spec) in enumerate(cells):
        reps = results[idx * cfg.sens_replicates:(idx + 1) * cfg.sens_replicates]
        out_cells.append({"index": idx, "seed_base": cell_seed_base(cfg, idx),
                          **_aggregate(block, spec, reps, cfg)})
    return {
        "config": {
            "replicates": cfg.sens_replicates, "n_users": cfg.sens_n_users,
            "ns": list(cfg.sens_ns), "seed_base": cfg.sens_seed_base,
            "cell_seed_stride": cfg.sens_cell_seed_stride, "n_cells": len(cells),
            "days": cfg.e3_runin_days + cfg.e3_phases * cfg.e3_phase_days,
            "win_pp": WIN_PP, "direction_share": DIRECTION_SHARE,
        },
        "mixes": MIXES,
        "pattern": {k: centred_pattern(k) for k in CLASSES},
        "cells": out_cells,
    }
