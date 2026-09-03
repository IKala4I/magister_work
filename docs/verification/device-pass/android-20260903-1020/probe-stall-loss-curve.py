# Run from services/recsys: uv run --no-sync python ../../docs/verification/device-pass/android-20260903-1020/probe-stall-loss-curve.py
"""Loss curve: from the base (1.0 s cap) trajectories, what objective would a no-improvement
window w have returned, and when? Box slowdown f scales all times by f (window w on the box ≈ w/f here)."""
import sys, json, os
from datetime import datetime, timezone, date
sys.path.insert(0, '.')
from tests.conftest import plan_body, task, USER
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.energy import BetaCell
from hourwell_recsys.schemas import PlanRequest
from hourwell_recsys import planner, solver as cpsat
from ortools.sat.python import cp_model
TRAJ = []
class Rec(cp_model.CpSolverSolutionCallback):
    def __init__(self): super().__init__(); self.sols = []
    def on_solution_callback(self): self.sols.append((self.wall_time, self.objective_value))
class ProbeSolver(cp_model.CpSolver):
    def solve(self, model, callback=None):
        cb = Rec(); st = super().solve(model, cb); TRAJ.append((self.wall_time, cb.sols)); return st
cpsat.cp_model.CpSolver = ProbeSolver
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
for seed in range(1, 13):
    r1 = planner.plan(PlanRequest.model_validate(body(seed, [])), repo, now=NOW)
    prev = [{"task_id": a.task_id, "slot_start": a.slot_start, "chunk_index": a.chunk_index} for a in r1.assignments]
    planner.plan(PlanRequest.model_validate(body(seed + 100, prev)), repo, now=NOW)
json.dump(TRAJ, open('/tmp/traj.json', 'w'))
def stop_at(sols, w):
    """first t where no improvement within (t-w, t]; returns (stop_time, objective_then)."""
    for i, (t, o) in enumerate(sols):
        nxt = sols[i + 1][0] if i + 1 < len(sols) else None
        if nxt is None or nxt - t >= w:
            return t + w, o
    return None, None
print(f"n_solves={len(TRAJ)}; t_last: " + " ".join(f"{s[-1][0]:.2f}" for _, s in TRAJ))
print("window_mac  ~box_w(f=3.5)  mean_stop  max_stop  mean_loss%  max_loss%  n_lossy")
for w in (0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5):
    stops, losses = [], []
    for wall, sols in TRAJ:
        st, o = stop_at(sols, w); final = sols[-1][1]
        st = min(st, wall); stops.append(st); losses.append((final - o) / final * 100)
    print(f"{w:9.3f}  {w*3.5:12.2f}  {sum(stops)/len(stops):9.3f}  {max(stops):8.3f}  {sum(losses)/len(losses):10.2f}  {max(losses):9.2f}  {sum(1 for l in losses if l > 0):7d}")
