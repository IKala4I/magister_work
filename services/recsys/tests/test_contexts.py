"""φ bucketing — |C| = 14 (spec-conflicts M3) and the fresh/fatigued rule (specs/07 §3.2.5)."""

from __future__ import annotations

import numpy as np

from hourwell_recsys.contexts import (
    BUCKET_IDS,
    Bucket,
    all_buckets,
    bucket_for_tick,
    bucket_from_id,
    fatigued_ticks,
)
from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.grid import Grid


def test_exactly_fourteen_buckets_with_the_split_on_weekday_mo_af_only() -> None:
    ids = list(BUCKET_IDS)
    assert len(ids) == 14 and len(set(ids)) == 14
    assert {"MO.wd.fresh", "MO.wd.fatigued", "AF.wd.fresh", "AF.wd.fatigued"} <= set(ids)
    assert "MO.we" in ids and "AF.we" in ids and "MO.we.fresh" not in ids
    assert "EM.wd" in ids and "EM.wd.fresh" not in ids
    assert all(bucket_from_id(i).id == i for i in ids)
    assert Bucket(Daypart.AF, "weekday", "fresh").id == "AF.wd.fresh"


def test_fatigue_rule_boundaries(weekday_grid: Grid) -> None:
    occ = np.zeros(weekday_grid.n_ticks, dtype=bool)
    occ[40:46] = True  # 90 min (6 ticks) ending at tick 46
    f = fatigued_ticks(weekday_grid, occ)
    assert f[46] and f[47]  # 0 and 15 min after the run
    assert not f[48]  # 30 min after → fresh
    assert not f[39]
    occ[:] = False
    occ[40:45] = True  # 75 min < 90 → never fatigued
    assert not fatigued_ticks(weekday_grid, occ).any()


def test_bucket_for_tick_uses_wall_clock_and_split(weekday_grid: Grid) -> None:
    fatigued = np.zeros(weekday_grid.n_ticks, dtype=bool)
    fatigued[60] = True

    def bid(k: int) -> str:
        b = bucket_for_tick(weekday_grid, k, fatigued)
        assert b is not None
        return b.id

    assert bid(36) == "MO.wd.fresh"  # 09:00
    assert bid(60) == "AF.wd.fatigued"  # 15:00
    assert bid(50) == "MD.wd"  # 12:30, no split
    assert bucket_for_tick(weekday_grid, 4, fatigued) is None  # 01:00 no daypart


def test_all_buckets_order_is_deterministic() -> None:
    assert [b.id for b in all_buckets()] == list(BUCKET_IDS)
