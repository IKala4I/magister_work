"""x_{τ,c}: d = 17 in the §3.2.4 order, every component as written."""

from __future__ import annotations

import math

import numpy as np
import pytest

from hourwell_recsys.contexts import Bucket
from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.features import FEATURE_NAMES, decode_cell, feature_vector, urgency_term
from hourwell_recsys.params import ETA_TICKS, FEATURE_DIM


def test_dimension_and_order() -> None:
    assert FEATURE_DIM == 17
    assert FEATURE_NAMES[0] == "intercept"
    assert FEATURE_NAMES[1:7] == tuple(f"daypart_{d}" for d in ("EM", "MO", "MD", "AF", "EV", "NT"))
    assert FEATURE_NAMES[7:] == (
        "is_weekend",
        "rel_fatigued",
        "value_scaled",
        "log_duration_scaled",
        "splittable",
        "urgency",
        "postpone_scaled",
        "cell_mean",
        "cell_sd",
        "preceding_load",
    )


def test_values_as_specified() -> None:
    x = feature_vector(
        bucket=Bucket(Daypart.AF, "weekday", "fatigued"),
        value=3,
        est_minutes=480,
        splittable=True,
        u_ticks=16,
        postpone_count=9,
        cell_mean=0.61,
        cell_sd=0.12,
        preceding_load_minutes=90,
    )
    assert x.shape == (17,)
    assert x[0] == 1.0
    assert x[1:7].tolist() == [0, 0, 0, 1, 0, 0]
    assert x[7] == 0.0 and x[8] == 1.0
    assert x[9] == 1.0  # (3−1)/2
    assert x[10] == pytest.approx(1.0)  # log(480)/log(480)
    assert x[11] == 1.0
    assert x[12] == pytest.approx(math.exp(-16 / ETA_TICKS))
    assert x[13] == 1.0  # capped at 5, /5
    assert x[14] == 0.61 and x[15] == 0.12
    assert x[16] == 0.5  # 90/180


def test_urgency_is_zero_without_deadline() -> None:
    assert urgency_term(None) == 0.0
    assert urgency_term(0) == 1.0


def test_weekend_and_values_scale() -> None:
    x = feature_vector(
        bucket=Bucket(Daypart.MO, "weekend"),
        value=1,
        est_minutes=30,
        splittable=False,
        u_ticks=None,
        postpone_count=2,
        cell_mean=0.4,
        cell_sd=0.2,
        preceding_load_minutes=400,
    )
    assert x[7] == 1.0 and x[8] == 0.0 and x[9] == 0.0 and x[12] == 0.0
    assert x[13] == pytest.approx(0.4)
    assert x[16] == 1.0  # clipped at the 3 h window


def test_decode_cell_round_trips() -> None:
    x = feature_vector(
        bucket=Bucket(Daypart.EV, "weekend"),
        value=2,
        est_minutes=60,
        splittable=False,
        u_ticks=None,
        postpone_count=0,
        cell_mean=0.5,
        cell_sd=0.1,
        preceding_load_minutes=0,
    )
    assert decode_cell(x) == (Daypart.EV, "weekend")
    with pytest.raises(ValueError):
        decode_cell(np.zeros(17))


def test_log_duration_is_clipped_at_one() -> None:
    x = feature_vector(
        bucket=Bucket(Daypart.MO, "weekday", "fresh"),
        value=2,
        est_minutes=600,
        splittable=False,
        u_ticks=None,
        postpone_count=0,
        cell_mean=0.5,
        cell_sd=0.1,
        preceding_load_minutes=0,
    )
    assert x[10] == 1.0
