"""Feature vector x_{τ,c}, d = 17, in the exact order of specs/07 §3.2.4."""

from __future__ import annotations

import math

import numpy as np

from hourwell_recsys.contexts import DAYPART_ORDER, Bucket, DayType
from hourwell_recsys.dayparts import Daypart
from hourwell_recsys.params import (
    ETA_TICKS,
    FEATURE_DIM,
    LOG_DURATION_REF_MINUTES,
    POSTPONE_CAP,
    PRECEDING_LOAD_WINDOW_MINUTES,
)

FEATURE_NAMES: tuple[str, ...] = (
    "intercept",
    "daypart_EM",
    "daypart_MO",
    "daypart_MD",
    "daypart_AF",
    "daypart_EV",
    "daypart_NT",
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
assert len(FEATURE_NAMES) == FEATURE_DIM


def urgency_term(u_ticks: int | None, eta: float = ETA_TICKS) -> float:
    """e^{−u/η} with u = ticks to deadline; 0 when the task has no deadline (§3.2.4 row 13)."""
    if u_ticks is None:
        return 0.0
    return math.exp(-max(u_ticks, 0) / eta)


def feature_vector(
    *,
    bucket: Bucket,
    value: int,
    est_minutes: int,
    splittable: bool,
    u_ticks: int | None,
    postpone_count: int,
    cell_mean: float,
    cell_sd: float,
    preceding_load_minutes: float,
) -> np.ndarray:
    x = np.zeros(FEATURE_DIM, dtype=np.float64)
    x[0] = 1.0
    x[1 + DAYPART_ORDER.index(bucket.daypart)] = 1.0
    x[7] = 1.0 if bucket.is_weekend else 0.0
    x[8] = 1.0 if bucket.is_fatigued else 0.0
    x[9] = (value - 1) / 2.0
    x[10] = math.log(max(est_minutes, 1)) / math.log(LOG_DURATION_REF_MINUTES)
    x[11] = 1.0 if splittable else 0.0
    x[12] = urgency_term(u_ticks)
    x[13] = min(postpone_count, POSTPONE_CAP) / POSTPONE_CAP
    x[14] = cell_mean
    x[15] = cell_sd
    x[16] = (
        min(preceding_load_minutes, PRECEDING_LOAD_WINDOW_MINUTES) / PRECEDING_LOAD_WINDOW_MINUTES
    )
    return x


def decode_cell(features: np.ndarray) -> tuple[Daypart, DayType]:
    """Recover the Beta cell (daypart, day-type) a feedback tuple belongs to from its snapshot.

    The snapshot is the exact vector the bandit scored, so the one-hot block is authoritative.
    """
    if features.shape != (FEATURE_DIM,):
        raise ValueError(f"expected {FEATURE_DIM} features, got {features.shape}")
    onehot = features[1:7]
    hits = np.flatnonzero(np.isclose(onehot, 1.0))
    if len(hits) != 1 or not np.allclose(np.delete(onehot, hits), 0.0):
        raise ValueError("daypart one-hot block is not a valid one-hot")
    day_type: DayType = "weekend" if np.isclose(features[7], 1.0) else "weekday"
    return DAYPART_ORDER[int(hits[0])], day_type
