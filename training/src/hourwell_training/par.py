"""Plan Adherence Rate — the study's primary outcome (File 06 §1.4), pre-registered code.

The Python twin of supabase/functions/_shared/par.ts (spec-conflicts H2): computed from FACTS
(`events`) and PLACEMENTS (`recommendations`) only — never from `feedback_rewards`. The only
constants shared with the reward mapping are PAR_GRACE_MINUTES and PAR_MIN_FRACTION
(tests/test_par.py pins both files' rules to the same hand-computed cases, and a source test
asserts this module touches no reward column).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from hourwell_training.params import PAR_GRACE_MINUTES, PAR_MIN_FRACTION

__all__ = [
    "PAR_SKIPPED_STATUSES",
    "FocusFact",
    "ParBlock",
    "WeeklyPar",
    "par_of_block",
    "weekly_par",
]

#: M-02 displaced rows (no reward, no adherence) and superseded rows never count.
PAR_SKIPPED_STATUSES: frozenset[str] = frozenset({"displaced", "displaced_pending", "expired"})


@dataclass(frozen=True)
class ParBlock:
    id: str
    slot_start: datetime
    slot_end: datetime
    status: str


@dataclass(frozen=True)
class FocusFact:
    """A `focus_end` event's PAR-relevant payload (the whitelist's DERIVED extractions)."""

    recommendation_id: str | None
    started_at: datetime | None
    outcome: str | None  # 'finished' | 'abandoned' | None
    focused_ms: float | None
    planned_minutes: float | None


def par_of_block(block: ParBlock, facts: Iterable[FocusFact]) -> int:
    """File 06 §1.4 per-block rule over the block's own focus_end facts (mirrors par.ts)."""
    planned_minutes_default = max(
        (block.slot_end - block.slot_start).total_seconds() / 60.0, 1.0
    )
    grace = timedelta(minutes=PAR_GRACE_MINUTES)
    focused_ms = 0.0
    planned_override: float | None = None
    for f in facts:
        if f.recommendation_id != block.id or f.started_at is None:
            continue
        if abs(f.started_at - block.slot_start) > grace:
            continue
        if f.outcome == "finished":
            return 1
        if f.focused_ms is not None and f.focused_ms > 0:
            focused_ms += f.focused_ms
        if f.planned_minutes is not None and f.planned_minutes > 0:
            planned_override = f.planned_minutes
    planned = planned_override if planned_override is not None else planned_minutes_default
    return 1 if focused_ms / (planned * 60_000.0) >= PAR_MIN_FRACTION else 0


def iso_week(at: datetime, tz: str) -> str:
    """ISO-8601 week label of the instant's LOCAL date (mirrors par.ts isoWeek)."""
    local = at.astimezone(ZoneInfo(tz))
    year, week, _ = local.date().isocalendar()
    return f"{year}-W{week:02d}"


@dataclass(frozen=True)
class WeeklyPar:
    week: str
    par: float
    n: int


def weekly_par(
    blocks: Sequence[ParBlock],
    facts: Sequence[FocusFact],
    tz: str,
    now: datetime,
    weeks: int = 8,
) -> list[WeeklyPar]:
    """Weekly PAR over blocks whose slot has ended by `now`, most recent `weeks` with at
    least one block, oldest first (mirrors par.ts weeklyPar)."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    acc: dict[str, list[int]] = {}
    for b in blocks:
        if b.status in PAR_SKIPPED_STATUSES or b.slot_end > now:
            continue
        acc.setdefault(iso_week(b.slot_start, tz), []).append(par_of_block(b, facts))
    out = [
        WeeklyPar(week=w, par=round(sum(hits) / len(hits), 3), n=len(hits))
        for w, hits in sorted(acc.items())
    ]
    return out[-weeks:] if weeks > 0 else out
