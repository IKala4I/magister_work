"""Expected ε-experiment rate per plan and per user-week under the P6 eligibility rule.

Owner decision 2026-08-26 (ADR-0008 §1): |A_m(x)| ∈ {2, 3, 4}, p = ε/|A_m(x)| per row. File 06
§2.3 computes MRT-slice power from "1 slot/day"; this script measures what the rule actually
yields on the service's own grid/eligibility code for a realistic task mix, so the thesis can
quote a measured rate (thesis-corrections). Mac-independent: pure combinatorics on the grid.

Usage (from services/recsys): uv run python scripts/experiment_rate.py
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from hourwell_recsys.contexts import buckets_for_grid
from hourwell_recsys.exploration import ExperimentCandidate, eligible_tasks
from hourwell_recsys.grid import BusyInterval, build_grid, feasible_starts
from hourwell_recsys.params import EXPERIMENT_MAX_DURATION_TICKS, TICK_MINUTES

TZ = ZoneInfo("Europe/Kyiv")
WEEKDAY_HOURS = {d: (540, 1080) for d in ("mon", "tue", "wed", "thu", "fri")}
DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180]  # FR-10 est_minutes mix (uniform draw)


def day_profile(name: str, busy_minutes: list[tuple[int, int]]) -> list[BusyInterval]:
    base = datetime(2026, 8, 26, tzinfo=TZ)  # Wednesday
    return [
        BusyInterval(
            (base + timedelta(minutes=s)).astimezone(UTC),
            (base + timedelta(minutes=e)).astimezone(UTC),
        )
        for s, e in busy_minutes
    ]


PROFILES = {
    "plain 09-18, no events": [],
    "two meetings (10:00-11:30, 15:00-16:00)": [(600, 690), (900, 960)],
    "heavy: 4 meetings (~3.5 h busy)": [(555, 630), (660, 720), (840, 930), (990, 1050)],
}


def bucket_count(duration_min: int, busy: list[BusyInterval], deadline_today: bool) -> int:
    grid = build_grid(
        plan_date=datetime(2026, 8, 26).date(),
        horizon="day",
        timezone="Europe/Kyiv",
        working_hours=WEEKDAY_HOURS,
        sleep_window=(1380, 420),
        busy=busy,
    )
    buckets = buckets_for_grid(grid, grid.occupied)
    d = max(1, -(-duration_min // TICK_MINUTES))
    starts = feasible_starts(grid, duration=d, earliest=None, deadline=None)
    return len({b.id for k in starts if (b := buckets[k]) is not None})


def main() -> None:
    rng = random.Random(2026)
    print("Per-duration reachable buckets |A(x)| on a plain 09-18 weekday (no busy time):")
    for dur in DURATIONS:
        n = bucket_count(dur, [], False)
        old = "eligible" if n >= 4 else "NOT eligible"
        new = "eligible" if n >= 2 else "NOT eligible"
        print(f"  {dur:>4} min: |A(x)| = {n}  — strict rule (≥4): {old:13s}  P6 rule (≥2): {new}")
    print()
    print(
        "P(plan has ≥1 eligible task) — task mix: uniform durations, 30 % with a same-day deadline"
    )
    print(
        "(critical ⇒ ineligible), 10 % pinned; 1000 sampled inboxes per size; ε = 1 ⇒ one draw per"
    )
    print("plan with ≥1 eligible task. Weekly rate = 5 weekday plans × P(eligible) (weekends off).")
    for profile, busy in PROFILES.items():
        busy_iv = day_profile(profile, busy)
        counts = {dur: bucket_count(dur, busy_iv, False) for dur in DURATIONS}
        print(f"  {profile}:")
        for n_tasks in (1, 2, 3, 5, 8):
            hits_old = hits_new = 0
            for _ in range(1000):
                cands = []
                for i in range(n_tasks):
                    dur = rng.choice(DURATIONS)
                    critical = rng.random() < 0.3
                    pinned = rng.random() < 0.1
                    nb = counts[dur]
                    cands.append(
                        ExperimentCandidate(
                            task_id=str(i),
                            duration=max(1, -(-dur // TICK_MINUTES)),
                            critical=critical,
                            pinned=pinned,
                            feasible_bucket_ids=tuple(f"b{j}" for j in range(nb)),
                        )
                    )
                if eligible_tasks(
                    cands, min_buckets=4, max_duration_ticks=EXPERIMENT_MAX_DURATION_TICKS
                ):
                    hits_old += 1
                if eligible_tasks(
                    cands, min_buckets=2, max_duration_ticks=EXPERIMENT_MAX_DURATION_TICKS
                ):
                    hits_new += 1
            p_old, p_new = hits_old / 1000, hits_new / 1000
            print(
                f"    {n_tasks} tasks: P(eligible) strict = {p_old:.2f} → {5 * p_old:.1f}/week;"
                f"  P6 rule = {p_new:.2f} → {5 * p_new:.1f}/week"
            )


if __name__ == "__main__":
    main()
