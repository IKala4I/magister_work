"""Context bucketing φ: daypart × day-type × relative-position class.

Anchors: File 04 §1.2; specs/07 §3.2.5.

|C| = 14: six dayparts × {weekday, weekend} = 12, with the fresh/fatigued split applied ONLY to
weekday MO and AF (spec-conflicts M3). A slot is *fatigued* when ≥90 consecutive occupied
minutes end ≤15 min before it (specs/07 §3.2.5); occupancy known a priori = fixed events ∪
pinned tasks (ADR-0007 §4).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np

from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.grid import Grid
from hourwell_recsys.params import FATIGUE_GAP_MINUTES, FATIGUE_RUN_MINUTES

DayType = Literal["weekday", "weekend"]
Position = Literal["fresh", "fatigued"]
SPLIT_DAYPARTS: frozenset[Daypart] = frozenset({Daypart.MO, Daypart.AF})
DAYPART_ORDER: tuple[Daypart, ...] = (
    Daypart.EM,
    Daypart.MO,
    Daypart.MD,
    Daypart.AF,
    Daypart.EV,
    Daypart.NT,
)


@dataclass(frozen=True, order=True)
class Bucket:
    daypart: Daypart
    day_type: DayType
    position: Position | None = None

    @property
    def id(self) -> str:
        base = f"{self.daypart.value}.{'wd' if self.day_type == 'weekday' else 'we'}"
        return base if self.position is None else f"{base}.{self.position}"

    @property
    def is_weekend(self) -> bool:
        return self.day_type == "weekend"

    @property
    def is_fatigued(self) -> bool:
        return self.position == "fatigued"


def all_buckets() -> list[Bucket]:
    out: list[Bucket] = []
    for day_type in ("weekday", "weekend"):
        for dp in DAYPART_ORDER:
            if day_type == "weekday" and dp in SPLIT_DAYPARTS:
                out.append(Bucket(dp, day_type, "fresh"))
                out.append(Bucket(dp, day_type, "fatigued"))
            else:
                out.append(Bucket(dp, day_type))
    return out


BUCKET_IDS: tuple[str, ...] = tuple(b.id for b in all_buckets())
_BY_ID: dict[str, Bucket] = {b.id: b for b in all_buckets()}


def bucket_from_id(bucket_id: str) -> Bucket:
    try:
        return _BY_ID[bucket_id]
    except KeyError as exc:
        raise ValueError(f"unknown context bucket {bucket_id!r}") from exc


def fatigued_ticks(grid: Grid, occupancy: np.ndarray) -> np.ndarray:
    """fatigued[k] ⇔ an occupied run ≥ FATIGUE_RUN_MINUTES ends ≤ FATIGUE_GAP_MINUTES before k."""
    n = grid.n_ticks
    min_run = math.ceil(FATIGUE_RUN_MINUTES / grid.tick_minutes)
    max_gap = FATIGUE_GAP_MINUTES // grid.tick_minutes
    # run_before[k] = length of the occupied run ending exactly at tick k-1 (inclusive)
    run_before = np.zeros(n + 1, dtype=np.int64)
    for k in range(1, n + 1):
        run_before[k] = run_before[k - 1] + 1 if occupancy[k - 1] else 0
    out = np.zeros(n, dtype=bool)
    for k in range(n):
        for gap in range(0, max_gap + 1):
            e = k - gap
            if e >= 0 and run_before[e] >= min_run:
                out[k] = True
                break
    return out


def bucket_for_tick(grid: Grid, k: int, fatigued: np.ndarray) -> Bucket | None:
    dp = grid.daypart(k)
    if dp is None:
        return None
    day_type: DayType = "weekend" if grid.is_weekend(k) else "weekday"
    if day_type == "weekday" and dp in SPLIT_DAYPARTS:
        return Bucket(dp, day_type, "fatigued" if fatigued[k] else "fresh")
    return Bucket(dp, day_type)


def buckets_for_grid(grid: Grid, occupancy: np.ndarray) -> list[Bucket | None]:
    fatigued = fatigued_ticks(grid, occupancy)
    return [bucket_for_tick(grid, k, fatigued) for k in range(grid.n_ticks)]
