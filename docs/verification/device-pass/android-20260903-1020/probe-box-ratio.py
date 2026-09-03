# Run from services/recsys: uv run --no-sync python ../../docs/verification/device-pass/android-20260903-1020/probe-box-ratio.py
"""Mac/box speed ratio: the sweep's clean full-day instances (n=12: box 61-62 ms OPTIMAL; n=14: box 277-285 ms OPTIMAL)."""
import sys
from datetime import datetime, timezone, date
sys.path.insert(0, '.')
from tests.conftest import plan_body, task, USER, flat_cells
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.schemas import PlanRequest
from hourwell_recsys import planner
CATS = ['admin', 'deep', 'learning', 'physical']; MINS = [30, 45, 60, 30, 90, 45]
PLAN = date(2026, 9, 3); NOW = datetime(2026, 9, 3, 5, 0, tzinfo=timezone.utc)
repo = InMemoryRepo(); repo.seed_cells(USER, flat_cells())
for n in (12, 14):
    ms = []
    for seed in range(1, 6):
        ts = [task(f"t{i:02d}", category=CATS[i % 4], est_minutes=MINS[i % 6], value=(i % 3) + 1) for i in range(n)]
        wh = {d: [540, 1080] for d in ("mon", "tue", "wed", "thu", "fri")}
        r = planner.plan(PlanRequest.model_validate(plan_body(ts, plan_date=PLAN.isoformat(), working_hours=wh, settings={"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": seed})), repo, now=NOW)
        ms.append((r.solver_status[:3], r.telemetry.solve_ms, r.telemetry.literals))
    print(f"n={n} mac:", ms)
