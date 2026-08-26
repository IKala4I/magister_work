"""Tick grid and F_τ — File 04 §1.2 as written (incl. spec-conflicts L2), DST-safe."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import numpy as np
import pytest

from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.grid import BusyInterval, Grid, build_grid, feasible_starts, in_window
from tests.conftest import PLAN_DATE, WEEKDAY_HOURS


def _kyiv_grid(**kw: Any) -> Grid:
    base: dict[str, Any] = dict(
        plan_date=PLAN_DATE,
        horizon="day",
        timezone="Europe/Kyiv",
        working_hours=WEEKDAY_HOURS,
        sleep_window=(1380, 420),
        busy=[],
    )
    base.update(kw)
    return build_grid(**base)


def test_day_has_96_ticks_and_declared_hours_are_workable() -> None:
    g = _kyiv_grid()
    assert g.n_ticks == 96
    assert int(g.workable.sum()) == 36  # 09:00–18:00 = 9 h = 36 ticks
    assert g.daypart(36) == Daypart.MO  # 09:00 local
    assert g.local_minute[36] == 540
    assert not g.workable[35] and g.workable[36] and g.workable[71] and not g.workable[72]


def test_empty_busy_set_is_a_valid_input() -> None:
    g = _kyiv_grid(busy=[])
    assert not g.occupied.any()
    assert g.workable.any()


@pytest.mark.parametrize(
    ("day", "expected_ticks"),
    [(date(2026, 3, 29), 92), (date(2026, 10, 25), 100), (date(2026, 9, 2), 96)],
)
def test_dst_days_have_92_or_100_ticks_and_hours_follow_the_wall_clock(
    day: date, expected_ticks: int
) -> None:
    g = _kyiv_grid(
        plan_date=day,
        working_hours={k: (540, 1080) for k in WEEKDAY_HOURS}
        | {"sat": (540, 1080), "sun": (540, 1080)},
    )
    assert g.n_ticks == expected_ticks
    assert int(g.workable.sum()) == 36  # 09:00–18:00 is nine wall-clock hours on every day
    first = int(np.flatnonzero(g.workable)[0])
    assert g.local_minute[first] == 540


def test_sleep_window_wraps_midnight() -> None:
    assert in_window(1400, (1380, 420)) and in_window(100, (1380, 420))
    assert not in_window(600, (1380, 420))
    assert in_window(600, (540, 1080)) and not in_window(1080, (540, 1080))


def test_busy_block_removes_ticks_plus_one_buffer_tick_each_side() -> None:
    busy = [
        BusyInterval(
            datetime(2026, 9, 2, 7, 0, tzinfo=UTC), datetime(2026, 9, 2, 8, 30, tzinfo=UTC)
        )
    ]
    g = _kyiv_grid(busy=busy)  # 10:00–11:30 Kyiv = ticks 40..45
    assert g.occupied[40:46].all() and not g.occupied[39] and not g.occupied[46]
    assert not g.workable[39:47].any()  # buffer tick 39 and 46 removed too
    assert g.workable[38] and g.workable[47]


def test_now_cuts_the_past() -> None:
    g = _kyiv_grid(now=datetime(2026, 9, 2, 9, 5, tzinfo=UTC))  # 12:05 Kyiv → first tick 12:15 = 49
    assert not g.workable[:49].any()
    assert g.workable[49]


def test_feasible_starts_formula_verbatim() -> None:
    # W = ticks 0..7 (eight ticks), d = 4, b = 1 → [k, k+5) ⊆ W ⇒ k ≤ 3
    g = _kyiv_grid()
    w = np.zeros(g.n_ticks, dtype=bool)
    w[0:8] = True
    from dataclasses import replace

    gg = replace(g, workable=w)
    assert feasible_starts(gg, duration=4, earliest=None, deadline=None) == [0, 1, 2, 3]
    assert feasible_starts(gg, duration=4, earliest=2, deadline=None) == [2, 3]
    # deadline: k + d ≤ dl; the BUFFER may extend past the deadline (spec-conflicts L2)
    assert feasible_starts(gg, duration=3, earliest=None, deadline=8) == [0, 1, 2, 3, 4]
    assert 4 in feasible_starts(
        gg, duration=3, earliest=None, deadline=7
    )  # 4+3 = 7 ≤ 7, buffer at 7 ∈ W
    assert 5 not in feasible_starts(gg, duration=3, earliest=None, deadline=7)


def test_feasible_starts_reject_gaps_inside_the_window() -> None:
    from dataclasses import replace

    g = _kyiv_grid()
    w = np.zeros(g.n_ticks, dtype=bool)
    w[0:4] = True
    w[5:9] = True  # hole at tick 4
    gg = replace(g, workable=w)
    assert feasible_starts(gg, duration=3, earliest=None, deadline=None) == [0, 5]
