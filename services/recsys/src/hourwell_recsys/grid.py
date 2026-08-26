"""Tick grid, workable set W and a-priori occupancy (File 04 §1.2).

Ticks index *absolute* time from local midnight of `plan_date` in the user's zone, so a DST day
has 92 or 100 ticks and every tick's daypart/working-hours membership is decided on its own
wall-clock minute (no assumption that a day has 96 ticks). W = working hours ∖ (sleep ∪ fixed
events ∪ buffers); ticks before `now` are never workable. The busy set MAY be empty (PLAN
decision 5, UC-01 A2): the MVP runs on self-declared hours alone.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import numpy as np

from hourwell_recsys.dayparts import Daypart, daypart_for_hour
from hourwell_recsys.params import BUFFER_TICKS, TICK_MINUTES

DAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
MINUTES_PER_DAY = 1440
MinuteRange = tuple[int, int]
HORIZON_DAYS: dict[str, int] = {"day": 1, "week": 7}


@dataclass(frozen=True)
class BusyInterval:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class Grid:
    tz: ZoneInfo
    plan_date: date
    horizon_days: int
    tick_minutes: int
    origin: datetime  # UTC instant of local midnight on plan_date
    n_ticks: int
    local_minute: np.ndarray  # wall-clock minute-of-day at each tick start
    weekday: np.ndarray  # 0 = Monday … 6 = Sunday (local)
    day_index: np.ndarray  # 0 … horizon_days-1 (local calendar day offset)
    workable: np.ndarray  # W (bool)
    occupied: np.ndarray  # fixed events (bool) — a-priori occupancy for φ and feature 17

    @property
    def delta(self) -> timedelta:
        return timedelta(minutes=self.tick_minutes)

    def tick_start(self, k: int) -> datetime:
        return self.origin + k * self.delta

    def tick_floor(self, instant: datetime) -> int:
        """Index of the tick containing `instant` (may fall outside [0, n_ticks))."""
        return math.floor((instant.astimezone(UTC) - self.origin) / self.delta)

    def tick_ceil(self, instant: datetime) -> int:
        return math.ceil((instant.astimezone(UTC) - self.origin) / self.delta)

    def daypart(self, k: int) -> Daypart | None:
        return daypart_for_hour(int(self.local_minute[k]) // 60)

    def is_weekend(self, k: int) -> bool:
        return int(self.weekday[k]) >= 5

    def run_lengths(self) -> np.ndarray:
        """R[k] = number of consecutive workable ticks starting at k (0 when k ∉ W)."""
        r = np.zeros(self.n_ticks, dtype=np.int64)
        run = 0
        for k in range(self.n_ticks - 1, -1, -1):
            run = run + 1 if self.workable[k] else 0
            r[k] = run
        return r


def in_window(minute: int, window: MinuteRange) -> bool:
    """Minute-of-day membership in [start, end); end < start means the window wraps midnight."""
    start, end = window
    if start <= end:
        return start <= minute < end
    return minute >= start or minute < end


def build_grid(
    *,
    plan_date: date,
    horizon: str,
    timezone: str,
    working_hours: dict[str, MinuteRange],
    sleep_window: MinuteRange | None,
    busy: list[BusyInterval],
    now: datetime | None = None,
    tick_minutes: int = TICK_MINUTES,
    buffer_ticks: int = BUFFER_TICKS,
) -> Grid:
    tz = ZoneInfo(timezone)
    days = HORIZON_DAYS[horizon]
    origin = datetime.combine(plan_date, time(0), tzinfo=tz).astimezone(UTC)
    end = datetime.combine(plan_date + timedelta(days=days), time(0), tzinfo=tz).astimezone(UTC)
    delta = timedelta(minutes=tick_minutes)
    n = math.ceil((end - origin) / delta)

    local_minute = np.zeros(n, dtype=np.int64)
    weekday = np.zeros(n, dtype=np.int64)
    day_index = np.zeros(n, dtype=np.int64)
    workable = np.zeros(n, dtype=bool)
    for k in range(n):
        local = (origin + k * delta).astimezone(tz)
        m = local.hour * 60 + local.minute
        local_minute[k] = m
        weekday[k] = local.weekday()
        day_index[k] = min(max((local.date() - plan_date).days, 0), days - 1)
        hours = working_hours.get(DAY_KEYS[local.weekday()])
        if hours is None:
            continue
        ws, we = hours
        if not (ws <= m and m + tick_minutes <= we):
            continue
        if sleep_window is not None and in_window(m, sleep_window):
            continue
        if daypart_for_hour(local.hour) is None:
            continue  # 00–06 belongs to no daypart (File 04 §3.2): never workable
        workable[k] = True

    if now is not None:
        first_future = max(0, min(n, math.ceil((now.astimezone(UTC) - origin) / delta)))
        workable[:first_future] = False

    occupied = np.zeros(n, dtype=bool)
    for iv in busy:
        lo = math.floor((iv.start.astimezone(UTC) - origin) / delta)
        hi = math.ceil((iv.end.astimezone(UTC) - origin) / delta)
        lo_c, hi_c = max(lo, 0), min(hi, n)
        if lo_c < hi_c:
            occupied[lo_c:hi_c] = True
        blo, bhi = max(lo - buffer_ticks, 0), min(hi + buffer_ticks, n)
        if blo < bhi:
            workable[blo:bhi] = False

    return Grid(
        tz=tz,
        plan_date=plan_date,
        horizon_days=days,
        tick_minutes=tick_minutes,
        origin=origin,
        n_ticks=n,
        local_minute=local_minute,
        weekday=weekday,
        day_index=day_index,
        workable=workable,
        occupied=occupied,
    )


def feasible_starts(
    grid: Grid,
    *,
    duration: int,
    earliest: int | None,
    deadline: int | None,
    buffer_ticks: int = BUFFER_TICKS,
    run_lengths: np.ndarray | None = None,
) -> list[int]:
    """F_τ = {k : [k, k+d+b) ⊆ W, e_τ ≤ k, k + d ≤ dl_τ} — File 04 §1.2, verbatim.

    The buffer must lie inside W but MAY extend past the deadline (spec-conflicts L2).
    """
    r = grid.run_lengths() if run_lengths is None else run_lengths
    lo = 0 if earliest is None else max(earliest, 0)
    hi = grid.n_ticks if deadline is None else min(deadline - duration, grid.n_ticks)
    need = duration + buffer_ticks
    return [k for k in range(lo, max(hi + 1, lo)) if k < grid.n_ticks and r[k] >= need]
