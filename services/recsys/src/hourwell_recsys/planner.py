"""/plan orchestration: grid → F_τ → φ → q̂ (one TS sample) → ε-experiment → one CP-SAT solve.

Degradation ladder (File 04 §1.5): |literals| > 4·10⁴ (spec) or > the measured practical
threshold → 30-min granularity; still hot (an UNKNOWN outcome inside the cap) → rolling
day-by-day decomposition. Both are flagged in telemetry.
"""

from __future__ import annotations

import math
import secrets
import time
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any

import numpy as np

from hourwell_recsys import solver as cpsat
from hourwell_recsys.contexts import Bucket, buckets_for_grid
from hourwell_recsys.energy import Posterior, posterior
from hourwell_recsys.estimates import PairEstimate, TaskSpec, sample_thetas, score_pairs
from hourwell_recsys.exploration import (
    ExperimentCandidate,
    ExperimentDraw,
    draw_experiment,
    eligible_tasks,
)
from hourwell_recsys.grid import BusyInterval, Grid, build_grid, feasible_starts
from hourwell_recsys.params import (
    BUFFER_TICKS,
    D_MIN_TICKS,
    DEGRADATION_LITERAL_THRESHOLD,
    EPSILON,
    ETA_TICKS,
    EXPERIMENT_MAX_DURATION_TICKS,
    GAMMA_U,
    MODEL_VERSION,
    PRACTICAL_LITERAL_THRESHOLD,
    PRECEDING_LOAD_WINDOW_MINUTES,
    SOLVER_LADDER_RESERVE_S,
    SOLVER_MIN_SLICE_S,
    SOLVER_TIME_CAP_S,
    TICK_MINUTES,
    TOP_M,
)
from hourwell_recsys.rationale import choose_rationale
from hourwell_recsys.repo import Repo
from hourwell_recsys.schemas import (
    Assignment,
    Infeasible,
    PlanRequest,
    PlanResponse,
    Telemetry,
    TradeOffOption,
    Unplaced,
)


class PlanSettingsMismatch(ValueError):
    """The request's ε/m differ from the service constants — a config bug that would put an
    unlogged propensity on the row (H1 requires identical ε, m in both arms)."""


@dataclass(frozen=True)
class _Prepared:
    grid: Grid
    buckets: list[Bucket | None]
    occupancy: np.ndarray
    specs: dict[str, TaskSpec]
    starts: dict[str, tuple[int, ...]]
    starts_min: dict[str, tuple[int, ...]]
    estimates: dict[tuple[str, str], PairEstimate]
    solver_tasks: list[cpsat.SolverTask]
    unplaceable: list[str]

    @property
    def literals(self) -> int:
        return cpsat.count_literals(self.solver_tasks)


def _duration_ticks(est_minutes: int, tick_minutes: int) -> int:
    return max(1, math.ceil(est_minutes / tick_minutes))


def _urgency_u(deadline_tick: int | None, k: int) -> int | None:
    return None if deadline_tick is None else deadline_tick - k


def _prepare(
    req: PlanRequest,
    *,
    tick_minutes: int,
    cells: dict[tuple[str, str, str], Posterior],
    states: dict[str, Any],
    thetas: dict[str, np.ndarray],
    blend: Any,
) -> _Prepared:
    grid = build_grid(
        plan_date=req.plan_date,
        horizon=req.horizon,
        timezone=req.timezone,
        working_hours={str(k): v for k, v in req.working_hours.items()},
        sleep_window=req.sleep_window,
        busy=[BusyInterval(b.start, b.end) for b in req.busy],
        now=req.now,
        tick_minutes=tick_minutes,
    )
    n = grid.n_ticks
    d_min = max(1, math.ceil(D_MIN_TICKS * TICK_MINUTES / tick_minutes))
    specs: dict[str, TaskSpec] = {}
    unplaceable: list[str] = []
    occupancy = grid.occupied.copy()
    for t in req.tasks:
        d = _duration_ticks(t.est_minutes, tick_minutes)
        deadline_tick = None if t.deadline is None else grid.tick_floor(t.deadline)
        earliest_tick = None if t.earliest_start is None else grid.tick_ceil(t.earliest_start)
        pinned_tick = None if t.pinned_start is None else grid.tick_floor(t.pinned_start)
        if pinned_tick is not None and not (0 <= pinned_tick < n):
            unplaceable.append(t.id)
            continue
        if deadline_tick is not None and deadline_tick < 0:
            unplaceable.append(t.id)
            continue
        critical = pinned_tick is not None or (deadline_tick is not None and deadline_tick <= n)
        specs[t.id] = TaskSpec(
            task_id=t.id,
            category=t.category,
            value=t.value,
            est_minutes=t.est_minutes,
            duration=d,
            splittable=t.splittable,
            postpone_count=t.postpone_count,
            deadline_tick=deadline_tick,
            earliest_tick=earliest_tick,
            pinned_tick=pinned_tick,
            critical=critical,
        )
        if pinned_tick is not None:
            occupancy[pinned_tick : min(pinned_tick + d, n)] = True

    buckets = buckets_for_grid(grid, occupancy)
    run_len = grid.run_lengths()
    starts: dict[str, tuple[int, ...]] = {}
    starts_min: dict[str, tuple[int, ...]] = {}
    rep_ticks: dict[str, dict[str, int]] = {}
    for tid, s in specs.items():
        if s.pinned_tick is not None:
            b = buckets[s.pinned_tick]
            starts[tid] = (s.pinned_tick,)
            starts_min[tid] = ()
            rep_ticks[tid] = {} if b is None else {b.id: s.pinned_tick}
            continue
        full = tuple(
            feasible_starts(
                grid,
                duration=s.duration,
                earliest=s.earliest_tick,
                deadline=s.deadline_tick,
                run_lengths=run_len,
            )
        )
        chunked: tuple[int, ...] = ()
        if s.splittable and s.duration >= 2 * d_min:
            chunked = tuple(
                feasible_starts(
                    grid,
                    duration=d_min,
                    earliest=s.earliest_tick,
                    deadline=s.deadline_tick,
                    run_lengths=run_len,
                )
            )
        starts[tid] = full
        starts_min[tid] = chunked
        reps: dict[str, int] = {}
        for k in sorted(set(full) | set(chunked)):
            b = buckets[k]
            if b is not None and b.id not in reps:
                reps[b.id] = k
        rep_ticks[tid] = reps
        if not full and not chunked:
            unplaceable.append(tid)

    window_ticks = max(1, PRECEDING_LOAD_WINDOW_MINUTES // tick_minutes)

    def preceding_load(k: int) -> float:
        return float(occupancy[max(k - window_ticks, 0) : k].sum()) * tick_minutes

    bucket_by_id = {b.id: b for b in buckets if b is not None}
    estimates = score_pairs(
        tasks=list(specs.values()),
        rep_ticks=rep_ticks,
        buckets=bucket_by_id,
        cells=cells,
        states=states,
        thetas=thetas,
        blend=blend,
        policy=req.settings.policy,
        preceding_load_minutes=preceding_load,
    )

    solver_tasks: list[cpsat.SolverTask] = []
    for tid, s in specs.items():
        weights: dict[int, float] = {}
        for k in set(starts[tid]) | set(starts_min[tid]):
            b = buckets[k]
            if b is None:
                continue
            est = estimates[(tid, b.id)]
            weights[k] = (
                s.value
                * est.q_hat
                * cpsat.urgency_multiplier(_urgency_u(s.deadline_tick, k), GAMMA_U, ETA_TICKS)
            )
        if s.pinned_tick is not None and s.pinned_tick not in weights:
            weights[s.pinned_tick] = 0.0
        usable_full = tuple(k for k in starts[tid] if k in weights)
        usable_min = tuple(k for k in starts_min[tid] if k in weights)
        if s.pinned_tick is None and not usable_full and not usable_min:
            if tid not in unplaceable:
                unplaceable.append(tid)
            continue
        solver_tasks.append(
            cpsat.SolverTask(
                task_id=tid,
                duration=s.duration,
                value=s.value,
                category=s.category,
                splittable=s.splittable,
                starts=usable_full,
                starts_min=usable_min,
                weights=weights,
                deadline=s.deadline_tick,
                pinned_start=s.pinned_tick,
                critical=s.critical,
            )
        )
    return _Prepared(
        grid, buckets, occupancy, specs, starts, starts_min, estimates, solver_tasks, unplaceable
    )


def _apply_experiment(
    tasks: list[cpsat.SolverTask], draw: ExperimentDraw, buckets: list[Bucket | None]
) -> list[cpsat.SolverTask]:
    out = []
    for t in tasks:
        if t.task_id != draw.task_id:
            out.append(t)
            continue
        in_bucket = tuple(
            k
            for k in t.starts
            if buckets[k] is not None and buckets[k].id == draw.bucket_id  # type: ignore[union-attr]
        )
        # the experiment is a single placement (one M-01 row): solved unsplit inside the bucket
        out.append(replace(t, starts=in_bucket, starts_min=(), force_present=True))
    return out


def _solve_with_ladder(
    prep: _Prepared,
    *,
    previous: dict[tuple[str, int], int],
    seed: int,
    degradation: str | None,
    budget_s: float,
) -> tuple[cpsat.SolveResult, str | None, int]:
    """One rung of the ladder under a plan-level time budget (File 04 §1.5 anytime cap)."""
    tasks = prep.solver_tasks
    if degradation != "day_by_day":
        res = cpsat.solve(
            grid=prep.grid,
            tasks=tasks,
            previous=previous,
            seed=seed,
            time_cap_s=max(budget_s, SOLVER_MIN_SLICE_S),
        )
        return res, degradation, 1
    grid = prep.grid
    remaining = list(tasks)
    placements: list[cpsat.Placement] = []
    total_ms = 0
    build_ms = 0
    literals = 0
    hints = 0
    statuses: list[str] = []
    objective = 0.0
    per_day = max(budget_s / grid.horizon_days, SOLVER_MIN_SLICE_S)
    for day in range(grid.horizon_days):
        day_ticks = {int(k) for k in np.flatnonzero(grid.day_index == day)}
        day_tasks = []
        for t in remaining:
            if t.pinned_start is not None:
                if t.pinned_start in day_ticks:
                    day_tasks.append(t)
                continue
            s_full = tuple(k for k in t.starts if k in day_ticks)
            s_min = tuple(k for k in t.starts_min if k in day_ticks)
            if s_full or s_min:
                day_tasks.append(
                    replace(
                        t,
                        starts=s_full,
                        starts_min=s_min,
                        force_present=t.force_present and bool(s_full),
                    )
                )
        if not day_tasks:
            continue
        res = cpsat.solve(
            grid=grid, tasks=day_tasks, previous=previous, seed=seed + day, time_cap_s=per_day
        )
        statuses.append(res.status)
        total_ms += res.solve_ms
        build_ms += res.build_ms
        literals += res.literals
        hints += res.hints
        objective += res.objective
        placements.extend(res.placements)
        placed = {p.task_id for p in res.placements}
        remaining = [t for t in remaining if t.task_id not in placed]
    status = "INFEASIBLE" if "INFEASIBLE" in statuses else ("FEASIBLE" if statuses else "OPTIMAL")
    deferred = tuple(t.task_id for t in remaining if t.critical)
    return (
        cpsat.SolveResult(
            status,
            placements,
            objective,
            literals,
            total_ms,
            build_ms=build_ms,
            hints=hints,
            deferred_critical=deferred,
        ),
        "day_by_day",
        max(len(statuses), 1),
    )


def _options(prep: _Prepared, result: cpsat.SolveResult) -> Infeasible | None:
    """FR-24 trade-off options for every critical task the plan could not honour — deferred by
    the solver OR without any feasible start — ranked by estimated utility loss."""
    options: list[TradeOffOption] = []
    if result.status == "INFEASIBLE":
        for t in prep.solver_tasks:
            if t.pinned_start is not None:
                options.append(
                    TradeOffOption(
                        kind="unpin",
                        task_id=t.task_id,
                        consequence={"metric": "pinned_conflict", "value": 1.0},
                    )
                )
    unhonoured = list(result.deferred_critical) + [
        tid for tid in prep.unplaceable if tid in prep.specs and prep.specs[tid].critical
    ]
    for tid in dict.fromkeys(unhonoured):
        s = prep.specs[tid]
        best_q = max(
            (e.q_hat for (t_id, _), e in prep.estimates.items() if t_id == tid), default=0.0
        )
        options.append(
            TradeOffOption(
                kind="drop",
                task_id=tid,
                consequence={"metric": "value_forfeited", "value": round(s.value * best_q, 3)},
            )
        )
        # shrink: smallest duration cut that yields a feasible start
        run_len = prep.grid.run_lengths()
        for d_new in range(s.duration - 1, 0, -1):
            if feasible_starts(
                prep.grid,
                duration=d_new,
                earliest=s.earliest_tick,
                deadline=s.deadline_tick,
                run_lengths=run_len,
            ):
                delta = (s.duration - d_new) * prep.grid.tick_minutes
                options.append(
                    TradeOffOption(
                        kind="shrink",
                        task_id=tid,
                        delta_minutes=delta,
                        consequence={
                            "metric": "est_completion_drop",
                            "value": round(best_q * (s.duration - d_new) / s.duration, 3),
                        },
                    )
                )
                break
        if s.deadline_tick is not None:
            later = feasible_starts(
                prep.grid,
                duration=s.duration,
                earliest=s.earliest_tick,
                deadline=None,
                run_lengths=run_len,
            )
            if later:
                slip = (later[0] + s.duration - s.deadline_tick) * prep.grid.tick_minutes
                options.append(
                    TradeOffOption(
                        kind="move_past_deadline",
                        task_id=tid,
                        delta_minutes=max(slip, 0),
                        consequence={
                            "metric": "deadline_slip_minutes",
                            "value": float(max(slip, 0)),
                        },
                    )
                )
    if not options:
        return None
    options.sort(key=lambda o: float(o.consequence["value"]))
    return Infeasible(options=options)


def _draw(prep: _Prepared, req: PlanRequest, rng: np.random.Generator) -> ExperimentDraw | None:
    """ε-experiment on the grid actually solved (File 04 §1.4; M2)."""

    def bucket_ids_of(tid: str) -> tuple[str, ...]:
        ids = {b.id for k in prep.starts[tid] if (b := prep.buckets[k]) is not None}
        return tuple(sorted(ids))

    candidates = [
        ExperimentCandidate(
            task_id=tid,
            duration=s.duration,
            critical=s.critical,
            pinned=s.pinned_tick is not None,
            feasible_bucket_ids=bucket_ids_of(tid),
        )
        for tid, s in prep.specs.items()
        if tid not in prep.unplaceable
    ]
    max_exp_ticks = max(1, (EXPERIMENT_MAX_DURATION_TICKS * TICK_MINUTES) // prep.grid.tick_minutes)
    eligible = eligible_tasks(candidates, m=req.settings.top_m, max_duration_ticks=max_exp_ticks)
    rankings = {
        tid: [(b, e.q_hat) for (t_id, b), e in prep.estimates.items() if t_id == tid]
        for tid in eligible
    }
    return draw_experiment(
        rng,
        eligible=eligible,
        rankings=rankings,
        epsilon=req.settings.epsilon,
        m=req.settings.top_m,
    )


def plan(req: PlanRequest, repo: Repo, *, now: datetime | None = None) -> PlanResponse:
    if req.settings.epsilon != EPSILON or req.settings.top_m != TOP_M:
        raise PlanSettingsMismatch(
            f"settings.epsilon/top_m must equal the service constants ({EPSILON}, {TOP_M})"
        )
    user_id = str(req.user_id)
    seed = req.settings.seed if req.settings.seed is not None else secrets.randbits(63)
    rng = np.random.default_rng(seed)
    read_at = req.now or now or datetime.now(UTC)

    cells = {c.key: posterior(c, read_at) for c in repo.load_cells(user_id)}
    states = repo.load_bandit(user_id)
    blend = repo.load_blend(user_id)
    thetas = sample_thetas(states, rng, policy=req.settings.policy)  # ONE sample per plan

    t_start = time.perf_counter()
    preps: dict[int, _Prepared] = {}

    def prepared(tick: int) -> _Prepared:
        if tick not in preps:
            preps[tick] = _prepare(
                req, tick_minutes=tick, cells=cells, states=states, thetas=thetas, blend=blend
            )
        return preps[tick]

    def too_big(p: _Prepared) -> bool:
        return p.literals > min(DEGRADATION_LITERAL_THRESHOLD, PRACTICAL_LITERAL_THRESHOLD)

    rungs: list[tuple[int, str | None]] = [(TICK_MINUTES, None), (2 * TICK_MINUTES, "coarse_30min")]
    if req.horizon == "week":
        rungs.append((2 * TICK_MINUTES, "day_by_day"))
    rung = 0
    if too_big(prepared(TICK_MINUTES)):
        rung = 1
        if req.horizon == "week" and too_big(prepared(2 * TICK_MINUTES)):
            rung = 2

    previous_raw = [(pa.task_id, pa.chunk_index, pa.slot_start) for pa in req.previous_assignments]
    solves = 0
    experiment_dropped = False
    spent_s = 0.0
    while True:
        remaining = SOLVER_TIME_CAP_S - spent_s
        if rung + 1 < len(rungs):  # keep a slice for the next rung in case this one is "hot"
            remaining = max(remaining - SOLVER_LADDER_RESERVE_S, SOLVER_MIN_SLICE_S)
        tick, degradation = rungs[rung]
        prep = prepared(tick)
        previous: dict[tuple[str, int], int] = {}
        for tid, ci, slot_start in previous_raw:
            k = prep.grid.tick_floor(slot_start)
            if 0 <= k < prep.grid.n_ticks:
                previous[(tid, ci)] = k
        draw = _draw(prep, req, rng)
        tasks = (
            prep.solver_tasks
            if draw is None
            else _apply_experiment(prep.solver_tasks, draw, prep.buckets)
        )
        result, degradation, n = _solve_with_ladder(
            replace(prep, solver_tasks=tasks),
            previous=previous,
            seed=seed,
            degradation=degradation,
            budget_s=remaining,
        )
        solves += n
        spent_s += result.solve_ms / 1000.0
        if result.status == "UNKNOWN" and rung + 1 < len(rungs):
            rung += 1  # "still hot" → next rung of the ladder
            continue
        if draw is not None and (
            result.status == "INFEASIBLE"
            or (
                result.status != "UNKNOWN"
                and draw.task_id not in {p.task_id for p in result.placements}
            )
        ):
            experiment_dropped = True
            draw = None
            result, degradation, n = _solve_with_ladder(
                prep,
                previous=previous,
                seed=seed,
                degradation=degradation,
                budget_s=SOLVER_TIME_CAP_S - spent_s,
            )
            solves += n
            spent_s += result.solve_ms / 1000.0
        break

    exp_propensity = None if draw is None else draw.propensity
    assignments: list[Assignment] = []
    placed: set[str] = set()
    by_task: dict[str, list[cpsat.Placement]] = defaultdict(list)
    for p in result.placements:
        by_task[p.task_id].append(p)
    for tid, pls in by_task.items():
        s = prep.specs[tid]
        for p in sorted(pls, key=lambda q: q.chunk_index):
            b = prep.buckets[p.start]
            assert b is not None
            est = prep.estimates[(tid, b.id)]
            is_exp = draw is not None and draw.task_id == tid
            cat_means = [
                post.mean
                for (g, _, dt), post in cells.items()
                if g == s.category and dt == b.day_type
            ]
            u = _urgency_u(s.deadline_tick, p.start)
            key, params = choose_rationale(
                category=s.category,
                bucket=b,
                pinned=s.pinned_tick is not None,
                is_experiment=is_exp,
                urgency=float(est.features[12]),
                cell_mean=est.cell_mean,
                category_mean=float(np.mean(cat_means)) if cat_means else 0.0,
                n_effective=cells[(s.category, b.daypart.value, b.day_type)].n_effective,
                is_earliest=bool(prep.starts[tid]) and p.start == min(prep.starts[tid]),
                hours_to_deadline=None if u is None else u * prep.grid.tick_minutes / 60.0,
            )
            assignments.append(
                Assignment(
                    task_id=tid,
                    chunk_index=p.chunk_index,
                    slot_start=prep.grid.tick_start(p.start),
                    slot_end=prep.grid.tick_start(p.start + p.size),
                    context_bucket=b.id,
                    q_hat=round(est.q_hat, 4),
                    confidence=round(est.confidence, 4),
                    rationale_key=key,
                    rationale_params=params,
                    is_experiment=is_exp,
                    propensity=exp_propensity if is_exp else None,
                    features=[float(v) for v in est.features],
                )
            )
        placed.add(tid)
    assignments.sort(key=lambda a: (a.slot_start, a.task_id, a.chunk_index))

    unplaced: list[Unplaced] = []
    for t in req.tasks:
        if t.id in placed:
            continue
        if t.id in prep.unplaceable:
            unplaced.append(Unplaced(task_id=t.id, reason="no_feasible_start"))
        elif result.status == "INFEASIBLE":
            unplaced.append(Unplaced(task_id=t.id, reason="infeasible"))
        else:
            unplaced.append(Unplaced(task_id=t.id, reason="deferred"))

    return PlanResponse(
        model_version=MODEL_VERSION,
        solver_status=result.status,
        assignments=assignments,
        unplaced=unplaced,
        infeasible=_options(prep, result),
        telemetry=Telemetry(
            solve_ms=result.solve_ms,
            literals=result.literals,
            degradation=degradation,  # type: ignore[arg-type]
            rng_seed=seed,
            policy=req.settings.policy,
            experiment_drawn=draw is not None,
            experiment_dropped=experiment_dropped,
            n_ticks=prep.grid.n_ticks,
            tick_minutes=prep.grid.tick_minutes,
            objective=round(result.objective, 4),
            hints=result.hints,
            run_length_penalty=result.run_length_penalty,
            fragmentation_penalty=result.fragmentation_penalty,
            solves=solves,
            build_ms=result.build_ms,
            total_ms=int(round((time.perf_counter() - t_start) * 1000)),
        ),
    )


__all__ = ["BUFFER_TICKS", "PlanSettingsMismatch", "plan"]
