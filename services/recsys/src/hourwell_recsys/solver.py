"""Bandit-weighted CP-SAT assignment (File 04 §1.3 objective/constraints, §1.5 implementation).

Encoding (CP-SAT native, ADR-0007 §2):
  (C1) start_τ ∈ Domain(F_τ) (a start-domain variable channelled to the objective through an
       AddElement lookup w_τ = W_τ[start_τ]); presence y_τ; y_τ = 1 when pinned or ε-pinned.
  (C2) NewOptionalIntervalVar(start, d_τ + b, end, y_τ) + AddNoOverlap — the buffer rides inside
       the interval. Fixed events are already outside W (grid), so they need no constraint.
  (C3) splittable τ → chunks j < min(⌊d_τ/d_min⌋, MAX_CHUNKS), size s_j ∈ {0} ∪ [d_min, d_τ],
       chain y_{j+1} ≤ y_j, ordered starts, Σ_j s_j = d_τ·y_τ (all-or-none), containment
       s_j + b ≤ R[start_j] (R = workable run length, AddElement). Chunk weight
       = W_τ[start_j] · s_j / d_τ (ADR-0007 §3).
  (C4) same-category run-length, soft, for capped categories only (deep), written as File 04
       states it: Σ_τ Σ_{k'} |[k',k'+d_τ) ∩ [k,k+L)| x_{τ,k'} ≤ H_g + z_k over start literals of
       unsplit pieces (exact, no reification); the few capped chunks contribute a per-tick
       occupancy occ_t = [start ≤ t] − [end ≤ t] (two reified bools) — exact as well.
  (C5) fragmentation, soft: z^{fr}_τ = #chunks − 1.
Objective (scaled to integers by OBJECTIVE_SCALE):
  max Σ w_τ − λ_d Σ_{crit} M_τ (1 − y_τ) − λ_s Σ z^{sw} − λ_f Σ z^{fr}.
Warm start: AddHint from the previous plan. CP-SAT's hint only seeds the search — it does NOT
keep the hinted solution on objective ties — so the §1.5 anti-thrashing promise ("placements
only move when the objective says it's worth it") is realized by a stability bonus of ONE scaled
unit (1e-4 in weight units, below any meaningful estimate difference) on the hinted start
(ADR-0007 §7). Anytime: max_time_in_seconds, plus two stopping criteria (ADR-0018): CP-SAT's
`relative_gap_limit` and a no-improvement early stop (`_EarlyStop`) for the optimality-proof
stall measured on the owner's real inbox during the hardware pass.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from ortools.sat.python import cp_model

from hourwell_recsys.grid import Grid
from hourwell_recsys.params import (
    BUFFER_TICKS,
    CPSAT_PROBING_LEVEL,
    CPSAT_RELATIVE_GAP_LIMIT,
    CPSAT_SYMMETRY_LEVEL,
    D_MIN_TICKS,
    LAMBDA_D,
    LAMBDA_F,
    LAMBDA_S,
    M_TAU_FACTOR,
    MAX_CHUNKS,
    OBJECTIVE_SCALE,
    RUN_LENGTH_CAPS,
    RUN_LENGTH_L_TICKS,
    SOLVER_NUM_WORKERS,
    SOLVER_STALL_WINDOW_S,
    SOLVER_TIME_CAP_S,
    STABILITY_BONUS_UNITS,
)


@dataclass(frozen=True)
class SolverTask:
    task_id: str
    duration: int  # d_τ in ticks
    value: int  # v_τ ∈ {1,2,3}
    category: str
    splittable: bool
    starts: tuple[int, ...]  # F_τ for the whole duration
    starts_min: tuple[int, ...]  # F_τ evaluated at d_min (chunk starts); () if not splittable
    weights: Mapping[
        int, float
    ]  # w_{τ,k} = v_τ · q̂_{τ,φ(k)} · g(dl_τ − k), k ∈ starts ∪ starts_min
    deadline: int | None = None
    pinned_start: int | None = None
    critical: bool = False
    force_present: bool = False  # ε-experiment pin: y_τ = 1 with `starts` restricted to the bucket
    d_min: int = D_MIN_TICKS  # in ticks of the grid actually solved (1 tick on the 30-min rung)

    @property
    def n_chunks(self) -> int:
        if not self.splittable or self.pinned_start is not None or not self.starts_min:
            return 1
        return max(min(self.duration // self.d_min, MAX_CHUNKS), 1)

    @property
    def uses_chunks(self) -> bool:
        return self.n_chunks >= 2


@dataclass(frozen=True)
class Placement:
    task_id: str
    chunk_index: int
    start: int
    size: int  # ticks of work (buffer excluded)


@dataclass(frozen=True)
class SolveResult:
    status: str
    placements: list[Placement]
    objective: float
    literals: int
    solve_ms: int
    build_ms: int = 0
    run_length_penalty: int = 0
    fragmentation_penalty: int = 0
    hints: int = 0
    deferred_critical: tuple[str, ...] = field(default_factory=tuple)
    # ADR-0018 — search trajectory (why the solve ended when it did)
    early_stop: bool = False  # the no-improvement watchdog ended the search
    n_solutions: int = 0  # improving solutions CP-SAT reported
    last_improvement_ms: int | None = None  # wall time of the last improving solution
    max_improvement_gap_ms: int | None = None  # longest wait between two improvements
    objective_bound: float | None = None  # CP-SAT best bound, weight units
    gap: float | None = None  # |B − O| / max(1, |O|) on the scaled objective (CP-SAT's definition)


class _EarlyStop(cp_model.CpSolverSolutionCallback):
    """No-improvement early stop (ADR-0018): once a solution exists, end the search when no
    better one has arrived for `window_s` seconds. CP-SAT invokes the callback only on improving
    solutions, so a watchdog thread keeps the clock and calls `stop_search()` — asynchronous and
    lock-guarded in ortools 9.15 (docs/versions.md). `window_s=None` disables the watchdog (the
    callback still records the trajectory). Cures the measured proof stall: on symmetric day
    instances the incumbent arrives within tens of milliseconds and the bound never closes
    (relative gap 0.4–1.2 on the reproduced device instance), so `relative_gap_limit` alone never
    fires there."""

    def __init__(self, solver: cp_model.CpSolver, window_s: float | None) -> None:
        super().__init__()
        self._solver = solver
        self._window = window_s
        self._lock = threading.Lock()
        self._done = threading.Event()
        self._last_monotonic: float | None = None
        self._thread = threading.Thread(target=self._watch, name="cpsat-early-stop", daemon=True)
        self.times_s: list[float] = []
        self.stopped = False

    def on_solution_callback(self) -> None:
        with self._lock:
            self._last_monotonic = time.monotonic()
        self.times_s.append(float(self.wall_time))

    def _watch(self) -> None:
        window = self._window
        assert window is not None
        while not self._done.wait(0.01):
            with self._lock:
                last = self._last_monotonic
            if last is not None and time.monotonic() - last >= window:
                self.stopped = True
                self._solver.stop_search()
                return

    def __enter__(self) -> _EarlyStop:
        if self._window is not None:
            self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._done.set()
        if self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def trajectory(self) -> dict[str, Any]:
        times = self.times_s
        gaps = [b - a for a, b in zip(times, times[1:], strict=False)]
        return {
            "early_stop": self.stopped,
            "n_solutions": len(times),
            "last_improvement_ms": int(round(times[-1] * 1000)) if times else None,
            "max_improvement_gap_ms": int(round(max(gaps) * 1000)) if gaps else None,
        }


def m_tau(value: int) -> float:
    """M_τ = M_TAU_FACTOR · v_τ (Appendix A)."""
    return M_TAU_FACTOR * value


def count_literals(tasks: list[SolverTask]) -> int:
    """Σ_τ |F_τ| (× chunks) — the File 04 §1.5 size measure driving the degradation ladder."""
    total = 0
    for t in tasks:
        if t.pinned_start is not None:
            continue
        total += t.n_chunks * len(t.starts_min) if t.uses_chunks else len(t.starts)
    return total


def urgency_multiplier(u_ticks: int | None, gamma_u: float, eta: float) -> float:
    """g(u) = 1 + γ_u e^{−u/η}; g ≡ 1 without a deadline (File 04 §1.2)."""
    if u_ticks is None:
        return 1.0
    return 1.0 + gamma_u * float(np.exp(-u_ticks / eta))


def _scaled(v: float) -> int:
    return int(round(v * OBJECTIVE_SCALE))


def _occupancy_bools(
    model: cp_model.CpModel, start: Any, end: Any, ticks: range, name: str
) -> dict[int, Any]:
    """occ_t = [start ≤ t] − [end ≤ t]; both bools fully reified (end ≥ start ⇒ occ_t ≥ 0)."""
    out: dict[int, Any] = {}
    for t in ticks:
        a = model.new_bool_var(f"a[{name},{t}]")
        model.add(start <= t).only_enforce_if(a)
        model.add(start >= t + 1).only_enforce_if(~a)
        e = model.new_bool_var(f"e[{name},{t}]")
        model.add(end <= t).only_enforce_if(e)
        model.add(end >= t + 1).only_enforce_if(~e)
        out[t] = a - e
    return out


def solve(
    *,
    grid: Grid,
    tasks: list[SolverTask],
    previous: Mapping[tuple[str, int], int] | None = None,
    run_length_caps: Mapping[str, int] = RUN_LENGTH_CAPS,
    run_length_window: int = RUN_LENGTH_L_TICKS,
    lambda_s: float = LAMBDA_S,
    lambda_f: float = LAMBDA_F,
    lambda_d: float = LAMBDA_D,
    buffer_ticks: int = BUFFER_TICKS,
    time_cap_s: float = SOLVER_TIME_CAP_S,
    num_workers: int = SOLVER_NUM_WORKERS,
    seed: int = 0,
    relative_gap_limit: float = CPSAT_RELATIVE_GAP_LIMIT,
    stall_window_s: float | None = SOLVER_STALL_WINDOW_S,
) -> SolveResult:
    previous = previous or {}
    t_build = time.perf_counter()
    model = cp_model.CpModel()
    n = grid.n_ticks
    run_len = [int(v) for v in grid.run_lengths()]
    intervals: list[Any] = []
    objective: list[Any] = []
    penalties_sw: list[Any] = []
    frag_terms: list[Any] = []
    # (C4) window k_w → [(coefficient, literal/expr)] per capped category
    window_terms: dict[str, dict[int, list[tuple[int, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    presence: dict[str, Any] = {}
    starts_of: dict[tuple[str, int], Any] = {}
    sizes_of: dict[tuple[str, int], Any] = {}
    chunk_presence: dict[tuple[str, int], Any] = {}
    hints = 0

    for t in tasks:
        capped = t.category in run_length_caps
        if t.pinned_start is not None:
            k0 = t.pinned_start
            y = model.new_constant(1)
            presence[t.task_id] = y
            starts_of[(t.task_id, 0)] = k0
            sizes_of[(t.task_id, 0)] = t.duration
            chunk_presence[(t.task_id, 0)] = y
            intervals.append(
                model.new_optional_fixed_size_interval_var(
                    k0, t.duration + buffer_ticks, y, f"pin[{t.task_id}]"
                )
            )
            objective.append(_scaled(t.weights.get(k0, 0.0)) * y)
            if capped:
                for k_w in range(k0 - run_length_window + 1, k0 + t.duration):
                    overlap = min(k0 + t.duration, k_w + run_length_window) - max(k0, k_w)
                    if overlap > 0:
                        window_terms[t.category][k_w].append((overlap, y))
            continue

        if not t.uses_chunks:
            table = [0] * n
            for k in t.starts:
                table[k] = _scaled(t.weights[k])
            prev = previous.get((t.task_id, 0))
            hinted = prev if (prev is not None and prev in t.starts) else None
            if hinted is not None:
                table[hinted] += STABILITY_BONUS_UNITS
            y = model.new_bool_var(f"y[{t.task_id}]")
            if t.force_present:
                model.add(y == 1)
            start = model.new_int_var_from_domain(
                cp_model.Domain.from_values(list(t.starts)), f"start[{t.task_id}]"
            )
            if capped:
                # start-domain literals: exact (C4) coefficients need them (File 04 §1.3)
                lits = {k: model.new_bool_var(f"x[{t.task_id},{k}]") for k in t.starts}
                model.add_exactly_one([*lits.values(), ~y])
                for k, lit in lits.items():
                    model.add(start == k).only_enforce_if(lit)
                objective.append(sum(table[k] * lit for k, lit in lits.items()))
                for k, lit in lits.items():
                    for k_w in range(k - run_length_window + 1, k + t.duration):
                        overlap = min(k + t.duration, k_w + run_length_window) - max(k, k_w)
                        if overlap > 0:
                            window_terms[t.category][k_w].append((overlap, lit))
            else:
                lookup = model.new_int_var(0, max(table), f"wlookup[{t.task_id}]")
                model.add_element(start, table, lookup)
                w = model.new_int_var(0, max(table), f"w[{t.task_id}]")
                model.add(w == lookup).only_enforce_if(y)
                model.add(w == 0).only_enforce_if(~y)
                objective.append(w)
            intervals.append(
                model.new_optional_fixed_size_interval_var(
                    start, t.duration + buffer_ticks, y, f"iv[{t.task_id}]"
                )
            )
            presence[t.task_id] = y
            starts_of[(t.task_id, 0)] = start
            sizes_of[(t.task_id, 0)] = t.duration
            chunk_presence[(t.task_id, 0)] = y
            if hinted is not None:
                model.add_hint(start, hinted)
                model.add_hint(y, 1)
                hints += 1
        else:
            n_chunks = t.n_chunks
            ys: list[Any] = []
            starts: list[Any] = []
            sizes: list[Any] = []
            size_domain = cp_model.Domain.from_intervals([[0, 0], [t.d_min, t.duration]])
            wd_table = [0] * n
            for k in t.starts_min:
                wd_table[k] = _scaled(t.weights[k] / t.duration)
            max_wd = max(wd_table)
            for j in range(n_chunks):
                name = f"{t.task_id},{j}"
                y_j = model.new_bool_var(f"y[{name}]")
                s_j = model.new_int_var_from_domain(size_domain, f"s[{name}]")
                model.add(s_j >= t.d_min).only_enforce_if(y_j)
                model.add(s_j == 0).only_enforce_if(~y_j)
                start_j = model.new_int_var_from_domain(
                    cp_model.Domain.from_values(list(t.starts_min)), f"start[{name}]"
                )
                # containment [k, k + s_j + b) ⊆ W via the workable run length at k
                r_j = model.new_int_var(0, max(run_len), f"run[{name}]")
                model.add_element(start_j, run_len, r_j)
                model.add(s_j + buffer_ticks <= r_j).only_enforce_if(y_j)
                if t.deadline is not None:
                    model.add(start_j + s_j <= t.deadline).only_enforce_if(y_j)
                end_j = model.new_int_var(0, n + buffer_ticks, f"end[{name}]")
                intervals.append(
                    model.new_optional_interval_var(
                        start_j, s_j + buffer_ticks, end_j, y_j, f"iv[{name}]"
                    )
                )
                table = list(wd_table)
                prev = previous.get((t.task_id, j))
                if prev is not None and prev in t.starts_min:
                    table[prev] += STABILITY_BONUS_UNITS
                    model.add_hint(start_j, prev)
                    model.add_hint(y_j, 1)
                    hints += 1
                lookup = model.new_int_var(0, max(table), f"wlookup[{name}]")
                model.add_element(start_j, table, lookup)
                term = model.new_int_var(
                    0, max_wd * t.duration + STABILITY_BONUS_UNITS * t.duration, f"term[{name}]"
                )
                model.add_multiplication_equality(term, [lookup, s_j])
                objective.append(term)
                if j > 0:
                    model.add(ys[j - 1] >= y_j)  # chunk chain
                    model.add(
                        start_j >= starts[j - 1] + sizes[j - 1] + buffer_ticks
                    ).only_enforce_if(y_j)
                if capped:
                    lo, hi = min(t.starts_min), min(max(t.starts_min) + t.duration, n)
                    occ = _occupancy_bools(model, start_j, start_j + s_j, range(lo, hi), name)
                    for tick, expr in occ.items():
                        for k_w in range(tick - run_length_window + 1, tick + 1):
                            window_terms[t.category][k_w].append((1, expr))
                ys.append(y_j)
                starts.append(start_j)
                sizes.append(s_j)
                starts_of[(t.task_id, j)] = start_j
                sizes_of[(t.task_id, j)] = s_j
                chunk_presence[(t.task_id, j)] = y_j
            y_tau = ys[0]
            if t.force_present:
                model.add(y_tau == 1)
            model.add(sum(sizes) == t.duration * y_tau)
            presence[t.task_id] = y_tau
            frag_terms.append(sum(ys) - y_tau)  # (C5)

        if t.critical:
            # deferral term only for T_crit (no double counting with v_τ inside w)
            objective.append(-_scaled(lambda_d * m_tau(t.value)) * (1 - presence[t.task_id]))

    model.add_no_overlap(intervals)

    # (C4) soft run-length cap per capped category, one window per possible start k_w
    for category, cap in run_length_caps.items():
        windows = window_terms.get(category)
        if not windows:
            continue
        for k_w in sorted(windows):
            if k_w < 0 or k_w >= n:
                continue
            z = model.new_int_var(0, run_length_window, f"zsw[{category},{k_w}]")
            model.add(sum(coef * lit for coef, lit in windows[k_w]) <= cap + z)
            penalties_sw.append(z)

    total: Any = sum(objective)
    if penalties_sw:
        total = total - _scaled(lambda_s) * sum(penalties_sw)
    if frag_terms:
        total = total - _scaled(lambda_f) * sum(frag_terms)
    model.maximize(total)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_cap_s
    solver.parameters.num_workers = num_workers
    solver.parameters.random_seed = int(seed) % (2**31 - 1)
    solver.parameters.cp_model_probing_level = CPSAT_PROBING_LEVEL
    solver.parameters.symmetry_level = CPSAT_SYMMETRY_LEVEL
    solver.parameters.relative_gap_limit = relative_gap_limit
    t0 = time.perf_counter()
    build_ms = int(round((t0 - t_build) * 1000))
    with _EarlyStop(solver, stall_window_s) as watchdog:
        status = solver.solve(model, watchdog)
    solve_ms = int(round((time.perf_counter() - t0) * 1000))
    name = solver.status_name(status)
    literals = count_literals(tasks)
    trajectory = watchdog.trajectory()
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(
            name, [], 0.0, literals, solve_ms, build_ms=build_ms, hints=hints, **trajectory
        )
    obj_scaled = float(solver.objective_value)
    bound_scaled = float(solver.best_objective_bound)

    placements: list[Placement] = []
    for t in tasks:
        for j in range(t.n_chunks):
            if not solver.value(chunk_presence[(t.task_id, j)]):
                continue
            placements.append(
                Placement(
                    t.task_id,
                    j,
                    int(solver.value(starts_of[(t.task_id, j)])),
                    int(solver.value(sizes_of[(t.task_id, j)])),
                )
            )
    deferred = tuple(
        t.task_id for t in tasks if t.critical and not solver.value(presence[t.task_id])
    )
    return SolveResult(
        status=name,
        placements=placements,
        objective=float(solver.objective_value) / OBJECTIVE_SCALE,
        literals=literals,
        solve_ms=solve_ms,
        build_ms=build_ms,
        run_length_penalty=int(sum(solver.value(z) for z in penalties_sw)),
        fragmentation_penalty=int(sum(solver.value(f) for f in frag_terms)),
        hints=hints,
        deferred_critical=deferred,
        objective_bound=bound_scaled / OBJECTIVE_SCALE,
        gap=abs(bound_scaled - obj_scaled) / max(1.0, abs(obj_scaled)),
        **trajectory,
    )
