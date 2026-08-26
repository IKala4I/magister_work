"""Regenerate the cross-language parity fixture for the arm-A edge function (H1 symmetry).

The fixture pins what the TypeScript mirrors in `supabase/functions/_shared/` must reproduce
bit for bit from the SAME request: the tick grid (n_ticks, origin, workable set, a-priori
occupancy), φ per tick, F_τ per task, the reachable bucket set A(x) per task and the eligible
task set of the ε-draw. `tests/test_grid_parity_fixture.py` asserts the committed file equals
a fresh generation; `grid_parity_test.ts` asserts the Deno modules reproduce it.

CLI: services/recsys/scripts/gen_grid_parity.py
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from hourwell_recsys.contexts import buckets_for_grid
from hourwell_recsys.exploration import ExperimentCandidate, eligible_tasks
from hourwell_recsys.grid import BusyInterval, build_grid, feasible_starts
from hourwell_recsys.params import EXPERIMENT_MAX_DURATION_TICKS, TICK_MINUTES

FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "supabase"
    / "functions"
    / "_shared"
    / "testdata"
    / "grid_parity.json"
)

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
            {"id": "a", "est_minutes": 30, "earliest": None, "deadline": None, "critical": False},
            {"id": "b", "est_minutes": 120, "earliest": None, "deadline": None, "critical": False},
            {
                "id": "c",
                "est_minutes": 60,
                "earliest": "2026-03-29T13:00:00+03:00",
                "deadline": "2026-03-29T17:00:00+03:00",
                "critical": True,
            },
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
            {"id": "a", "est_minutes": 45, "earliest": None, "deadline": None, "critical": False},
            {
                "id": "b",
                "est_minutes": 90,
                "earliest": None,
                "deadline": "2026-10-21T18:00:00+03:00",
                "critical": True,
            },
            {"id": "c", "est_minutes": 120, "earliest": None, "deadline": None, "critical": False},
            {"id": "d", "est_minutes": 240, "earliest": None, "deadline": None, "critical": False},
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
        "tasks": [
            {"id": "a", "est_minutes": 60, "earliest": None, "deadline": None, "critical": False},
        ],
    },
]


def _dt(s: str | None) -> datetime | None:
    return None if s is None else datetime.fromisoformat(s)


def build_case(case: dict[str, Any]) -> dict[str, Any]:
    grid = build_grid(
        plan_date=datetime.fromisoformat(case["plan_date"]).date(),
        horizon=case["horizon"],
        timezone=case["timezone"],
        working_hours={k: (v[0], v[1]) for k, v in case["working_hours"].items()},
        sleep_window=None if case["sleep_window"] is None else tuple(case["sleep_window"]),
        busy=[BusyInterval(_dt(b["start"]), _dt(b["end"])) for b in case["busy"]],  # type: ignore[arg-type]
        now=_dt(case["now"]),
    )
    buckets = buckets_for_grid(grid, grid.occupied)
    run_len = grid.run_lengths()
    tasks_out: list[dict[str, Any]] = []
    candidates: list[ExperimentCandidate] = []
    for t in case["tasks"]:
        duration = max(1, -(-t["est_minutes"] // TICK_MINUTES))
        earliest = None if t["earliest"] is None else grid.tick_ceil(_dt(t["earliest"]))  # type: ignore[arg-type]
        deadline = None if t["deadline"] is None else grid.tick_floor(_dt(t["deadline"]))  # type: ignore[arg-type]
        starts = feasible_starts(
            grid, duration=duration, earliest=earliest, deadline=deadline, run_lengths=run_len
        )
        bucket_ids = sorted({b.id for k in starts if (b := buckets[k]) is not None})
        tasks_out.append(
            {
                "id": t["id"],
                "duration": duration,
                "earliest_tick": earliest,
                "deadline_tick": deadline,
                "feasible_starts": starts,
                "feasible_bucket_ids": bucket_ids,
            }
        )
        candidates.append(
            ExperimentCandidate(
                task_id=t["id"],
                duration=duration,
                critical=t["critical"],
                pinned=False,
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
        "occupied": [k for k in range(grid.n_ticks) if grid.occupied[k]],
        "buckets": [None if b is None else b.id for b in buckets],
        "tasks": tasks_out,
        "eligible": eligible_tasks(candidates, max_duration_ticks=EXPERIMENT_MAX_DURATION_TICKS),
    }


def generate() -> dict[str, Any]:
    return {
        "generator": "services/recsys/scripts/gen_grid_parity.py",
        "cases": [build_case(c) for c in CASES],
    }
