"""E3 — closed-loop policy study on the ABAB schedule (preregistration §4; File 06 §1.1–§1.2,
§1.5 H1/H4 analogues).

Arm B acts with the service's OWN Stage 2–4 code — `estimates.score_pairs` (Beta-cell mean +
TS-sampled linear score through the blend), `exploration.top_m_buckets` (A_m(x)) and
`exploration.propensity` (p = ε/|A_m(x)|), `energy.apply_reward`, `blend.sgd_step`,
`bandit.update` in the `feedback.py` order. Two things are inlined rather than imported, with
identical semantics: the ε-draw's uniform bucket pick (`draw_experiment` also draws the task,
but the four tasks are identical here — the same `rng.integers(len(top))` call is made) and
the direct method's counterfactual feature swap (`pipeline.dm_model`, imported). Outcomes are
applied in placement order; the service applies same-timestamp tuples in UUID order, which is
arbitrary — only the blend's SGD trajectory is order-dependent. Arm A ranks "earliest
reachable bucket first" (ADR-0008 §2). Both arms carry the ε = 1 slice; both learn from every
outcome; only B acts on what it learned. Stage 5 (CP-SAT) is replaced by sequential greedy
placement, which is the ILP optimum for identical tasks (preregistration §4.1).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np
from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend, sgd_step
from hourwell_recsys.contexts import Bucket, DayType
from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.energy import BetaCell, Posterior, apply_reward, posterior
from hourwell_recsys.estimates import TaskSpec, sample_thetas, score_pairs
from hourwell_recsys.exploration import propensity, top_m_buckets
from hourwell_recsys.feedback import CELL_MEAN_FEATURE
from hourwell_recsys.params import EPSILON, N0_IN_HOURS, N0_OUT_HOURS, TOP_M

from hourwell_training import ope, synthetic
from hourwell_training.pipeline import dm_model
from hourwell_training.simstudy.config import StudyConfig
from hourwell_training.simstudy.stats import mc_summary, paired_tests

__all__ = [
    "DAYPART_CAPACITY",
    "MU0_DEEP",
    "ceilings",
    "heuristic_ranking",
    "make_cells",
    "run_e3",
    "run_replicate",
    "sequences_balanced",
]

CATEGORY = "deep"
DAY_TYPE: DayType = "weekday"
#: hourly slots inside the 09–18 working window, per reachable daypart (preregistration §4.1)
DAYPART_CAPACITY: dict[str, int] = {"MO": 3, "MD": 2, "AF": 3, "EV": 1}
FIRST_START_HOUR: dict[str, int] = {"MO": 9, "MD": 12, "AF": 14, "EV": 17}
BUCKETS: dict[str, Bucket] = {
    "MO": Bucket(Daypart.MO, DAY_TYPE, "fresh"),
    "MD": Bucket(Daypart.MD, DAY_TYPE),
    "AF": Bucket(Daypart.AF, DAY_TYPE, "fresh"),
    "EV": Bucket(Daypart.EV, DAY_TYPE),
}
BUCKET_ID: dict[str, str] = {dp: b.id for dp, b in BUCKETS.items()}
DAYPART_OF: dict[str, str] = {b.id: dp for dp, b in BUCKETS.items()}
ALL_DAYPARTS = ("EM", "MO", "MD", "AF", "EV", "NT")
IN_HOURS: dict[str, bool] = {
    "EM": False, "MO": True, "MD": True, "AF": True, "EV": True, "NT": False,
}
#: File 04 §3.2 — the Deep-work anchor μ₀(class, daypart); category `deep` has γ = 1, δ = 0
MU0_DEEP: dict[str, dict[str, float]] = {
    "EM": {"DM": 0.78, "MM": 0.70, "INT": 0.55, "ME": 0.42, "DE": 0.35},
    "MO": {"DM": 0.74, "MM": 0.72, "INT": 0.66, "ME": 0.55, "DE": 0.48},
    "MD": {"DM": 0.50, "MM": 0.52, "INT": 0.52, "ME": 0.52, "DE": 0.50},
    "AF": {"DM": 0.55, "MM": 0.58, "INT": 0.62, "ME": 0.64, "DE": 0.62},
    "EV": {"DM": 0.40, "MM": 0.48, "INT": 0.58, "ME": 0.68, "DE": 0.72},
    "NT": {"DM": 0.30, "MM": 0.36, "INT": 0.48, "ME": 0.62, "DE": 0.74},
}
PLAN_HOUR = 6
ATTRIBUTION_HOUR, ATTRIBUTION_MINUTE = 23, 55
TASK = TaskSpec(
    task_id="t", category=CATEGORY, value=2, est_minutes=60, duration=4, splittable=False,
    postpone_count=0, deadline_tick=None, earliest_tick=None, pinned_tick=None, critical=False,
)


# ---------------------------------------------------------------------------
# closed-form material (preregistration §4.2)
# ---------------------------------------------------------------------------
def _q(dp: str, klass: str, scale: float) -> float:
    return synthetic.q_true(BUCKET_ID[dp], klass, scale)


def ceilings(scale: float) -> dict[str, Any]:
    """Per class: arm A (MO×3 + MD×1), the oracle (best dayparts by capacity), the gap."""
    per_class: dict[str, dict[str, float]] = {}
    for klass in synthetic.CLASSES:
        qs = {dp: _q(dp, klass, scale) for dp in DAYPART_CAPACITY}
        a = (3 * qs["MO"] + qs["MD"]) / 4
        slots = sorted((qs[dp] for dp in DAYPART_CAPACITY for _ in range(DAYPART_CAPACITY[dp])),
                       reverse=True)[:4]
        o = sum(slots) / 4
        per_class[klass] = {"A": a, "oracle": o, "gap": o - a,
                            "oracle_in_Am_minus_earliest": max(qs.values()) - qs["MO"]}
    n = len(per_class)
    return {
        "per_class": per_class,
        "population": {
            k: sum(v[k] for v in per_class.values()) / n
            for k in ("A", "oracle", "gap", "oracle_in_Am_minus_earliest")
        },
    }


def make_cells(klass: str, prior: str) -> dict[str, BetaCell]:
    """Beta cells for category `deep` × weekday: File 04 §3.2/§3.3 priors (n₀ = 8 in-hours /
    4 out-of-hours) or the flat μ₀ = 0.5, n₀ = 8 setting."""
    out: dict[str, BetaCell] = {}
    for dp in ALL_DAYPARTS:
        n0 = N0_IN_HOURS if IN_HOURS[dp] else N0_OUT_HOURS
        if prior == "informative":
            mu0 = MU0_DEEP[dp][klass]
        elif prior == "flat":
            mu0, n0 = 0.5, N0_IN_HOURS
        else:
            raise ValueError(f"unknown prior setting {prior!r}")
        out[dp] = BetaCell(CATEGORY, dp, DAY_TYPE, alpha0=mu0 * n0, beta0=(1 - mu0) * n0)
    return out


def sequences_balanced(n: int, rng: np.random.Generator) -> list[str]:
    """Blocked randomization (block size 4, ABAB/BABA 1:1 — `randomize_sequences.py`), with a
    balanced tail block so an N that is not a multiple of 4 still splits 1:1 as closely as
    possible (30 → 15/15)."""
    out: list[str] = []
    block = ["ABAB", "ABAB", "BABA", "BABA"]
    while len(out) + 4 <= n:
        b = list(block)
        rng.shuffle(b)
        out.extend(b)
    rest = n - len(out)
    tail = ["ABAB", "BABA"] * 2
    rng.shuffle(tail)
    if rest == 2:
        pair = ["ABAB", "BABA"]
        rng.shuffle(pair)
        out.extend(pair)
    else:
        out.extend(tail[:rest])
    return out


def heuristic_ranking(free: dict[str, int]) -> list[tuple[str, float]]:
    """Arm A: earliest reachable bucket first (score = −first start), buckets with capacity."""
    return [(BUCKET_ID[dp], -float(FIRST_START_HOUR[dp])) for dp in DAYPART_CAPACITY
            if free[dp] > 0]


# ---------------------------------------------------------------------------
# one replicate
# ---------------------------------------------------------------------------
@dataclass
class _User:
    uid: int
    klass: str
    sequence: str
    cells: dict[str, BetaCell]
    state: bandit.LinearState
    blend: Blend = field(default_factory=Blend)


@dataclass(frozen=True)
class _Row:
    uid: int
    klass: str
    day: int
    phase: int  # 0 = run-in, 1..4
    arm: str
    bucket_id: str
    is_experiment: bool
    top_m: tuple[str, ...]
    propensity: float
    reward: float
    x: np.ndarray


def _arm_for(user: _User, day: int, cfg: StudyConfig) -> tuple[str, int]:
    if day < cfg.e3_runin_days:
        return user.sequence[0], 0
    phase = (day - cfg.e3_runin_days) // cfg.e3_phase_days + 1
    return user.sequence[phase - 1], phase


def _score(user: _User, free: dict[str, int], thetas: dict[str, np.ndarray],
           cells_post: dict[tuple[str, str, str], Posterior]) -> dict[str, Any]:
    reachable = {BUCKET_ID[dp]: BUCKETS[dp] for dp in DAYPART_CAPACITY if free[dp] > 0}
    rep_ticks = {TASK.task_id: {bid: FIRST_START_HOUR[DAYPART_OF[bid]] * 4 for bid in reachable}}
    est = score_pairs(
        tasks=[TASK], rep_ticks=rep_ticks, buckets=reachable, cells=cells_post,
        states={CATEGORY: user.state}, thetas=thetas, blend=user.blend, policy="ts",
        preceding_load_minutes=lambda k: 0.0,  # a-priori occupancy is empty (ADR-0007 §4)
    )
    return {bid: est[(TASK.task_id, bid)] for bid in reachable}


def _plan_day(user: _User, arm: str, day: int, phase: int, plan_at: datetime,
              rng: np.random.Generator, scale: float, cfg: StudyConfig,
              q_of: Callable[[str], float] | None = None) -> list[_Row]:
    """One plan-day for one user. `q_of(bucket_id)` overrides the P11 world's completion
    probability (the sensitivity study's world model); the RNG call sequence is identical
    either way, so E3's registered outputs do not change."""
    cells_post: dict[tuple[str, str, str], Posterior] = {
        (CATEGORY, dp, DAY_TYPE): posterior(c, plan_at) for dp, c in user.cells.items()
    }
    thetas = sample_thetas({CATEGORY: user.state}, rng, policy="ts")
    free = dict(DAYPART_CAPACITY)
    rows: list[_Row] = []

    def ranking_of(ests: dict[str, Any]) -> list[tuple[str, float]]:
        if arm == "A":
            return heuristic_ranking(free)
        return [(bid, e.q_hat) for bid, e in ests.items()]

    def place(bid: str, is_exp: bool, top: tuple[str, ...], p: float, x: np.ndarray) -> None:
        free[DAYPART_OF[bid]] -= 1
        q = q_of(bid) if q_of is not None else synthetic.q_true(bid, user.klass, scale)
        reward = float(rng.random() < q)
        rows.append(_Row(user.uid, user.klass, day, phase, arm, bid, is_exp, top, p, reward, x))

    # the ε = 1 slice: one of the (identical) tasks, bucket uniform over the arm's top-m
    ests = _score(user, free, thetas, cells_post)
    top = top_m_buckets(ranking_of(ests), TOP_M)
    drawn = top[int(rng.integers(len(top)))]
    place(drawn, True, top, propensity(EPSILON, len(top)), ests[drawn].features)
    # the remaining tasks: the arm's own greedy choice, re-scored after each placement
    for _ in range(cfg.e3_tasks_per_day - 1):
        ests = _score(user, free, thetas, cells_post)
        best = sorted(ranking_of(ests), key=lambda pair: (-pair[1], pair[0]))[0][0]
        place(best, False, (), 0.0, ests[best].features)
    return rows


def _learn(user: _User, rows: list[_Row], at: datetime) -> None:
    """feedback.py order per tuple: Beta cell, blend step with θ̂ BEFORE the update, bandit."""
    for r in rows:
        dp = DAYPART_OF[r.bucket_id]
        user.cells[dp] = apply_reward(user.cells[dp], r.reward, at)
        user.blend = sgd_step(
            user.blend, float(r.x[CELL_MEAN_FEATURE]), float(r.x @ user.state.theta), r.reward
        )
        user.state = bandit.update(user.state, r.x, r.reward)


def _mae(user: _User, at: datetime, scale: float) -> float:
    return sum(
        abs(posterior(user.cells[dp], at).mean - _q(dp, user.klass, scale))
        for dp in DAYPART_CAPACITY
    ) / len(DAYPART_CAPACITY)


def _ope_on_slice(rows: list[_Row], scale: float) -> list[dict[str, Any]]:
    slice_rows = [
        ope.SliceRow(
            recommendation_id=f"u{r.uid}d{r.day}", bucket_id=r.bucket_id, top_m=r.top_m,
            propensity=r.propensity, reward=r.reward,
            context={"chronotype": r.klass, **{f"x{i}": float(r.x[i]) for i in range(17)}},
        )
        for r in rows if r.is_experiment and r.phase > 0
    ]

    def earliest(r: ope.SliceRow) -> str:
        return sorted(r.top_m, key=lambda b: FIRST_START_HOUR[DAYPART_OF[b]])[0]

    def oracle(r: ope.SliceRow) -> str:
        k = str(r.context["chronotype"])
        return sorted(r.top_m, key=lambda b: (-synthetic.q_true(b, k, scale), b))[0]

    model = dm_model(slice_rows)
    out: list[dict[str, Any]] = []
    for name, det in (("earliest_in_Am", earliest), ("oracle_in_Am", oracle)):
        truth = sum(synthetic.q_true(det(r), str(r.context["chronotype"]), scale)
                    for r in slice_rows) / len(slice_rows)

        def sto(r: ope.SliceRow, b: str, det: Any = det) -> float:
            return 1.0 if b == det(r) else 0.0

        ests = {
            "replay": ope.replay(slice_rows, det),
            "ips": ope.ips(slice_rows, sto),
            "snips": ope.snips(slice_rows, sto),
            "dr": ope.doubly_robust(slice_rows, sto, model),
        }
        for est_name, est in ests.items():
            out.append({"policy": name, "estimator": est_name, "value": est.value,
                        "truth": truth, "error": est.value - truth, "ess": est.ess,
                        "n": est.n, "evidence": est.is_evidence})
    return out


def run_replicate(cfg: StudyConfig, *, scale: float, prior: str, seed: int) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    seqs = sequences_balanced(cfg.e3_n_users, rng)
    users = [
        _User(uid=i, klass=synthetic.CLASSES[i % len(synthetic.CLASSES)], sequence=seqs[i],
              cells=make_cells(synthetic.CLASSES[i % len(synthetic.CLASSES)], prior),
              state=bandit.init_state(CATEGORY))
        for i in range(cfg.e3_n_users)
    ]
    start = date.fromisoformat(cfg.e3_start_iso)
    n_days = cfg.e3_runin_days + cfg.e3_phases * cfg.e3_phase_days
    boundaries = [cfg.e3_runin_days + p * cfg.e3_phase_days for p in range(cfg.e3_phases)]
    mae_at: list[list[float]] = [[] for _ in range(cfg.e3_phases + 1)]
    rows: list[_Row] = []
    weekday = start
    for day in range(n_days):
        while weekday.weekday() >= 5:
            weekday += timedelta(days=1)
        plan_at = datetime(weekday.year, weekday.month, weekday.day, PLAN_HOUR, tzinfo=UTC)
        learn_at = datetime(weekday.year, weekday.month, weekday.day, ATTRIBUTION_HOUR,
                            ATTRIBUTION_MINUTE, tzinfo=UTC)
        if day in boundaries:
            k = boundaries.index(day)
            mae_at[k] = [_mae(u, plan_at, scale) for u in users]
        for u in users:
            arm, phase = _arm_for(u, day, cfg)
            day_rows = _plan_day(u, arm, day, phase, plan_at, rng, scale, cfg)
            _learn(u, day_rows, learn_at)
            rows.extend(day_rows)
        if day == n_days - 1:
            mae_at[-1] = [_mae(u, learn_at, scale) for u in users]
        weekday += timedelta(days=1)

    # --- analysis (preregistration §4.3) ---
    analysed = [r for r in rows if r.phase > 0]

    def user_mean(uid: int, arm: str, phases: tuple[int, ...]) -> float:
        sel = [r.reward for r in analysed if r.uid == uid and r.arm == arm and r.phase in phases]
        return sum(sel) / len(sel)

    a_means = [user_mean(u.uid, "A", (1, 2, 3, 4)) for u in users]
    b_means = [user_mean(u.uid, "B", (1, 2, 3, 4)) for u in users]
    primary = paired_tests(b_means, a_means)
    gaps = [
        (user_mean(u.uid, "B", (3, 4)) - user_mean(u.uid, "A", (3, 4)))
        - (user_mean(u.uid, "B", (1, 2)) - user_mean(u.uid, "A", (1, 2)))
        for u in users
    ]
    growth = paired_tests(gaps, [0.0] * len(gaps))
    per_class: dict[str, float] = {}
    for klass in synthetic.CLASSES:
        vals = [b_means[u.uid] - a_means[u.uid] for u in users if u.klass == klass]
        per_class[klass] = float(np.mean(vals)) if vals else math.nan

    def mean_reward(arm: str, is_exp: bool) -> float:
        sel = [r.reward for r in analysed if r.arm == arm and r.is_experiment == is_exp]
        return sum(sel) / len(sel)

    mae_pop = [float(np.mean(m)) for m in mae_at]
    return {
        "seed": seed,
        "effect": primary.mean_diff,
        "t_p": primary.t_p,
        "wilcoxon_p": primary.wilcoxon_p,
        "rejects": primary.rejects(),
        "wilcoxon_rejects": primary.wilcoxon_rejects(),
        "mean_A": float(np.mean(a_means)),
        "mean_B": float(np.mean(b_means)),
        "per_class_effect": per_class,
        "growth": growth.mean_diff,
        "growth_t_p": growth.t_p,
        "growth_rejects": growth.rejects(),
        "mae_at_boundaries": mae_pop,
        "mae_monotone_decreasing": all(
            later < earlier for earlier, later in zip(mae_pop[:-1], mae_pop[1:], strict=True)
        ),
        "slice_A": mean_reward("A", True),
        "exploited_A": mean_reward("A", False),
        "slice_B": mean_reward("B", True),
        "exploited_B": mean_reward("B", False),
        "final_w_energy": float(np.mean([u.blend.w_energy for u in users])),
        "ope": _ope_on_slice(rows, scale),
        "n_slice_rows": sum(1 for r in analysed if r.is_experiment),
    }


# ---------------------------------------------------------------------------
# all cells
# ---------------------------------------------------------------------------
def _job(args: tuple[StudyConfig, float, str, int]) -> dict[str, Any]:
    cfg, scale, prior, seed = args
    return run_replicate(cfg, scale=scale, prior=prior, seed=seed)


def _aggregate(reps: list[dict[str, Any]], scale: float) -> dict[str, Any]:
    ceil = ceilings(scale)
    n = len(reps)
    ope_keys = [(o["policy"], o["estimator"]) for o in reps[0]["ope"]]
    ope_table = []
    for pol, est in ope_keys:
        vals = [next(o for o in r["ope"] if o["policy"] == pol and o["estimator"] == est)
                for r in reps]
        ope_table.append({
            "policy": pol, "estimator": est,
            "value": mc_summary([v["value"] for v in vals]),
            "truth_mean": float(np.mean([v["truth"] for v in vals])),
            "error": mc_summary([v["error"] for v in vals]),
            "abs_error_max": max(abs(v["error"]) for v in vals if not math.isnan(v["error"])),
            "ess_mean": float(np.mean([v["ess"] for v in vals])),
            "evidence_rate": sum(1 for v in vals if v["evidence"]) / n,
        })
    def _value(r: dict[str, Any], pol: str, est: str) -> float:
        row = next(x for x in r["ope"] if x["policy"] == pol and x["estimator"] == est)
        return float(row["value"])

    gap_est = {
        est: mc_summary([_value(r, "oracle_in_Am", est) - _value(r, "earliest_in_Am", est)
                         for r in reps])
        for est in ("ips", "snips", "dr", "replay")
    }
    return {
        "replicates": n,
        "ceiling": ceil,
        "effect": mc_summary([r["effect"] for r in reps]),
        "efficiency": mc_summary([r["effect"] / ceil["population"]["gap"] for r in reps])
        if ceil["population"]["gap"] > 0 else None,
        "share_effect_positive": sum(1 for r in reps if r["effect"] > 0) / n,
        "rejection_rate_t": sum(1 for r in reps if r["rejects"]) / n,
        "rejection_rate_wilcoxon": sum(1 for r in reps if r["wilcoxon_rejects"]) / n,
        "mean_A": mc_summary([r["mean_A"] for r in reps]),
        "mean_B": mc_summary([r["mean_B"] for r in reps]),
        "per_class_effect": {
            k: mc_summary([r["per_class_effect"][k] for r in reps]) for k in synthetic.CLASSES
        },
        "growth": mc_summary([r["growth"] for r in reps]),
        "share_growth_positive": sum(1 for r in reps if r["growth"] > 0) / n,
        "growth_rejection_rate": sum(1 for r in reps if r["growth_rejects"]) / n,
        "mae_at_boundaries": [
            mc_summary([r["mae_at_boundaries"][k] for r in reps])
            for k in range(len(reps[0]["mae_at_boundaries"]))
        ],
        "share_mae_monotone": sum(1 for r in reps if r["mae_monotone_decreasing"]) / n,
        "slice_A": mc_summary([r["slice_A"] for r in reps]),
        "exploited_A": mc_summary([r["exploited_A"] for r in reps]),
        "slice_B": mc_summary([r["slice_B"] for r in reps]),
        "exploited_B": mc_summary([r["exploited_B"] for r in reps]),
        "exploration_cost_B": mc_summary([r["exploited_B"] - r["slice_B"] for r in reps]),
        "exploration_cost_A": mc_summary([r["exploited_A"] - r["slice_A"] for r in reps]),
        "slice_B_minus_slice_A": mc_summary([r["slice_B"] - r["slice_A"] for r in reps]),
        "final_w_energy": mc_summary([r["final_w_energy"] for r in reps]),
        "n_slice_rows_mean": float(np.mean([r["n_slice_rows"] for r in reps])),
        "ope": ope_table,
        "ope_policy_gap": gap_est,
    }


def run_e3(cfg: StudyConfig, *, workers: int = 1) -> dict[str, Any]:
    cells: dict[str, Any] = {}
    cell_index = 0
    for world_name, scale in cfg.e3_worlds:
        for prior in cfg.e3_prior_settings:
            base = cfg.e3_seed_base + cell_index * cfg.e3_cell_seed_stride
            jobs = [(cfg, scale, prior, base + i) for i in range(cfg.e3_replicates)]
            if workers > 1:
                with ProcessPoolExecutor(max_workers=workers) as pool:
                    reps = list(pool.map(_job, jobs))
            else:
                reps = [_job(j) for j in jobs]
            cells[f"{world_name}/{prior}"] = {
                "world": world_name, "scale": scale, "prior": prior, "seed_base": base,
                **_aggregate(reps, scale),
            }
            cell_index += 1
    return {
        "config": {
            "n_users": cfg.e3_n_users, "tasks_per_day": cfg.e3_tasks_per_day,
            "runin_days": cfg.e3_runin_days, "phase_days": cfg.e3_phase_days,
            "phases": cfg.e3_phases, "replicates": cfg.e3_replicates,
            "start": cfg.e3_start_iso, "top_m": TOP_M,
        },
        "cells": cells,
    }
