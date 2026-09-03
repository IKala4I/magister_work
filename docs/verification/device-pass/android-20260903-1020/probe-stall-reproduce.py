# Run from services/recsys: uv run --no-sync python ../../docs/verification/device-pass/android-20260903-1020/probe-stall-reproduce.py
"""Faithful stall reproduction: the device's 2 Sep 11:38 instance — 15 admin tasks, value 2,
10×30 + 5×45 min, two deadlines, 09–18 working hours, now = 11:38 local, real prior cells,
8 previous assignments from the preceding solve. Records bound/objective per solve."""
import sys, json
from datetime import datetime, timezone, date
sys.path.insert(0, '.')
from tests.conftest import plan_body, task, USER
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.energy import BetaCell
from hourwell_recsys.schemas import PlanRequest
from hourwell_recsys import planner, solver as cpsat
from ortools.sat.python import cp_model

GAP_LIMIT = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
LOG = []
class Rec(cp_model.CpSolverSolutionCallback):
    def __init__(self):
        super().__init__(); self.sols = []
    def on_solution_callback(self):
        self.sols.append((round(self.wall_time, 3), self.objective_value))
class ProbeSolver(cp_model.CpSolver):
    def solve(self, model, callback=None):
        if GAP_LIMIT > 0:
            self.parameters.relative_gap_limit = GAP_LIMIT
        cb = Rec()
        st = super().solve(model, cb)
        name = self.status_name(st)
        ok = name in ("OPTIMAL", "FEASIBLE")
        obj = self.objective_value if ok else None
        bound = self.best_objective_bound if ok else None
        gap = None if obj is None else round((bound - obj) / max(1.0, abs(obj)), 5)
        LOG.append(dict(status=name, wall=round(self.wall_time, 3), obj=obj, bound=bound, gap=gap,
                        t_last=cb.sols[-1][0] if cb.sols else None, n_sols=len(cb.sols),
                        cap=self.parameters.max_time_in_seconds))
        return st
cpsat.cp_model.CpSolver = ProbeSolver  # type: ignore[attr-defined]

dev = json.load(open('docs/verification/device-pass/android-20260903-1020/stall-instance-inputs.json'))
cells = [BetaCell(c['category'], c['daypart'], c['day_type'], alpha0=float(c['alpha0']), beta0=float(c['beta0'])) for c in dev['cells']]
PLAN = date(2026, 9, 2)
NOW = datetime(2026, 9, 2, 8, 38, tzinfo=timezone.utc)
def tasks():
    out = []
    for i, t in enumerate(dev['tasks']):
        dl = None
        if t['deadline']:
            dl = datetime.fromisoformat(t['deadline'].replace(' ', 'T')).astimezone(timezone.utc).isoformat()
        out.append(task(f"t{i:02d}", category=t['category'], est_minutes=int(t['est_minutes']), value=int(t['value']),
                        splittable=bool(t['splittable']), deadline=dl, postpone_count=int(t['postpone_count'] or 0)))
    return out
def body(seed, previous):
    return plan_body(tasks(), plan_date=PLAN.isoformat(), previous_assignments=previous,
                     settings={"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": seed})
repo = InMemoryRepo(); repo.seed_cells(USER, cells)
for seed in range(1, 7):
    r1 = planner.plan(PlanRequest.model_validate(body(seed, [])), repo, now=NOW)
    prev = [{"task_id": a.task_id, "slot_start": a.slot_start, "chunk_index": a.chunk_index} for a in r1.assignments]
    r2 = planner.plan(PlanRequest.model_validate(body(seed + 100, prev)), repo, now=NOW)
    for tag, r in (("fresh", r1), ("replan", r2)):
        print(f"seed {seed:2d} {tag:6s} status={r.solver_status:9s} solve_ms={r.telemetry.solve_ms:5d} recs={len(r.assignments):2d} literals={r.telemetry.literals} obj={r.telemetry.objective}")
print("--- per-solve trajectory ---")
for e in LOG: print(json.dumps(e))
