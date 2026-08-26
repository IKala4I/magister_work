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
