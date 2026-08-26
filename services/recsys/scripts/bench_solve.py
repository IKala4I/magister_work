"""Timing smoke check for NFR-P1's service budget — NOT evidence about the target container.

Runs `plan()` on representative day/week instances and reports CP-SAT solve time and end-to-end
service time on THIS machine. File 04 §1.5 states the 1.5 s cap "on 2 vCPU"; numbers from a
laptop-class CPU say nothing about that environment (CLAUDE.md "Simulator evidence" rule applied
to services). The real-environment measurement is on the verification backlog.

    uv run python scripts/bench_solve.py [--runs 20] [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import time
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

from hourwell_recsys.planner import plan
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.schemas import PlanRequest

TZ = "Europe/Kyiv"
USER = "11111111-1111-1111-1111-111111111111"
PLAN_DATE = date(2026, 9, 7)  # Monday
HOURS = {d: [540, 1080] for d in ("mon", "tue", "wed", "thu", "fri")}
CATS = ("deep", "admin", "physical", "learning")


def _iso(day: date, hh: int, mm: int = 0) -> str:
    return datetime.combine(day, datetime.min.time(), tzinfo=ZoneInfo(TZ)).replace(hour=hh, minute=mm).isoformat()


def instance(kind: str, seed: int) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    days = 1 if kind == "day" else 7
    n_tasks = 12 if kind == "day" else 50
    tasks = []
    for i in range(n_tasks):
        cat = CATS[i % 4]
        est = int(rng.choice([30, 45, 60, 90, 120, 180, 240]))
        deadline = None
        if rng.random() < 0.4:
            dd = PLAN_DATE + timedelta(days=int(rng.integers(0, days)))
            deadline = _iso(dd, int(rng.integers(12, 18)))
        pinned = None
        if i == 3:
            pinned = _iso(PLAN_DATE, 14)
        tasks.append(
            {
                "id": f"t{i}",
                "category": cat,
                "est_minutes": est,
                "deadline": deadline,
                "value": int(rng.integers(1, 4)),
                "splittable": bool(est >= 120 and rng.random() < 0.5),
                "earliest_start": None,
                "pinned_start": pinned,
                "postpone_count": int(rng.integers(0, 3)),
            }
        )
    busy = []
    for d in range(days):
        day = PLAN_DATE + timedelta(days=d)
        if day.weekday() >= 5:
            continue
        for hh in (10, 15) if kind == "day" else (11,):
            busy.append({"start": _iso(day, hh), "end": _iso(day, hh, 45)})
    return {
        "user_id": USER,
        "plan_date": PLAN_DATE.isoformat(),
        "horizon": kind,
        "timezone": TZ,
        "working_hours": HOURS,
        "sleep_window": [1380, 420],
        "busy": busy,
        "tasks": tasks,
        "previous_assignments": [],
        "settings": {"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": seed},
        "arm": "B",
    }


def bench(kind: str, runs: int) -> dict[str, Any]:
    repo = InMemoryRepo()
    solve_ms: list[float] = []
    total_ms: list[float] = []
    literals: list[int] = []
    statuses: dict[str, int] = {}
    degradations: dict[str, int] = {}
    for seed in range(runs):
        req = PlanRequest.model_validate(instance(kind, seed))
        t0 = time.perf_counter()
        resp = plan(req, repo)
        total_ms.append((time.perf_counter() - t0) * 1000)
        solve_ms.append(resp.telemetry.solve_ms)
        literals.append(resp.telemetry.literals)
        statuses[resp.solver_status] = statuses.get(resp.solver_status, 0) + 1
        key = resp.telemetry.degradation or "none"
        degradations[key] = degradations.get(key, 0) + 1

    def p90(xs: list[float]) -> float:
        return float(np.percentile(xs, 90))

    return {
        "instance": kind,
        "runs": runs,
        "tasks": 12 if kind == "day" else 50,
        "solve_ms_median": round(statistics.median(solve_ms), 1),
        "solve_ms_p90": round(p90(solve_ms), 1),
        "solve_ms_max": round(max(solve_ms), 1),
        "total_ms_median": round(statistics.median(total_ms), 1),
        "total_ms_p90": round(p90(total_ms), 1),
        "literals_median": int(statistics.median(literals)),
        "literals_max": max(literals),
        "statuses": statuses,
        "degradation": degradations,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=20)
    ap.add_argument("--json", type=str, default=None)
    args = ap.parse_args()
    env = {
        "machine": platform.machine(),
        "processor": platform.processor() or platform.machine(),
        "cpu_count": os.cpu_count(),
        "python": platform.python_version(),
        "platform": platform.platform(),
        "note": "laptop-class CPU — NOT the 2 vCPU HF Spaces container; see docs/verification",
    }
    results = [bench("day", args.runs), bench("week", args.runs)]
    out = {"environment": env, "results": results}
    print(json.dumps(out, indent=2))
    if args.json:
        with open(args.json, "w") as f:
            json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
