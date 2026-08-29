from __future__ import annotations

from datetime import UTC, datetime

from hourwell_recsys.energy import BetaCell
from hourwell_recsys.insights import insights
from hourwell_recsys.repo import InMemoryRepo
from tests.conftest import USER, flat_cells


def test_heatmap_covers_48_cells_and_affinity_needs_a_peak() -> None:
    repo = InMemoryRepo()
    cells = flat_cells()
    repo.seed_cells(USER, cells)
    r = insights(USER, repo, now=datetime.now(UTC))
    assert len(r.heatmap) == 48 and r.affinities == [] and r.adherence == []
    assert all(c.ci[0] < c.mean < c.ci[1] for c in r.heatmap)
    peaked = [
        BetaCell(
            c.category, c.daypart, c.day_type, alpha0=c.alpha0, beta0=c.beta0, succ=8.0, fail=0.0
        )
        if (c.category, c.daypart, c.day_type) == ("deep", "MO", "weekday")
        else c
        for c in cells
    ]
    repo.seed_cells(USER, peaked)
    r2 = insights(USER, repo, now=datetime.now(UTC))
    assert any(
        a.state_ref == "beta:deep.MO.weekday" and a.key == "daypart_affinity" for a in r2.affinities
    )
    mo = next(
        c for c in r2.heatmap if (c.category, c.daypart, c.day_type) == ("deep", "MO", "weekday")
    )
    assert mo.n_effective == 8.0 and mo.mean > 0.7


# --- P9 (ADR-0013): beliefs, rung-2 flags, learning mode, labels in force ---------------------


def test_beliefs_one_per_category_day_type_with_label_and_rung2_flags() -> None:
    from datetime import timedelta

    from hourwell_recsys.repo import StoredLabel

    repo = InMemoryRepo()
    repo.seed_cells(USER, flat_cells())
    now = datetime.now(UTC)
    r = insights(USER, repo, now=now)
    assert len(r.beliefs) == 8 and r.learning_mode is True and r.labels == []
    assert all(b.affinity is False and b.personal is False for b in r.beliefs)  # flat prior
    assert all(c.personal is False for c in r.heatmap)
    # a label on the favoured cell shows up on the belief, flips it personal and clears the badge
    # for that (now the only active) cell
    repo.save_labels(
        USER,
        [
            StoredLabel("l0", "deep", "MO", "weekday", "correct", now - timedelta(days=2)),
            StoredLabel("l1", "deep", "MO", "weekday", "incorrect", now - timedelta(days=1)),
        ],
    )
    peaked = [
        BetaCell(
            c.category,
            c.daypart,
            c.day_type,
            alpha0=c.alpha0,
            beta0=c.beta0,
            succ=8.0,
            fail=0.0,
            last_event_at=now,
        )
        if (c.category, c.daypart, c.day_type) == ("deep", "MO", "weekday")
        else c
        for c in flat_cells()
    ]
    repo.seed_cells(USER, peaked)
    r2 = insights(USER, repo, now=now)
    deep_wd = next(b for b in r2.beliefs if (b.category, b.day_type) == ("deep", "weekday"))
    assert deep_wd.daypart == "MO" and deep_wd.affinity and deep_wd.personal
    assert deep_wd.label == "incorrect"  # the latest label in force
    assert r2.labels == [
        type(r2.labels[0])(
            state_ref="beta:deep.MO.weekday", label="incorrect", labeled_at=now - timedelta(days=1)
        )
    ]
    aff = next(a for a in r2.affinities if a.state_ref == "beta:deep.MO.weekday")
    assert aff.label == "incorrect" and aff.personal
    assert r2.learning_mode is False  # 1 active cell, personal (evidence 8 ≤ prior 8, but labelled)
