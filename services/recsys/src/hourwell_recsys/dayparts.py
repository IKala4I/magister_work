"""Daypart boundaries for context bucketing φ (specs/04 §3.2).

EM 06-09 · MO 09-12 · MD 12-14 · AF 14-17 · EV 17-20 · NT 20-24.
Hours outside 06-24 belong to no daypart (sleep window; never workable).
"""

from enum import StrEnum


class Daypart(StrEnum):
    EM = "EM"
    MO = "MO"
    MD = "MD"
    AF = "AF"
    EV = "EV"
    NT = "NT"


_BOUNDARIES: list[tuple[int, int, Daypart]] = [
    (6, 9, Daypart.EM),
    (9, 12, Daypart.MO),
    (12, 14, Daypart.MD),
    (14, 17, Daypart.AF),
    (17, 20, Daypart.EV),
    (20, 24, Daypart.NT),
]


def daypart_for_hour(hour: int) -> Daypart | None:
    """Map a local wall-clock hour (0-23) to its daypart, or None outside 06-24."""
    if not 0 <= hour <= 23:
        raise ValueError(f"hour must be in [0, 23], got {hour}")
    for start, end, part in _BOUNDARIES:
        if start <= hour < end:
            return part
    return None
