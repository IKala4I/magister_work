"""Shared fixtures: flat priors, a representative weekday grid, request builders."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from hourwell_recsys.contexts import DAYPART_ORDER
from hourwell_recsys.energy import BetaCell
from hourwell_recsys.grid import Grid, build_grid
from hourwell_recsys.repo import CATEGORIES, DAY_TYPES, InMemoryRepo

USER = "11111111-1111-1111-1111-111111111111"
OTHER_USER = "22222222-2222-2222-2222-222222222222"
WEEKDAY_HOURS = {d: (540, 1080) for d in ("mon", "tue", "wed", "thu", "fri")}  # 09:00–18:00
PLAN_DATE = date(2026, 9, 2)  # a Wednesday, no DST transition


def flat_cells(mu0: float = 0.5, n0: float = 8.0, prior_version: int = 0) -> list[BetaCell]:
    return [
        BetaCell(
            g, dp.value, dt, alpha0=mu0 * n0, beta0=(1 - mu0) * n0, prior_version=prior_version
        )
        for g in CATEGORIES
        for dt in DAY_TYPES
        for dp in DAYPART_ORDER
    ]


@pytest.fixture
def repo() -> InMemoryRepo:
    r = InMemoryRepo()
    r.seed_cells(USER, flat_cells())
    return r


@pytest.fixture
def weekday_grid() -> Grid:
    return build_grid(
        plan_date=PLAN_DATE,
        horizon="day",
        timezone="Europe/Kyiv",
        working_hours=WEEKDAY_HOURS,
        sleep_window=(1380, 420),
        busy=[],
    )


def task(
    tid: str,
    *,
    category: str = "admin",
    est_minutes: int = 60,
    value: int = 2,
    deadline: str | None = None,
    splittable: bool = False,
    earliest_start: str | None = None,
    pinned_start: str | None = None,
    postpone_count: int = 0,
) -> dict[str, Any]:
    return {
        "id": tid,
        "category": category,
        "est_minutes": est_minutes,
        "deadline": deadline,
        "value": value,
        "splittable": splittable,
        "earliest_start": earliest_start,
        "pinned_start": pinned_start,
        "postpone_count": postpone_count,
    }


def plan_body(tasks: list[dict[str, Any]], **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "user_id": USER,
        "plan_date": PLAN_DATE.isoformat(),
        "horizon": "day",
        "timezone": "Europe/Kyiv",
        "working_hours": {k: list(v) for k, v in WEEKDAY_HOURS.items()},
        "sleep_window": [1380, 420],
        "busy": [],
        "tasks": tasks,
        "previous_assignments": [],
        "settings": {"epsilon": 1.0, "top_m": 4, "policy": "ts", "seed": 1},
        "arm": "B",
    }
    body.update(overrides)
    return body


def kyiv(hh: int, mm: int = 0, day: date = PLAN_DATE) -> str:
    return f"{day.isoformat()}T{hh:02d}:{mm:02d}:00+03:00"


def utcnow() -> datetime:
    return datetime.now(UTC)
