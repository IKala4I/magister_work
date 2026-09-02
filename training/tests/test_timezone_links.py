"""The training image must resolve legacy IANA ids too (hardware pass, 2026-09-02).

`par.iso_week` (and every local-day computation) calls ZoneInfo on the profile's timezone;
Android profiles carry backward-link ids such as 'Europe/Kiev'. The image is python:3.12-slim
(links only in tzdata-legacy), so the `tzdata` wheel is an unconditional dependency and the
Dockerfile asserts the link at build time. TZPATH is emptied here so the runner's system tzdata
cannot mask a missing wheel.
"""

from __future__ import annotations

import zoneinfo
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest

from hourwell_training.par import iso_week


@pytest.fixture
def no_system_tzpath() -> Iterator[None]:
    zoneinfo.reset_tzpath(to=())
    zoneinfo.ZoneInfo.clear_cache()
    try:
        yield
    finally:
        zoneinfo.reset_tzpath()
        zoneinfo.ZoneInfo.clear_cache()


@pytest.mark.usefixtures("no_system_tzpath")
def test_iso_week_accepts_a_legacy_timezone_id() -> None:
    at = datetime(2026, 9, 2, 8, 0, tzinfo=UTC)  # 11:00 in Kyiv, same local date
    year, week, _ = at.date().isocalendar()
    expected = f"{year}-W{week:02d}"
    assert iso_week(at, "Europe/Kiev") == expected
    assert iso_week(at, "Europe/Kyiv") == expected
