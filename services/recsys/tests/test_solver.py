"""CP-SAT model against File 04 §1.3 as written: (C1)–(C5), the objective's criticality-only
deferral term, urgency multiplier, buffers, AddHint, literal count."""

from __future__ import annotations

import math
from dataclasses import replace

import numpy as np
import pytest

from hourwell_recsys import solver as cpsat
from hourwell_recsys.grid import Grid
from hourwell_recsys.params import ETA_TICKS, GAMMA_U, M_TAU_FACTOR


def _grid(weekday_grid: Grid, workable: list[int]) -> Grid:
    w = np.zeros(weekday_grid.n_ticks, dtype=bool)
    w[workable] = True
    return replace(weekday_grid, workable=w)


def _task(
    tid: str,
    grid: Grid,
    d: int,
    *,
    value: int = 1,
    category: str = "admin",
    q: float = 0.5,
    deadline: int | None = None,
    earliest: int | None = None,
    splittable: bool = False,
    pinned: int | None = None,
    critical: bool = False,
    weights: dict[int, float] | None = None,
) -> cpsat.SolverTask:
    from hourwell_recsys.grid import feasible_starts

    full = tuple(feasible_starts(grid, duration=d, earliest=earliest, deadline=deadline))
    mn = (
        tuple(feasible_starts(grid, duration=2, earliest=earliest, deadline=deadline))
        if splittable
        else ()
    )
    w = weights or {
        k: value * q for k in set(full) | set(mn) | ({pinned} if pinned is not None else set())
    }
    return cpsat.SolverTask(
        task_id=tid,
        duration=d,
        value=value,
        category=category,
        splittable=splittable,
        starts=full,
        starts_min=mn,
        weights=w,
        deadline=deadline,
        pinned_start=pinned,
        critical=critical,
    )


def _spans(res: cpsat.SolveResult, buffer: int = 1) -> list[tuple[int, int]]:
    return sorted((p.start, p.start + p.size + buffer) for p in res.placements)


def _no_overlap(spans: list[tuple[int, int]]) -> bool:
    return all(spans[i][1] <= spans[i + 1][0] for i in range(len(spans) - 1))


def test_c2_no_overlap_including_buffers(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 8)))  # 8 workable ticks
    tasks = [_task(t, g, 2) for t in ("a", "b", "c")]  # each needs 2 + 1 buffer = 3 → only two fit
    res = cpsat.solve(grid=g, tasks=tasks, num_workers=1)
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert len(res.placements) == 2
    assert _no_overlap(_spans(res))
    g8 = _grid(weekday_grid, list(range(0, 9)))  # 3 + 3 + 3 = 9 → all three fit
    res = cpsat.solve(grid=g8, tasks=[_task(t, g8, 2) for t in ("a", "b", "c")], num_workers=1)
    assert len(res.placements) == 3 and _no_overlap(_spans(res))


def test_deadline_respected_and_buffer_may_cross_it(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 9)))
    t = _task(
        "a", g, 3, deadline=7, weights={k: 0.1 * (k + 1) for k in range(0, 5)}
    )  # later = better
    res = cpsat.solve(grid=g, tasks=[t], num_workers=1)
    (p,) = res.placements
    assert p.start + p.size <= 7  # k + d ≤ dl
    assert p.start == 4  # buffer tick 7 lies past the deadline but inside W — allowed (L2)


def test_pinned_task_is_present_at_its_tick_and_others_avoid_it(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 12)))
    pinned = _task("p", g, 3, pinned=3)  # occupies [3, 6) + buffer tick 6
    other = _task("o", g, 3)
    res = cpsat.solve(grid=g, tasks=[pinned, other], num_workers=1)
    by = {p.task_id: p for p in res.placements}
    assert by["p"].start == 3
    assert _no_overlap(_spans(res))
    assert by["o"].start >= 7  # [0, 4) would overlap the pinned interval


def test_c3_splittable_chunks_cover_the_duration_with_d_min(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 4)) + list(range(6, 10)))  # two runs of four ticks
    # v = 3 so the split (weight 1.5 − λ_f 0.5) beats not scheduling; with v = 1 and q̂ = 0.5 the
    # Appendix A λ_f = 0.5 exactly cancels the task's weight — a documented default consequence
    t = _task("s", g, 6, value=3, splittable=True)  # cannot fit unsplit (needs 7)
    res = cpsat.solve(grid=g, tasks=[t], num_workers=1)
    assert len(res.placements) == 2
    assert sum(p.size for p in res.placements) == 6
    assert all(p.size >= 2 for p in res.placements)
    assert _no_overlap(_spans(res))
    assert res.fragmentation_penalty == 1


def test_c5_fragmentation_penalty_keeps_a_splittable_task_whole_when_possible(
    weekday_grid: Grid,
) -> None:
    g = _grid(weekday_grid, list(range(0, 12)))
    t = _task("s", g, 6, splittable=True)
    res = cpsat.solve(grid=g, tasks=[t], num_workers=1)
    assert len(res.placements) == 1 and res.placements[0].size == 6
    assert res.fragmentation_penalty == 0


def test_deferral_penalty_applies_only_to_critical_tasks(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 5)))  # room for exactly one 4-tick task
    cheap_critical = _task("crit", g, 4, value=1, critical=True)
    rich = _task("rich", g, 4, value=3, critical=False)
    res = cpsat.solve(grid=g, tasks=[cheap_critical, rich], num_workers=1)
    assert [p.task_id for p in res.placements] == ["crit"]  # M_τ = 10·v outweighs the value gap
    assert res.deferred_critical == ()
    both_plain = [replace(cheap_critical, critical=False), rich]
    res2 = cpsat.solve(grid=g, tasks=both_plain, num_workers=1)
    assert [p.task_id for p in res2.placements] == ["rich"]  # no deferral term ⇒ value decides
    assert res2.objective == pytest.approx(3 * 0.5)
    assert res.objective == pytest.approx(1 * 0.5)  # a placed critical task pays no penalty


def test_m_tau_and_urgency_formulas() -> None:
    assert cpsat.m_tau(3) == M_TAU_FACTOR * 3
    assert cpsat.urgency_multiplier(None, GAMMA_U, ETA_TICKS) == 1.0
    assert cpsat.urgency_multiplier(0, GAMMA_U, ETA_TICKS) == pytest.approx(1 + GAMMA_U)
    assert cpsat.urgency_multiplier(16, GAMMA_U, ETA_TICKS) == pytest.approx(
        1 + GAMMA_U * math.exp(-1)
    )


def test_c4_run_length_cap_is_soft_and_only_for_capped_categories(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 20)))
    deep = [_task(t, g, 4, category="deep") for t in ("d1", "d2", "d3")]
    res = cpsat.solve(grid=g, tasks=deep, num_workers=1, run_length_caps={"deep": 8})
    assert len(res.placements) == 3
    occ = np.zeros(20, dtype=int)
    for p in res.placements:
        occ[p.start : p.start + p.size] = 1
    assert max(int(occ[k : k + 12].sum()) for k in range(0, 9)) <= 8
    assert res.run_length_penalty == 0
    tight = _grid(
        weekday_grid, list(range(0, 15))
    )  # 4+1+4+1+4 = 14 → any full placement breaks the cap
    res_t = cpsat.solve(
        grid=tight,
        tasks=[_task(t, tight, 4, category="deep", value=3, q=1.0) for t in ("d1", "d2", "d3")],
        num_workers=1,
        run_length_caps={"deep": 8},
    )
    assert len(res_t.placements) == 3 and res_t.run_length_penalty > 0  # soft: pays, still places
    res_off = cpsat.solve(grid=tight, tasks=deep, num_workers=1, run_length_caps={})
    assert res_off.run_length_penalty == 0


def test_add_hint_keeps_the_previous_placement_on_ties(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 12)))
    t = _task("a", g, 2)  # uniform weights → every start ties
    res = cpsat.solve(grid=g, tasks=[t], previous={("a", 0): 6}, num_workers=1)
    assert res.hints == 1
    assert res.placements[0].start == 6
    # a real objective gain (≫ 1e-4) still moves the placement
    better = replace(t, weights={k: (0.9 if k == 2 else 0.5) for k in t.starts})
    res2 = cpsat.solve(grid=g, tasks=[better], previous={("a", 0): 6}, num_workers=1)
    assert res2.placements[0].start == 2


def _stall_tasks(grid: Grid, n: int = 15) -> list[cpsat.SolverTask]:
    """The owner's real 2 Sep inbox shape (ADR-0018): interchangeable admin tasks — equal value,
    two durations, per-tick weights that differ by tick but not by task. CP-SAT finds the incumbent
    at once and never proves it optimal inside the cap (relative bound gap ≫ 1 %)."""
    from hourwell_recsys.grid import feasible_starts

    out = []
    for i in range(n):
        d = 3 if i % 3 == 2 else 2
        full = tuple(feasible_starts(grid, duration=d, earliest=None, deadline=None))
        w = {k: 2 * (0.35 + 0.3 * ((k * 7919) % 17) / 17) for k in full}
        out.append(
            cpsat.SolverTask(
                task_id=f"t{i:02d}",
                duration=d,
                value=2,
                category="admin",
                splittable=False,
                starts=full,
                starts_min=(),
                weights=w,
                deadline=None,
                pinned_start=None,
                critical=False,
            )
        )
    return out


def test_no_improvement_early_stop_ends_the_proof_stall(weekday_grid: Grid) -> None:
    """ADR-0018 §2: a solution exists, none better for the window → the search ends well before
    the cap, and the reported gap shows why the gap limit alone could not have ended it."""
    res = cpsat.solve(
        grid=weekday_grid, tasks=_stall_tasks(weekday_grid), time_cap_s=1.5, stall_window_s=0.15
    )
    assert res.status == "FEASIBLE" and res.placements
    assert res.early_stop and res.n_solutions >= 1
    assert res.last_improvement_ms is not None and res.last_improvement_ms <= res.solve_ms + 20
    assert res.solve_ms < 1200  # ended by the window, not by the 1.5 s cap
    assert res.gap is not None and res.gap > 0.01  # the bound did not close


def test_early_stop_disabled_runs_the_stall_to_the_cap(weekday_grid: Grid) -> None:
    res = cpsat.solve(
        grid=weekday_grid, tasks=_stall_tasks(weekday_grid), time_cap_s=0.4, stall_window_s=None
    )
    assert res.status == "FEASIBLE" and not res.early_stop
    assert res.solve_ms >= 350  # the cap, as before ADR-0018


def test_tight_instance_reports_a_closed_gap_without_early_stop(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 12)))
    res = cpsat.solve(grid=g, tasks=[_task("a", g, 2), _task("b", g, 3)], num_workers=1)
    assert res.status == "OPTIMAL" and not res.early_stop and res.n_solutions >= 1
    assert res.gap is not None and res.gap <= 0.01  # ADR-0018 §1: OPTIMAL under the gap limit
    assert res.objective_bound is not None
    assert abs(res.objective_bound - res.objective) <= 0.01 * max(1.0, abs(res.objective))


def test_count_literals_is_sum_of_feasible_starts(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 12)))
    a = _task("a", g, 2)  # 12 − 3 + 1 = 10 starts
    s = _task("s", g, 4, splittable=True)  # 2 chunks × |F(d_min)| = 2 × 10
    assert cpsat.count_literals([a]) == 10
    assert cpsat.count_literals([s]) == 20
    assert cpsat.count_literals([replace(a, pinned_start=0)]) == 0


def test_infeasible_when_pinned_tasks_collide(weekday_grid: Grid) -> None:
    g = _grid(weekday_grid, list(range(0, 10)))
    res = cpsat.solve(
        grid=g, tasks=[_task("p1", g, 3, pinned=2), _task("p2", g, 3, pinned=3)], num_workers=1
    )
    assert res.status == "INFEASIBLE" and res.placements == []
