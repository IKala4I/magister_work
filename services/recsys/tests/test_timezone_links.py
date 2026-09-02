"""Legacy IANA ids must resolve on every host the service runs on (hardware pass, 2026-09-02).

Android reports backward-link ids — 'Europe/Kiev' for Ukraine, 'Asia/Calcutta', … — and the
service validates `PlanRequest.timezone` with ZoneInfo. python:3.12-slim (Debian ≥ bookworm)
ships those links only in the separate tzdata-legacy package, so every /plan from the Pixel 7a
got 422 → the edge function's `fallback:http` heuristic: the learned engine was unreachable from
a real Ukrainian Android device while the Mac smoke ('Europe/Kyiv') passed. The fix is the
`tzdata` wheel as an unconditional dependency (zoneinfo consults it after TZPATH). These tests
empty TZPATH so a runner's SYSTEM tzdata cannot hide a missing wheel; the Dockerfile repeats the
assertion at image-build time.
"""

from __future__ import annotations

import uuid
import zoneinfo
from collections.abc import Iterator
from datetime import date
from importlib.resources import files

import pytest

from hourwell_recsys.schemas import PlanRequest

LEGACY_IDS = ["Europe/Kiev", "Asia/Calcutta", "America/Buenos_Aires", "Asia/Saigon"]


@pytest.fixture
def no_system_tzpath() -> Iterator[None]:
    zoneinfo.reset_tzpath(to=())
    zoneinfo.ZoneInfo.clear_cache()
    try:
        yield
    finally:
        zoneinfo.reset_tzpath()
        zoneinfo.ZoneInfo.clear_cache()


def test_tzdata_wheel_carries_the_backward_links() -> None:
    root = files("tzdata.zoneinfo")
    assert root.joinpath("Europe/Kiev").is_file()
    assert root.joinpath("Europe/Kyiv").is_file()


@pytest.mark.usefixtures("no_system_tzpath")
@pytest.mark.parametrize("tz", ["Europe/Kyiv", *LEGACY_IDS])
def test_iana_ids_resolve_without_system_tzdata(tz: str) -> None:
    assert zoneinfo.ZoneInfo(tz).key == tz


@pytest.mark.usefixtures("no_system_tzpath")
def test_plan_request_accepts_a_legacy_timezone_id() -> None:
    req = PlanRequest(
        user_id=uuid.uuid4(),
        plan_date=date(2026, 9, 2),
        timezone="Europe/Kiev",
        working_hours={"wed": (540, 1080)},
        tasks=[],
    )
    assert req.timezone == "Europe/Kiev"
