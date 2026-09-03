# Run from services/recsys: uv run --no-sync python ../../docs/verification/device-pass/android-20260903-1020/probe-stall-configs.py
"""Config sweep on the reproduced stall instance. CONFIG env: base | sym1 | sym2 | sym2p1 | stall<sec> | gap<frac>."""
import sys, json, os, threading, time
from datetime import datetime, timezone, date
sys.path.insert(0, '.')
from tests.conftest import plan_body, task, USER
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.energy import BetaCell
from hourwell_recsys.schemas import PlanRequest
from hourwell_recsys import planner, solver as cpsat
from ortools.sat.python import cp_model

CFG = os.environ.get("CONFIG", "base")
LOG = []
class Rec(cp_model.CpSolverSolutionCallback):
    def __init__(self, solver, window):
        super().__init__(); self.sols = []; self._solver = solver; self._window = window
        self._last = None; self._lock = threading.Lock(); self._done = threading.Event(); self.stopped = False
        self._th = threading.Thread(target=self._watch, daemon=True)
    def on_solution_callback(self):
        with self._lock: self._last = time.monotonic()
        self.sols.append((round(self.wall_time, 3), self.objective_value))
    def _watch(self):
        while not self._done.wait(0.005):
            with self._lock: last = self._last
            if last is not None and time.monotonic() - last >= self._window:
                self.stopped = True; self._solver.stop_search(); return
class ProbeSolver(cp_model.CpSolver):
    def solve(self, model, callback=None):
        window = None
        if CFG.startswith("sym"): self.parameters.symmetry_level = int(CFG[3])
        if "p1" in CFG: self.parameters.cp_model_probing_level = 1
        if CFG.startswith("gap"): self.parameters.relative_gap_limit = float(CFG[3:])
        if CFG.startswith("stall"): window = float(CFG[5:])
        cb = Rec(self, window if window else 1e9)
        if window: cb._th.start()
        st = super().solve(model, cb)
        cb._done.set()
        name = self.status_name(st); ok = name in ("OPTIMAL", "FEASIBLE")
        obj = self.objective_value if ok else None; bound = self.best_objective_bound if ok else None
        gaps = [round(b[0] - a[0], 3) for a, b in zip(cb.sols, cb.sols[1:])]
        LOG.append(dict(status=name, wall=round(self.wall_time, 3), obj=obj, bound=bound,
                        gap=None if obj is None else round((bound - obj) / max(1.0, abs(obj)), 3),
                        t_first=cb.sols[0][0] if cb.sols else None, t_last=cb.sols[-1][0] if cb.sols else None,
                        n_sols=len(cb.sols), max_gap_between=max(gaps) if gaps else None, stopped=cb.stopped))
        return st
cpsat.cp_model.CpSolver = ProbeSolver  # type: ignore[attr-defined]
dev = json.load(open('docs/verification/device-pass/android-20260903-1020/stall-instance-inputs.json'))
cells = [BetaCell(c['category'], c['daypart'], c['day_type'], alpha0=float(c['alpha0']), beta0=float(c['beta0'])) for c in dev['cells']]
PLAN = date(2026, 9, 2); NOW = datetime(2026, 9, 2, 8, 38, tzinfo=timezone.utc)
def tasks():
    out = []
    for i, t in enumerate(dev['tasks']):
        dl = datetime.fromisoformat(t['deadline'].replace(' ', 'T')).astimezone(timezone.utc).isoformat() if t['deadline'] else None
        out.append(task(f"t{i:02d}", category=t['category'], est_minutes=int(t['est_minutes']), value=int(t['value']), deadline=dl))
    return out
def body(seed, previous):
    return plan_body(tasks(), plan_date=PLAN.isoformat(), previous_assignments=previous, settings={"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": seed})
repo = InMemoryRepo(); repo.seed_cells(USER, cells)
rows = []
for seed in range(1, 7):
    r1 = planner.plan(PlanRequest.model_validate(body(seed, [])), repo, now=NOW)
    prev = [{"task_id": a.task_id, "slot_start": a.slot_start, "chunk_index": a.chunk_index} for a in r1.assignments]
    r2 = planner.plan(PlanRequest.model_validate(body(seed + 100, prev)), repo, now=NOW)
    for r in (r1, r2): rows.append((r.solver_status, r.telemetry.solve_ms, r.telemetry.objective))
print(CFG, "| status:solve_ms:obj ->", " ".join(f"{s[:3]}:{ms}:{o}" for s, ms, o in rows))
for e in LOG: print("  ", json.dumps(e))
