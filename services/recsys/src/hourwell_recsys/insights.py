"""/insights — Beta-cell posteriors for FR-40/FR-41 (specs/07 §5). `adherence` (PAR) is computed
by pre-registered code from events + recommendations only (spec-conflicts H2) and lands in P9;
the field is present and empty here so the contract is stable.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from hourwell_recsys.contexts import DAYPART_ORDER
from hourwell_recsys.energy import posterior
from hourwell_recsys.params import CONFIDENCE_SD_MAX, ENERGY_PEAK_FACTOR, INSIGHTS_CI_QUANTILES
from hourwell_recsys.repo import CATEGORIES, DAY_TYPES, Repo
from hourwell_recsys.schemas import Affinity, HeatmapCell, InsightsResponse


def insights(user_id: str, repo: Repo, *, now: datetime) -> InsightsResponse:
    cells = {c.key: c for c in repo.load_cells(user_id)}
    lo, hi = INSIGHTS_CI_QUANTILES
    heatmap: list[HeatmapCell] = []
    affinities: list[Affinity] = []
    for g in CATEGORIES:
        for dt in DAY_TYPES:
            posts = {}
            for dp in DAYPART_ORDER:
                cell = cells.get((g, dp.value, dt))
                if cell is None:
                    continue
                post = posterior(cell, now)
                posts[dp.value] = post
                heatmap.append(
                    HeatmapCell(
                        category=g,  # type: ignore[arg-type]
                        daypart=dp.value,
                        day_type=dt,  # type: ignore[arg-type]
                        mean=round(post.mean, 4),
                        ci=tuple(round(v, 4) for v in post.ci(lo, hi)),  # type: ignore[arg-type]
                        n_effective=round(post.n_effective, 3),
                    )
                )
            if not posts:
                continue
            best_dp, best = max(posts.items(), key=lambda kv: kv[1].mean)
            mean_all = float(np.mean([p.mean for p in posts.values()]))
            factor = best.mean / mean_all if mean_all > 0 else 0.0
            if factor >= ENERGY_PEAK_FACTOR:
                affinities.append(
                    Affinity(
                        key="daypart_affinity",
                        params={
                            "category": g,
                            "daypart": best_dp,
                            "day_type": dt,
                            "factor": round(factor, 2),
                        },
                        confidence=round(min(max(1 - best.sd / CONFIDENCE_SD_MAX, 0.0), 1.0), 3),
                        state_ref=f"beta:{g}.{best_dp}.{dt}",
                    )
                )
    return InsightsResponse(heatmap=heatmap, affinities=affinities, adherence=[])
