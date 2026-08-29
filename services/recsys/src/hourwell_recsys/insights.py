"""/insights — Beta-cell posteriors for FR-40/FR-41 (specs/07 §5) plus the P9 trust-surface
additions (ADR-0013): per-cell rung-2 `personal` flags, the learning-mode badge (§3.6), one
`belief` per (category, day_type) — the daypart the posterior favours, with the FR-41 label in
force — and the raw label states. `adherence` (PAR) is computed by pre-registered code from
events + recommendations only (spec-conflicts H2); it lives in the `insights` edge function, so
the field is present and empty here (the contract stays stable).
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from hourwell_recsys.contexts import DAYPART_ORDER
from hourwell_recsys.energy import is_personal, learning_mode, posterior
from hourwell_recsys.params import CONFIDENCE_SD_MAX, ENERGY_PEAK_FACTOR, INSIGHTS_CI_QUANTILES
from hourwell_recsys.repo import CATEGORIES, DAY_TYPES, Repo, latest_labels
from hourwell_recsys.schemas import (
    Affinity,
    Belief,
    HeatmapCell,
    InsightsResponse,
    LabelState,
)


def _confidence(sd: float) -> float:
    return round(min(max(1 - sd / CONFIDENCE_SD_MAX, 0.0), 1.0), 3)


def insights(user_id: str, repo: Repo, *, now: datetime) -> InsightsResponse:
    cells = {c.key: c for c in repo.load_cells(user_id)}
    current = {k: lab for k, lab in latest_labels(repo.load_labels(user_id)).items()}
    labeled = frozenset(k for k, lab in current.items() if lab.label != "none")
    lo, hi = INSIGHTS_CI_QUANTILES
    heatmap: list[HeatmapCell] = []
    affinities: list[Affinity] = []
    beliefs: list[Belief] = []
    for g in CATEGORIES:
        for dt in DAY_TYPES:
            posts = {}
            personal_flags = {}
            for dp in DAYPART_ORDER:
                cell = cells.get((g, dp.value, dt))
                if cell is None:
                    continue
                post = posterior(cell, now)
                posts[dp.value] = post
                personal_flags[dp.value] = is_personal(cell, now, labeled=cell.key in labeled)
                heatmap.append(
                    HeatmapCell(
                        category=g,  # type: ignore[arg-type]
                        daypart=dp.value,
                        day_type=dt,  # type: ignore[arg-type]
                        mean=round(post.mean, 4),
                        ci=tuple(round(v, 4) for v in post.ci(lo, hi)),  # type: ignore[arg-type]
                        n_effective=round(post.n_effective, 3),
                        personal=personal_flags[dp.value],
                    )
                )
            if not posts:
                continue
            best_dp, best = max(posts.items(), key=lambda kv: kv[1].mean)
            mean_all = float(np.mean([p.mean for p in posts.values()]))
            factor = best.mean / mean_all if mean_all > 0 else 0.0
            key = (g, best_dp, dt)
            label = current[key].label if key in current and current[key].label != "none" else None
            state_ref = f"beta:{g}.{best_dp}.{dt}"
            is_affinity = factor >= ENERGY_PEAK_FACTOR
            beliefs.append(
                Belief(
                    category=g,  # type: ignore[arg-type]
                    day_type=dt,  # type: ignore[arg-type]
                    daypart=best_dp,
                    mean=round(best.mean, 4),
                    factor=round(factor, 2),
                    confidence=_confidence(best.sd),
                    n_effective=round(best.n_effective, 3),
                    personal=personal_flags[best_dp],
                    affinity=is_affinity,
                    state_ref=state_ref,
                    label=label,  # type: ignore[arg-type]
                )
            )
            if is_affinity:
                affinities.append(
                    Affinity(
                        key="daypart_affinity",
                        params={
                            "category": g,
                            "daypart": best_dp,
                            "day_type": dt,
                            "factor": round(factor, 2),
                        },
                        confidence=_confidence(best.sd),
                        state_ref=state_ref,
                        label=label,  # type: ignore[arg-type]
                        personal=personal_flags[best_dp],
                    )
                )
    return InsightsResponse(
        heatmap=heatmap,
        affinities=affinities,
        adherence=[],
        beliefs=beliefs,
        learning_mode=learning_mode(cells.values(), now, labeled),
        labels=[
            LabelState(state_ref=lab.state_ref, label=lab.label, labeled_at=lab.labeled_at)  # type: ignore[arg-type]
            for lab in sorted(current.values(), key=lambda x: x.state_ref)
        ],
    )
