"""Fallback NL parser (FR-11 server fallback) — durations, deadlines, ambiguity flags."""

from __future__ import annotations

from datetime import datetime

import pytest

from hourwell_recsys.parse_preview import parse_preview
from hourwell_recsys.schemas import ParsePreviewRequest
from tests.conftest import kyiv


def _p(text: str, now: str = kyiv(9)) -> dict:  # type: ignore[type-arg]
    req = ParsePreviewRequest(text=text, timezone="Europe/Kyiv", now=datetime.fromisoformat(now))
    return parse_preview(req).model_dump()


@pytest.mark.parametrize(
    ("text", "minutes"),
    [
        ("write 2h", 120),
        ("call 45 min", 45),
        ("read 1.5 hours", 90),
        ("gym 1h30", 90),
        ("plan", None),
    ],
)
def test_durations(text: str, minutes: int | None) -> None:
    assert _p(text)["est_minutes"] == minutes


def test_deadlines_and_flags() -> None:
    assert _p("draft by fri")["deadline"].date().isoformat() == "2026-09-04"  # Wed → Fri
    assert _p("draft by tomorrow")["deadline"].date().isoformat() == "2026-09-03"
    assert _p("draft by 2026-10-01")["deadline"].date().isoformat() == "2026-10-01"
    r = _p("draft by wed")  # today is Wednesday
    assert (
        r["deadline"].date().isoformat() == "2026-09-02"
        and "bare_weekday_today" in r["ambiguities"]
    )
    assert "deadline_time_of_day" in r["ambiguities"]
    assert _p("draft")["deadline"] is None and _p("draft")["ambiguities"] == []


def test_multiple_tokens_are_flagged() -> None:
    r = _p("a 2h b 3h by mon by tue")
    assert "multiple_durations" in r["ambiguities"] and "multiple_dates" in r["ambiguities"]


def test_title_is_cleaned_and_category_never_guessed() -> None:
    r = _p("  deep work: thesis chapter 2h by fri ")
    assert r["title"] == "deep work: thesis chapter" and r["category_guess"] is None
