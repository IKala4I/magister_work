"""Demo Insights document for the app screenshots (рис. 3.4 and the poster) — NOT evidence.

The figure shows the interface, not a result: the person behind these numbers is invented. What
is real is the code path. The day-0 priors are the v0 prior table for a moderately morning (MM)
person with the default working hours (the same formula as the seed migration and
`instantiate_user_priors`), four weeks of invented outcomes go through `apply_reward`, and the
document is the service's own `insights()` builder over those cells. Only the 8-week adherence
trend is set by hand: in the system it is computed by the edge function from plan blocks and
focus facts that this script does not invent.

Usage (from services/recsys):
    uv run python scripts/screenshot_insights.py ../../apps/mobile/src/fixture/insights.json
"""

from __future__ import annotations

import json
import math
import sys
from datetime import UTC, datetime, timedelta

from hourwell_recsys.energy import BetaCell, apply_reward
from hourwell_recsys.insights import insights
from hourwell_recsys.repo import InMemoryRepo

USER = "screenshot-fixture"
# The fixture clock: Friday 30 October 2026, 09:41 in Kyiv (UTC+2 in winter time).
NOW = datetime(2026, 10, 30, 7, 41, tzinfo=UTC)

# v0 prior table (supabase/migrations/20260824120300_seed_prior_cells_v0.sql), MM column.
ANCHOR_MM = {"EM": 0.70, "MO": 0.72, "MD": 0.52, "AF": 0.58, "EV": 0.48, "NT": 0.36}
CATEGORY = {  # gamma, delta, delta_af
    "deep": (1.00, 0.00, 0.00),
    "admin": (0.45, 0.25, 0.00),
    "physical": (0.55, 0.10, 0.35),
    "learning": (0.85, -0.05, 0.00),
}
# Default working hours Mon–Fri 09:00–18:00 → in-hours weekday cells (seed-migration rule: at
# least half of the daypart inside the window on most days). No weekend hours.
IN_HOURS_WEEKDAY = {"MO", "MD", "AF"}

# The invented person: how often a block in each cell gets done, and how many blocks of each
# kind four weeks of use put there. Mornings carry deep work; the early afternoon dips; learning
# goes better in the evening than the morning prior expects.
TRUE_RATE = {
    "deep": {"EM": 0.55, "MO": 0.86, "MD": 0.55, "AF": 0.40, "EV": 0.50, "NT": 0.30},
    "admin": {"EM": 0.60, "MO": 0.70, "MD": 0.78, "AF": 0.74, "EV": 0.55, "NT": 0.40},
    "physical": {"EM": 0.80, "MO": 0.60, "MD": 0.50, "AF": 0.62, "EV": 0.78, "NT": 0.40},
    "learning": {"EM": 0.45, "MO": 0.58, "MD": 0.50, "AF": 0.48, "EV": 0.80, "NT": 0.52},
}
BLOCKS_WEEKDAY = {
    "deep": {"EM": 2, "MO": 18, "MD": 5, "AF": 10, "EV": 3, "NT": 0},
    "admin": {"EM": 0, "MO": 8, "MD": 10, "AF": 12, "EV": 2, "NT": 0},
    "physical": {"EM": 4, "MO": 0, "MD": 2, "AF": 2, "EV": 9, "NT": 0},
    "learning": {"EM": 0, "MO": 5, "MD": 4, "AF": 3, "EV": 10, "NT": 2},
}
WEEKEND_SHARE = 0.35  # weekends see about a third as many blocks per cell


def prior_mu(category: str, daypart: str, day_type: str) -> float:
    gamma, delta, delta_af = CATEGORY[category]
    a = ANCHOR_MM[daypart]
    z = gamma * math.log(a / (1 - a)) + delta + (delta_af if daypart == "AF" else 0.0)
    mu = 1 / (1 + math.exp(-z))
    return mu if day_type == "weekday" else 0.5 * mu + 0.5 * 0.55


def cell(category: str, daypart: str, day_type: str) -> BetaCell:
    base = 8.0 if day_type == "weekday" else 4.0
    in_hours = day_type == "weekday" and daypart in IN_HOURS_WEEKDAY
    n0 = base * (1.0 if in_hours else 0.5)
    mu = prior_mu(category, daypart, day_type)
    c = BetaCell(category, daypart, day_type, alpha0=n0 * mu, beta0=n0 * (1 - mu))
    n = BLOCKS_WEEKDAY[category][daypart]
    if day_type == "weekend":
        n = round(n * WEEKEND_SHARE)
    successes = round(n * TRUE_RATE[category][daypart])
    # spread the outcomes evenly over 28 days, successes interleaved (deterministic)
    for i in range(n):
        at = NOW - timedelta(days=28) + timedelta(days=28 * (i + 0.5) / max(n, 1))
        done = (i + 1) * successes // n > i * successes // n
        c = apply_reward(c, 1.0 if done else 0.0, at)
    return c


def main(out_path: str) -> None:
    repo = InMemoryRepo()
    repo.seed_cells(
        USER,
        [cell(g, dp, dt) for g in CATEGORY for dp in ANCHOR_MM for dt in ("weekday", "weekend")],
    )
    doc = insights(USER, repo, now=NOW).model_dump(mode="json")
    # Hand-set (see the module docstring): eight ISO weeks ending with the current one.
    doc["adherence"] = [
        {"week": f"2026-W{w}", "par": par, "n": n}
        for w, par, n in zip(
            range(37, 45),
            (0.48, 0.52, 0.50, 0.57, 0.61, 0.59, 0.66, 0.69),
            (14, 17, 16, 19, 18, 20, 19, 9),
            strict=True,
        )
    ]
    doc["chronotype_class"] = "MM"
    doc["survey_skipped"] = False
    doc["generated_at"] = NOW.isoformat().replace("+00:00", "Z")
    doc.pop("affinities", None)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(
        f"{out_path}: {len(doc['heatmap'])} cells, {len(doc['beliefs'])} beliefs, "
        f"learning_mode={doc['learning_mode']}"
    )
    for b in doc["beliefs"]:
        print(
            f"  {b['category']:<9}{b['day_type']:<8}{b['daypart']}  mean={b['mean']:.2f} "
            f"factor={b['factor']:.2f} conf={b['confidence']:.2f} personal={b['personal']} "
            f"affinity={b['affinity']}"
        )


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "insights.json")
