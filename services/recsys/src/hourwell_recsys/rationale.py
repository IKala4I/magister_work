"""Closed rationale vocabulary (FR-21; specs/07 §7 "closed vocabularies"). The client renders the
sentence from the key + params; no free text crosses the boundary.
"""

from __future__ import annotations

from typing import Any

from hourwell_recsys.contexts import Bucket
from hourwell_recsys.params import ENERGY_PEAK_FACTOR, URGENCY_RATIONALE_THRESHOLD

RATIONALE_KEYS: tuple[str, ...] = (
    "pinned",
    "experiment",
    "deadline_pressure",
    "energy_peak",
    "fresh_slot",
    "earliest_feasible",
    "best_available",
)


def choose_rationale(
    *,
    category: str,
    bucket: Bucket,
    pinned: bool,
    is_experiment: bool,
    urgency: float,
    cell_mean: float,
    category_mean: float,
    n_effective: float,
    is_earliest: bool,
    hours_to_deadline: float | None,
) -> tuple[str, dict[str, Any]]:
    daypart = bucket.daypart.value
    if pinned:
        return "pinned", {}
    if is_experiment:
        return "experiment", {"category": category, "daypart": daypart}
    if urgency >= URGENCY_RATIONALE_THRESHOLD and hours_to_deadline is not None:
        return "deadline_pressure", {"hours_to_deadline": round(hours_to_deadline, 1)}
    if category_mean > 0 and cell_mean / category_mean >= ENERGY_PEAK_FACTOR:
        return "energy_peak", {
            "category": category,
            "daypart": daypart,
            "factor": round(cell_mean / category_mean, 2),
            "n_effective": round(n_effective, 1),
        }
    if bucket.position == "fresh":
        return "fresh_slot", {"category": category, "daypart": daypart}
    if is_earliest:
        return "earliest_feasible", {"category": category}
    return "best_available", {"category": category, "daypart": daypart}
