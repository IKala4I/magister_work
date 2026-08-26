"""Cross-language parity fixture for the arm-A edge function (H1 symmetry).

The fixture pins what the TypeScript mirrors in `supabase/functions/_shared/` must reproduce
bit for bit from the SAME request, using the service's OWN preparation step (`planner._prepare`)
so the numbers are exactly what the learned engine logs: the tick grid (n_ticks, origin,
workable set), a-priori occupancy (fixed events ∪ pinned tasks), φ per tick, F_τ per task, the
representative tick k* per (task, bucket) and the 17-feature snapshot evaluated there (flat
prior cells — no evidence yet), the reachable bucket set A(x), and the eligible set of the
ε-draw. `tests/test_grid_parity_fixture.py` asserts the committed file equals a fresh generation;
`grid_parity_test.ts` asserts the Deno modules reproduce it.

CLI: services/recsys/scripts/gen_grid_parity.py
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from hourwell_recsys.energy import posterior
from hourwell_recsys.estimates import sample_thetas
from hourwell_recsys.exploration import ExperimentCandidate, eligible_tasks
from hourwell_recsys.params import EXPERIMENT_MAX_DURATION_TICKS, TICK_MINUTES
from hourwell_recsys.planner import _prepare
from hourwell_recsys.repo import InMemoryRepo
from hourwell_recsys.schemas import PlanRequest

FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "supabase"
    / "functions"
    / "_shared"
    / "testdata"
    / "grid_parity.json"
)

USER_ID = "00000000-0000-4000-8000-00000000f1de"


def _task(
    task_id: str,
    est_minutes: int,
    *,
    category: str = "deep",
    value: int = 2,
    splittable: bool = False,
    postpone_count: int = 0,
    earliest: str | None = None,
    deadline: str | None = None,
    pinned: str | None = None,
) -> dict[str, Any]:
    return {
        "id": task_id,
        "category": category,
        "est_minutes": est_minutes,
        "value": value,
        "splittable": splittable,
        "postpone_count": postpone_count,
        "earliest_start": earliest,
        "deadline": deadline,
        "pinned_start": pinned,
    }


CASES: list[dict[str, Any]] = [
    {
        "name": "kyiv-dst-spring-forward-day",
        "plan_date": "2026-03-29",
        "horizon": "day",
        "timezone": "Europe/Kyiv",
        "working_hours": {"sun": [540, 1080]},
        "sleep_window": [1380, 420],
        "busy": [{"start": "2026-03-29T09:00:00+03:00", "end": "2026-03-29T10:30:00+03:00"}],
        "now": None,
        "tasks": [
            _task("a", 30, category="admin", value=1),
            _task("b", 120, category="learning", splittable=True, postpone_count=3),
            _task(
                "c",
                60,
                value=3,
                earliest="2026-03-29T13:00:00+03:00",
                deadline="2026-03-29T17:00:00+03:00",
            ),
            _task("p", 45, category="physical", pinned="2026-03-29T14:00:00+03:00"),
        ],
    },
    {
        "name": "kyiv-dst-fall-back-week-with-now",
        "plan_date": "2026-10-19",
        "horizon": "week",
        "timezone": "Europe/Kyiv",
        "working_hours": {
            "mon": [540, 1080],
            "tue": [540, 1080],
            "wed": [600, 1020],
            "thu": [540, 1080],
            "fri": [540, 900],
            "sat": [600, 840],
        },
        "sleep_window": [1380, 420],
        "busy": [
            {"start": "2026-10-19T11:00:00+03:00", "end": "2026-10-19T12:45:00+03:00"},
            {"start": "2026-10-22T15:30:00+03:00", "end": "2026-10-22T16:00:00+03:00"},
            {"start": "2026-10-25T09:00:00+02:00", "end": "2026-10-25T11:00:00+02:00"},
        ],
        "now": "2026-10-19T10:20:00+03:00",
        "tasks": [
            _task("a", 45, category="admin", value=1),
            _task("b", 90, value=3, deadline="2026-10-21T18:00:00+03:00"),
            _task("c", 120, category="learning", splittable=True),
            _task("d", 240, value=1, postpone_count=7),
            _task("p", 90, category="physical", value=2, pinned="2026-10-20T09:30:00+03:00"),
        ],
    },
    {
        "name": "new-york-fall-back-day",
        "plan_date": "2026-11-01",
        "horizon": "day",
        "timezone": "America/New_York",
        "working_hours": {"sun": [480, 1200]},
        "sleep_window": None,
        "busy": [],
        "now": None,
        "tasks": [_task("a", 60, category="admin")],
    },
]


def build_case(case: dict[str, Any]) -> dict[str, Any]:
    req = PlanRequest.model_validate(
        {
            "user_id": USER_ID,
            "plan_date": case["plan_date"],
            "horizon": case["horizon"],
            "timezone": case["timezone"],
            "working_hours": case["working_hours"],
            "sleep_window": case["sleep_window"],
            "busy": case["busy"],
            "tasks": case["tasks"],
            "now": case["now"],
        }
    )
    repo = InMemoryRepo()
    read_at = req.now or datetime(2026, 1, 1, tzinfo=UTC)
    cells = {c.key: posterior(c, read_at) for c in repo.load_cells(USER_ID)}
    states = repo.load_bandit(USER_ID)
    thetas = sample_thetas(states, np.random.default_rng(0), policy="linucb")
    prep = _prepare(
        req,
        tick_minutes=TICK_MINUTES,
        cells=cells,
        states=states,
        thetas=thetas,
        blend=repo.load_blend(USER_ID),
    )
    grid = prep.grid
    tasks_out: list[dict[str, Any]] = []
    candidates: list[ExperimentCandidate] = []
    for t in case["tasks"]:
        tid = t["id"]
        if tid in prep.unplaceable and tid not in prep.specs:
            tasks_out.append({"id": tid, "unplaceable": True})
            continue
        s = prep.specs[tid]
        starts = list(prep.starts[tid])
        bucket_ids = sorted({b.id for k in starts if (b := prep.buckets[k]) is not None})
        # every (task, bucket) pair the service scored — chunk-only buckets included
        scored = sorted(b for (x, b) in prep.estimates if x == tid)
        tasks_out.append(
            {
                "id": tid,
                "unplaceable": tid in prep.unplaceable,
                "duration": s.duration,
                "critical": s.critical,
                "earliest_tick": s.earliest_tick,
                "deadline_tick": s.deadline_tick,
                "pinned_tick": s.pinned_tick,
                "feasible_starts": starts,
                "chunk_starts": list(prep.starts_min[tid]),
                "feasible_bucket_ids": bucket_ids,
                "rep_ticks": {b: prep.estimates[(tid, b)].rep_tick for b in scored},
                "features": {
                    b: [float(v) for v in prep.estimates[(tid, b)].features] for b in scored
                },
            }
        )
        if tid not in prep.unplaceable:
            candidates.append(
                ExperimentCandidate(
                    task_id=tid,
                    duration=s.duration,
                    critical=s.critical,
                    pinned=s.pinned_tick is not None,
                    feasible_bucket_ids=tuple(bucket_ids),
                )
            )
    return {
        "input": case,
        "n_ticks": grid.n_ticks,
        "origin": grid.origin.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "tick_minutes": grid.tick_minutes,
        "local_minute": [int(v) for v in grid.local_minute],
        "weekday": [int(v) for v in grid.weekday],
        "day_index": [int(v) for v in grid.day_index],
        "workable": [k for k in range(grid.n_ticks) if grid.workable[k]],
        "occupied": [k for k in range(grid.n_ticks) if prep.occupancy[k]],
        "buckets": [None if b is None else b.id for b in prep.buckets],
        "tasks": tasks_out,
        "eligible": eligible_tasks(candidates, max_duration_ticks=EXPERIMENT_MAX_DURATION_TICKS),
    }


def generate() -> dict[str, Any]:
    _ = uuid.UUID(USER_ID)  # the request validator needs a real uuid
    return {
        "generator": "services/recsys/scripts/gen_grid_parity.py",
        "cases": [build_case(c) for c in CASES],
    }
