"""Daypart mapping tests against the specs/04 §3.2 table."""

import pytest

from hourwell_recsys.dayparts import Daypart, daypart_for_hour


@pytest.mark.parametrize(
    ("hour", "expected"),
    [
        (6, Daypart.EM),
        (8, Daypart.EM),
        (9, Daypart.MO),
        (11, Daypart.MO),
        (12, Daypart.MD),
        (13, Daypart.MD),
        (14, Daypart.AF),
        (16, Daypart.AF),
        (17, Daypart.EV),
        (19, Daypart.EV),
        (20, Daypart.NT),
        (23, Daypart.NT),
    ],
)
def test_table_boundaries(hour: int, expected: Daypart) -> None:
    assert daypart_for_hour(hour) == expected


@pytest.mark.parametrize("hour", [0, 3, 5])
def test_pre_dawn_hours_have_no_daypart(hour: int) -> None:
    assert daypart_for_hour(hour) is None


@pytest.mark.parametrize("hour", [-1, 24, 99])
def test_out_of_range_hour_rejected(hour: int) -> None:
    with pytest.raises(ValueError, match="hour must be in"):
        daypart_for_hour(hour)
